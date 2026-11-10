import { randomUUID, X509Certificate } from 'node:crypto';
import type pg from 'pg';
import type { Account } from './auth.ts';
import { pool, transaction } from './db/postgres.ts';
import { decrypt, encrypt, token } from './security.ts';
import { InputError, integer, password, secret as secretValue, segment, text, uuid } from './validation.ts';
import { hostname, resolveBroker } from './network.ts';
import { activeStatuses, capabilities } from './mqtt/lifecycle.ts';
import { probeBroker, probeConnection, probeClientConnection } from './mqtt/probe.ts';
import { probeConnectionError } from './mqtt/probe-errors.ts';
import { deleteResource } from './deletion.ts';
import { occupancyTimeoutSeconds } from './mqtt/occupancy.ts';

async function audit(db: pg.PoolClient, user: Account, action: string, id?: string) {
	await db.query(
		'INSERT INTO kage_audit_logs(tenant_id,user_id,action,resource_id) VALUES ($1,$2,$3,$4)',
		[user.tenant_id, user.id, action, id || null]
	);
}

export async function dashboard(user: Account) {
	const tenant = [user.tenant_id];
	// Pair responses have no node_id until pairing completes. Their MQTT topic
	// identifies the MAC. Keep the latest decision across hubs for each node.
	const visibleCommands = `WITH latest_pair_responses AS (
		SELECT DISTINCT ON (upper(split_part(topic,'/',6))) id
		FROM kage_commands WHERE tenant_id=$1 AND kind='pair_response'
		ORDER BY upper(split_part(topic,'/',6)),created_at DESC,id DESC
	), visible_commands AS (
		SELECT c.* FROM kage_commands c WHERE c.tenant_id=$1
		AND (c.kind<>'pair_response' OR (
			c.id IN (SELECT id FROM latest_pair_responses)
			AND NOT EXISTS (
				SELECT 1 FROM kage_nodes n WHERE n.tenant_id=c.tenant_id AND n.paired
				AND n.mac_address=upper(split_part(c.topic,'/',6))
			)
		))
	)`;
	const queries = {
		brokers: `SELECT id,name,hostname,port,tls,username,acl_confirmed,enabled,ca_certificate,
			CASE WHEN connection_state='connected' AND last_seen<now()-interval '30 seconds' THEN 'unknown' ELSE connection_state END AS connection_state,last_seen
			FROM kage_mqtt_brokers WHERE tenant_id=$1 ORDER BY name`,
		hubs: `SELECT h.id,h.tenant_id,h.broker_id,h.hub_id,h.name,h.last_seen,
			CASE WHEN b.enabled AND b.acl_confirmed AND b.connection_state='connected' AND b.last_seen>now()-interval '30 seconds' THEN h.connection_state ELSE 'unknown' END AS connection_state,
			b.name AS broker_name,d.status AS credential_status,d.username,d.connection_verified_at,
			(SELECT count(*) FROM kage_nodes n WHERE n.tenant_id=h.tenant_id AND n.hub_id=h.id AND n.paired) AS node_count
			FROM kage_hubs h JOIN kage_mqtt_brokers b ON b.tenant_id=h.tenant_id AND b.id=h.broker_id
			JOIN kage_device_credentials d ON d.tenant_id=h.tenant_id AND d.hub_id=h.id WHERE h.tenant_id=$1 ORDER BY h.name`,
		clients: `SELECT c.*,h.hub_id AS hub_code,d.status AS credential_status,d.username,d.connection_verified_at,m.node_id,
			CASE WHEN NOT b.enabled OR NOT b.acl_confirmed OR b.connection_state<>'connected' OR b.last_seen IS NULL OR b.last_seen<now()-interval '30 seconds' THEN 'unknown'
                WHEN c.connection_state='offline' THEN 'offline'
                WHEN c.connection_state='online' AND c.presence_seen_at>now()-interval '60 seconds' THEN 'online' ELSE 'unknown' END AS connection_state,
            CASE WHEN c.connection_state='online' AND c.presence_seen_at>now()-interval '60 seconds'
                AND b.enabled AND b.acl_confirmed AND b.connection_state='connected' AND b.last_seen>now()-interval '30 seconds' THEN c.security_state ELSE 'unknown' END AS security_state
			FROM kage_clients c JOIN kage_hubs h ON h.tenant_id=c.tenant_id AND h.id=c.hub_id
			JOIN kage_mqtt_brokers b ON b.tenant_id=c.tenant_id AND b.id=c.broker_id
			JOIN kage_device_credentials d ON d.tenant_id=c.tenant_id AND d.client_id=c.id
			LEFT JOIN kage_node_client_mappings m ON m.tenant_id=c.tenant_id AND m.client_id=c.id WHERE c.tenant_id=$1 ORDER BY c.name`,
		nodes: `SELECT n.*,h.hub_id AS hub_code,m.client_id,c.pc_id,
			CASE WHEN n.paired AND h.connection_state='online' AND b.enabled AND b.acl_confirmed AND b.connection_state='connected'
			AND b.last_seen>now()-interval '30 seconds'
			AND n.last_seen>now()-interval '${occupancyTimeoutSeconds} seconds'
			THEN n.occupancy ELSE 'unknown' END AS occupancy FROM kage_nodes n
			JOIN kage_hubs h ON h.tenant_id=n.tenant_id AND h.id=n.hub_id
			JOIN kage_mqtt_brokers b ON b.tenant_id=h.tenant_id AND b.id=h.broker_id
			LEFT JOIN kage_node_client_mappings m ON m.tenant_id=n.tenant_id AND m.node_id=n.id
			LEFT JOIN kage_clients c ON c.tenant_id=m.tenant_id AND c.id=m.client_id WHERE n.tenant_id=$1 ORDER BY n.mac_address`,
		pairing: `SELECT p.*,h.hub_id AS hub_code FROM kage_pairing_requests p JOIN kage_hubs h ON h.tenant_id=p.tenant_id AND h.id=p.hub_id WHERE p.tenant_id=$1 ORDER BY p.last_seen DESC LIMIT 100`,
		commands: `${visibleCommands}
			SELECT id,kind,status,client_id,node_id,created_at,expires_at,published_at,report
			FROM visible_commands ORDER BY created_at DESC,id DESC LIMIT 100`,
		queued_actions: `${visibleCommands}
			SELECT id,kind,client_id,node_id,broker_id,created_at,expires_at,
			count(*) OVER()::integer AS total_count
			FROM visible_commands WHERE tenant_id=$1 AND status='queued' AND expires_at>now()
			ORDER BY created_at ASC,id ASC LIMIT 5`,
		events: `SELECT id,kind,detail,created_at FROM kage_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`,
		audit: `SELECT id,action,resource_id,created_at FROM kage_audit_logs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`,
		policies: `SELECT enabled,action,delay_seconds,allow_extension,extension_duration_seconds,maximum_extensions,
			client_disconnect_timeout_seconds,offline_enabled,offline_action,allow_recovery_code,inactivity_monitoring_enabled,
			inactivity_timeout_seconds,confirmation_timeout_seconds FROM kage_security_policies WHERE tenant_id=$1`
	};
	const entries = await Promise.all(Object.entries(queries).map(async ([key, sql]) => [key, (await pool.query(sql, tenant)).rows] as const));
	const result = Object.fromEntries(entries);
	result.brokers = result.brokers.map((broker) => {
		let ca_certificate_expires_at: string | null = null;

		if (broker.ca_certificate) {
			try {
				ca_certificate_expires_at = new Date(new X509Certificate(broker.ca_certificate).validTo).toISOString();
			} catch {
				// Keep saved certificate downloads available even if metadata cannot be read.
			}
		}

		return { ...broker, ca_certificate_expires_at };
	});

	return result;
}

export async function manage(user: Account, resource: string, input: Record<string, unknown>) {
	if (user.role !== 'admin') throw new InputError('Administrator access required', 403);

	const tenant = user.tenant_id;

	if (resource === 'clients' && input.action === 'test_connection') {
		const id = uuid(input.id);
		const device = (
			await pool.query(
				`SELECT c.pc_id,c.capabilities,h.hub_id,b.id AS broker_id,b.hostname,b.port,b.tls,
				b.username,b.password_encrypted,b.ca_certificate,b.enabled,b.acl_confirmed,d.status
				FROM kage_clients c
				JOIN kage_hubs h ON h.tenant_id=c.tenant_id AND h.id=c.hub_id
				JOIN kage_mqtt_brokers b ON b.tenant_id=c.tenant_id AND b.id=c.broker_id
				JOIN kage_device_credentials d ON d.tenant_id=c.tenant_id AND d.client_id=c.id
				WHERE c.tenant_id=$1 AND c.id=$2`,
				[tenant, id]
			)
		).rows[0];

		if (!device) throw new InputError('Client not found', 404);
		if (device.status !== 'admin_confirmed') {
			throw new InputError('Confirm the client’s external provisioning before testing its connection.');
		}
		if (!device.enabled) throw new InputError('Enable the broker before testing this Client.');
		if (!device.acl_confirmed) {
			throw new InputError("Pass the broker's device permissions test before testing this Client.");
		}
		if (!Array.isArray(device.capabilities) || !device.capabilities.includes('connection_test_v1')) {
			throw new InputError('Update and reconnect the KAGE Client to enable connection testing.');
		}

		const address = await resolveBroker(device.hostname, device.tls);
		const result = await probeClientConnection(
			{
				protocol: device.tls ? 'mqtts' : 'mqtt',
				hostname: address.address,
				port: device.port,
				username: device.username,
				password: decrypt(device.password_encrypted, `${tenant}:${device.broker_id}`),
				ca: device.ca_certificate || undefined,
				rejectUnauthorized: true,
				servername: device.hostname
			},
			{ hub: device.hub_id, pc: device.pc_id }
		);
		await transaction((db) => audit(db, user, 'client.test_connection', id));

		return {
			latency_ms: result.latencyMs,
			message: `Client replied in ${result.latencyMs} ms.`
		};
	}

	if (input.action === 'delete' && ['brokers', 'hubs', 'clients', 'nodes'].includes(resource)) {
		const id = uuid(input.id);

		return transaction(async (db) => {
			const message = await deleteResource(db, tenant, resource, id);
			await audit(
				db,
				user,
				`${resource === 'brokers' ? 'broker' : resource.slice(0, -1)}.delete`,
				id
			);

			return { ok: true, message };
		});
	}

	if (resource === 'brokers' && input.action === 'create') {
		const id = randomUUID();
		const host = hostname(input.hostname);
		const tls = input.tls !== false;
		await resolveBroker(host, tls);
		const secret = secretValue(input.password, 'broker password');
		await transaction(async (db) => {
			await db.query(
				`INSERT INTO kage_mqtt_brokers(id,tenant_id,name,hostname,port,tls,username,password_encrypted,ca_certificate)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				[
					id,
					tenant,
					text(input.name, 'name'),
					host,
					integer(input.port, 1, 65535),
					tls,
					text(input.username, 'username'),
					encrypt(secret, `${tenant}:${id}`),
					input.ca_certificate ? text(input.ca_certificate, 'CA certificate', 16384) : null
				]
			);
			await audit(db, user, 'broker.create', id);
		});

		return { id };
	}

	if (
		resource === 'brokers' &&
		['test_connection', 'test_acl', 'confirm_acl'].includes(String(input.action))
	) {
		const connectionOnly = input.action === 'test_connection';
		const id = uuid(input.id);
		const result = await transaction(async (db) => {
			const broker = (
				await db.query('SELECT * FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
					tenant,
					id
				])
			).rows[0];

			if (!broker) throw new InputError('Broker not found', 404);
			if (!broker.enabled) throw new InputError('Enable this broker before testing it.');

			try {
				const address = await resolveBroker(broker.hostname, broker.tls).catch((error) => {
					if (error instanceof InputError) throw error;

					throw probeConnectionError(
						error,
						{
							hostname: broker.hostname,
							port: broker.port,
							protocol: broker.tls ? 'mqtts' : 'mqtt',
							protocolVersion: connectionOnly ? 4 : 5
						},
						'Server',
						'DNS lookup'
					);
				});
				const options = {
					protocol: broker.tls ? ('mqtts' as const) : ('mqtt' as const),
					hostname: address.address,
					port: broker.port,
					username: broker.username,
					password: decrypt(broker.password_encrypted, `${tenant}:${id}`),
					ca: broker.ca_certificate || undefined,
					rejectUnauthorized: true,
					servername: broker.hostname
				};

				if (connectionOnly) {
					await probeConnection(options);
					await audit(db, user, 'broker.test_connection', id);

					return {
						ok: true,
						message: 'Connection successful.'
					};
				}

				const device = (
					await db.query(
						`SELECT d.id,d.username,d.token_encrypted,COALESCE(h.hub_id,ch.hub_id) AS hub_code,c.pc_id
						FROM kage_device_credentials d
						LEFT JOIN kage_hubs h ON h.tenant_id=d.tenant_id AND h.id=d.hub_id
						LEFT JOIN kage_clients c ON c.tenant_id=d.tenant_id AND c.id=d.client_id
						LEFT JOIN kage_hubs ch ON ch.tenant_id=c.tenant_id AND ch.id=c.hub_id
						WHERE d.tenant_id=$1 AND d.broker_id=$2 AND d.status<>'revoked'
						ORDER BY (d.status='admin_confirmed') DESC,d.id LIMIT 1`,
						[tenant, id]
					)
				).rows[0];

				if (!device) {
					throw new InputError('Register a Hub or Client and provision its credentials and ACL on the broker, then run this test.');
				}

				const tested = await probeBroker(options, {
					username: device.username,
					password: decrypt(device.token_encrypted, `${tenant}:${device.id}`),
					hub: device.hub_code,
					pc: device.pc_id
				});
				await db.query(
					'UPDATE kage_mqtt_brokers SET acl_confirmed=true,updated_at=now() WHERE tenant_id=$1 AND id=$2',
					[tenant, id]
				);
				await audit(db, user, 'broker.test_acl', id);

				return {
					ok: true,
					message: `Device permission test passed for ${tested.username}: messages delivered in both directions${tested.isolationChecked ? ' and cross-device publish denied' : ', including Hub startup ping topics'}. See the ? help for test coverage.`
				};
			} catch (error) {
				// Commit the failed result so a previously successful test cannot leave
				// a broken broker authorized for the worker.
				if (!connectionOnly) {
					await db.query(
						'UPDATE kage_mqtt_brokers SET acl_confirmed=false,updated_at=now() WHERE tenant_id=$1 AND id=$2',
						[tenant, id]
					);
				}

				await audit(
					db,
					user,
					connectionOnly ? 'broker.test_connection_failed' : 'broker.test_acl_failed',
					id
				);

				return {
					ok: false,
					message:
						error instanceof InputError
							? error.message
							: 'MQTT test could not start. Check the broker configuration and saved credentials.'
				};
			}
		});

		if (!result.ok) throw new InputError(result.message);

		return result;
	}

	return transaction(async (db) => {
		if (resource === 'brokers') {
			const id = uuid(input.id);
			const broker = (
				await db.query('SELECT id FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
					tenant,
					id
				])
			).rows[0];

			if (!broker) throw new InputError('Broker not found', 404);

			if (input.action === 'toggle') {
				await db.query(
					'UPDATE kage_mqtt_brokers SET enabled=NOT enabled,updated_at=now() WHERE tenant_id=$1 AND id=$2',
					[tenant, id]
				);
			}
			else if (input.action === 'credentials') {
				const username = text(input.username, 'username');

				if (
					(
						await db.query(
							'SELECT 1 FROM kage_device_credentials WHERE tenant_id=$1 AND broker_id=$2 AND username=$3',
							[tenant, id, username]
						)
					).rowCount
				) {
					throw new InputError('Server and device MQTT identities must be separate');
				}

				await db.query(
					'UPDATE kage_mqtt_brokers SET username=$3,password_encrypted=$4,acl_confirmed=false,updated_at=now() WHERE tenant_id=$1 AND id=$2',
					[
						tenant,
						id,
						username,
						encrypt(secretValue(input.password, 'password'), `${tenant}:${id}`)
					]
				);
			} else {
				throw new InputError('Unsupported broker action');
			}

			await audit(db, user, `broker.${input.action}`, id);

			return { ok: true };
		}

		if (resource === 'hubs' || resource === 'clients') {
			const isHub = resource === 'hubs';

			if (input.action === 'create') {
				if (!isHub && Boolean(input.username) !== Boolean(input.token)) {
					throw new InputError('Provide both the MQTT username and token, or leave both blank to generate credentials.');
				}

				const id = randomUUID();
				let brokerId: string;
				const code = segment(isHub ? input.hub_id : input.pc_id);

				if (isHub) {
					brokerId = uuid(input.broker_id);
					if (
						!(
							await db.query('SELECT id FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2', [
								tenant,
								brokerId
							])
						).rowCount
					) {
						throw new InputError('Broker not found', 404);
					}

					await db.query(
						'INSERT INTO kage_hubs(id,tenant_id,broker_id,hub_id,name) VALUES ($1,$2,$3,$4,$5)',
						[id, tenant, brokerId, code, text(input.name, 'name')]
					);
				} else {
					const hub = (
						await db.query('SELECT id,broker_id FROM kage_hubs WHERE tenant_id=$1 AND id=$2', [
							tenant,
							uuid(input.hub_id)
						])
					).rows[0];

					if (!hub) throw new InputError('Hub not found', 404);

					brokerId = hub.broker_id;
					await db.query(
						'INSERT INTO kage_clients(id,tenant_id,broker_id,hub_id,pc_id,name) VALUES ($1,$2,$3,$4,$5,$6)',
						[id, tenant, brokerId, hub.id, code, text(input.name, 'name')]
					);
					await db.query('INSERT INTO kage_device_states(tenant_id,client_id) VALUES ($1,$2)', [
						tenant,
						id
					]);
				}

				const secret = input.token ? secretValue(input.token, 'device token', 256) : token();
				const usesExistingToken = Boolean(input.token);
				const username = isHub ? code : input.username ? segment(input.username) : `pc-${id}`;
				const broker = (
					await db.query(
						'SELECT username FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2 FOR NO KEY UPDATE',
						[tenant, brokerId]
					)
				).rows[0];

				if (username === broker.username) {
					throw new InputError('Server and device MQTT identities must be separate');
				}

				const credentialId = randomUUID();
				await db.query(
					`INSERT INTO kage_device_credentials(id,tenant_id,broker_id,hub_id,client_id,username,token_encrypted)
					VALUES ($1,$2,$3,$4,$5,$6,$7)`,
					[
						credentialId,
						tenant,
						brokerId,
						isHub ? id : null,
						isHub ? null : id,
						username,
						encrypt(secret, `${tenant}:${credentialId}`)
					]
				);
				await audit(db, user, `${isHub ? 'hub' : 'client'}.create`, id);

				return {
					id,
					username,
					token: usesExistingToken ? undefined : secret,
					status: 'generated',
					message: usesExistingToken
						? `${isHub ? 'Hub' : 'Client'} registered. Configure its credentials and ACL on the external broker before confirming provisioning.`
						: 'Save this token now. Configure it and its ACL on the external broker before confirming provisioning.'
				};
			}

			const id = uuid(input.id);
			const credential = (
				await db.query(
					`SELECT * FROM kage_device_credentials WHERE tenant_id=$1 AND ${isHub ? 'hub_id' : 'client_id'}=$2 FOR UPDATE`,
					[tenant, id]
				)
			).rows[0];

			if (!credential) throw new InputError('Device not found', 404);

			let secret: string | undefined;

			if (input.action === 'rotate') {
				secret = token();
				await db.query(
					"UPDATE kage_device_credentials SET token_encrypted=$3,status='generated',connection_verified_at=NULL,rotated_at=now() WHERE tenant_id=$1 AND id=$2",
					[tenant, credential.id, encrypt(secret, `${tenant}:${credential.id}`)]
				);
			} else if (input.action === 'revoke' || input.action === 'confirm') {
				await db.query(
					'UPDATE kage_device_credentials SET status=$3,connection_verified_at=NULL WHERE tenant_id=$1 AND id=$2',
					[tenant, credential.id, input.action === 'revoke' ? 'revoked' : 'admin_confirmed']
				);
			} else {
				throw new InputError('Unsupported device action');
			}

			await db.query('UPDATE kage_mqtt_brokers SET updated_at=now() WHERE tenant_id=$1 AND id=$2', [
				tenant,
				credential.broker_id
			]);
			await audit(db, user, `credential.${input.action}`, id);

			return {
				username: credential.username,
				token: secret,
				message: 'Update the credentials on the external broker separately. When revoking credentials, also disconnect existing device sessions.'
			};
		}

		if (resource === 'mappings') {
			const clientId = uuid(input.client_id);
			const client = (
				await db.query(
					'SELECT id,hub_id FROM kage_clients WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
					[tenant, clientId]
				)
			).rows[0];

			if (!client) throw new InputError('Client not found', 404);

			if (input.node_id) {
				const nodeId = uuid(input.node_id);
				const node = (
					await db.query(
						'SELECT id,hub_id,paired FROM kage_nodes WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
						[tenant, nodeId]
					)
				).rows[0];

				if (!node?.paired || node.hub_id !== client.hub_id) {
					throw new InputError("Choose a paired Node on the Client's Hub");
				}

				await db.query(
					'DELETE FROM kage_node_client_mappings WHERE tenant_id=$1 AND client_id=$2',
					[tenant, clientId]
				);
				await db.query(
					'INSERT INTO kage_node_client_mappings(tenant_id,node_id,client_id) VALUES ($1,$2,$3)',
					[tenant, nodeId, clientId]
				);
			} else {
				await db.query(
					'DELETE FROM kage_node_client_mappings WHERE tenant_id=$1 AND client_id=$2',
					[tenant, clientId]
				);
			}

			await db.query(
				'UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id=$2',
				[tenant, clientId]
			);
			await audit(db, user, 'mapping.update', clientId);

			return { ok: true };
		}

		if (resource === 'pairing') {
			const id = uuid(input.id);
			const row = (
				await db.query(
					`SELECT p.*,h.hub_id AS hub_code,h.broker_id FROM kage_pairing_requests p JOIN kage_hubs h ON h.tenant_id=p.tenant_id AND h.id=p.hub_id
				WHERE p.tenant_id=$1 AND p.id=$2 AND p.expires_at>now() AND p.status IN ('pending','approved') FOR UPDATE OF p`,
					[tenant, id]
				)
			).rows[0];

			if (!row) throw new InputError('Request unavailable or expired', 409);

			const accept = input.action === 'approve';

			if (!accept && input.action !== 'reject') throw new InputError('Invalid decision');

			await db.query('UPDATE kage_pairing_requests SET status=$3 WHERE tenant_id=$1 AND id=$2', [
				tenant,
				id,
				accept ? 'approved' : 'rejected'
			]);
			await db.query(
				"UPDATE kage_commands SET status='expired' WHERE tenant_id=$1 AND broker_id=$2 AND topic=$3 AND status='queued'",
				[
					tenant,
					row.broker_id,
					`kage/hub/live/${row.hub_code}/${row.kind === 'pair' ? 'pairing' : 'unpair'}_response/${row.mac_address}`
				]
			);
			await db.query(
				`INSERT INTO kage_commands(tenant_id,broker_id,kind,topic,payload,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
				[
					tenant,
					row.broker_id,
					`${row.kind}_response`,
					`kage/hub/live/${row.hub_code}/${row.kind === 'pair' ? 'pairing' : 'unpair'}_response/${row.mac_address}`,
					JSON.stringify(accept ? 'accept' : 'reject'),
					row.expires_at
				]
			);
			await audit(db, user, `pairing.${input.action}`, id);

			return { ok: true, message: 'Decision queued. Wait for the Hub to confirm completion.' };
		}

		if (resource === 'nodes') {
			const id = uuid(input.id);
			const node = (
				await db.query(
					'SELECT n.*,h.broker_id FROM kage_nodes n JOIN kage_hubs h ON h.id=n.hub_id AND h.tenant_id=n.tenant_id WHERE n.tenant_id=$1 AND n.id=$2',
					[tenant, id]
				)
			).rows[0];

			if (!node) throw new InputError('Node not found', 404);

			if (input.action === 'identify') {
				if (!node.paired) throw new InputError('Pair this Node before identifying it.');

				const hub = (
					await db.query(
						`SELECT h.hub_id FROM kage_hubs h
						JOIN kage_device_credentials d ON d.tenant_id=h.tenant_id AND d.hub_id=h.id
						JOIN kage_mqtt_brokers b ON b.tenant_id=h.tenant_id AND b.id=h.broker_id
						WHERE h.tenant_id=$1 AND h.id=$2 AND d.status='admin_confirmed'
						AND b.enabled AND b.acl_confirmed`,
						[tenant, node.hub_id]
					)
				).rows[0];

				if (!hub) {
					throw new InputError('Confirm Hub provisioning and enable a broker with a passed permission test.');
				}

				const commandId = randomUUID();
				const deadline = Math.floor(Date.now() / 1000) + 30;
				await db.query(
					`INSERT INTO kage_commands(id,tenant_id,broker_id,node_id,kind,topic,payload,version,expires_at)
					VALUES ($1,$2,$3,$4,'identify',$5,$6,1,to_timestamp($7))`,
					[
						commandId,
						tenant,
						node.broker_id,
						id,
						`kage/hub/live/${hub.hub_id}/identify`,
						{ version: 1, command_id: commandId, mac_address: node.mac_address, deadline },
						deadline
					]
				);
				await audit(db, user, 'node.identify', id);

				return {
					id: commandId,
					message: 'Node LED test queued. Check Recent commands for the Hub dispatch result.'
				};
			}

			if (input.action !== 'unpair' || !node.paired) {
				throw new InputError('Unsupported Node action');
			}

			await db.query(
				`INSERT INTO kage_pairing_requests(tenant_id,hub_id,mac_address,kind) VALUES ($1,$2,$3,'unpair')
				ON CONFLICT(hub_id,mac_address,kind) DO UPDATE SET status='pending',last_seen=now(),expires_at=now()+interval '15 minutes'`,
				[tenant, node.hub_id, node.mac_address]
			);
			await audit(db, user, 'node.unpair.request', id);

			return { message: 'Unpair request created. Approve it in Pairing.' };
		}

		if (resource === 'commands') {
			const clientId = uuid(input.client_id);
			const kind = text(input.command, 'command');

			if (
				!['force_lock', 'force_logout', 'cancel_force_lock', 'cancel_force_logout', 'cancel_auto_lock', 'cancel_auto_logout'].includes(kind)
			) {
				throw new InputError('Unsupported Client command');
			}

			const client = (
				await db.query(
					`SELECT c.*,h.hub_id AS hub_code FROM kage_clients c JOIN kage_hubs h ON h.tenant_id=c.tenant_id AND h.id=c.hub_id
				JOIN kage_device_credentials d ON d.client_id=c.id AND d.tenant_id=c.tenant_id
				WHERE c.tenant_id=$1 AND c.id=$2 AND d.status='admin_confirmed' FOR UPDATE OF c`,
					[tenant, clientId]
				)
			).rows[0];

			if (!client) throw new InputError('Client unavailable or credentials not provisioned', 409);
			if (
				client.protocol_version !== 1 ||
				!capabilities.every((c) => client.capabilities.includes(c))
			) {
				throw new InputError('Connect a Client supporting command lifecycle v1 before issuing commands', 409);
			}

			const seconds = integer(input.delay_seconds ?? 30, 0, 3600);
			const target = (
				await db.query(
					`SELECT id,payload FROM kage_commands WHERE tenant_id=$1 AND client_id=$2
                AND version=$3 AND status=ANY($4::text[]) AND expires_at>now()`,
					[tenant, clientId, client.command_version, activeStatuses]
				)
			).rows[0];

			if (kind.startsWith('cancel_') && (!target || target.payload.command !== kind.slice(7))) {
				throw new InputError('No matching active command to cancel', 409);
			}

			const commandId = randomUUID();
			const version = Number(client.command_version) + 1;

			if (!Number.isSafeInteger(version)) throw new InputError('Command version exhausted', 409);

			const expiry = new Date(Date.now() + (seconds + 30) * 1000);
			const payload = {
				protocol_version: 1,
				command_id: commandId,
				version,
				expires_at_utc: expiry.toISOString(),
				target_command_id: kind.startsWith('cancel_') ? target.id : null,
				target_deadline_utc: kind.startsWith('cancel_') ? target.payload.deadline_utc : null,
				command: kind,
				priority: 100,
				deadline_utc: new Date(Date.now() + seconds * 1000).toISOString(),
				server_time_utc: new Date().toISOString(),
				message: 'Administrator requested this operation.',
				allow_extension: false,
				allow_cancellation: false
			};
			await db.query(
				"UPDATE kage_commands SET status='superseded' WHERE tenant_id=$1 AND client_id=$2 AND status IN ('queued','dispatching','published','received','unconfirmed')",
				[tenant, clientId]
			);
			const result = await db.query(
				`INSERT INTO kage_commands(tenant_id,broker_id,client_id,kind,topic,payload,expires_at,id,version)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
				[
					tenant,
					client.broker_id,
					clientId,
					kind,
					`kage/client/${client.hub_code}/${client.pc_id}/command`,
					payload,
					expiry,
					commandId,
					version
				]
			);
			await audit(db, user, 'command.create', result.rows[0].id);
			await db.query('UPDATE kage_clients SET command_version=$3 WHERE tenant_id=$1 AND id=$2', [
				tenant,
				clientId,
				version
			]);
			await db.query(
				'UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id=$2',
				[tenant, clientId]
			);

			return {
				id: result.rows[0].id,
				message: 'Queued. Delivery and Windows execution are tracked separately.'
			};
		}

		if (resource === 'policies') {
			const boolean = (value: unknown) => {
				if (typeof value !== 'boolean') throw new InputError('Expected a boolean');

				return value;
			};

			if (input.action === 'toggle') {
				const value = boolean(input.value);
				const columns = {
					automatic: 'enabled',
					extension: 'allow_extension',
					offline: 'offline_enabled',
					activity: 'inactivity_monitoring_enabled'
				} as const;
				const section = String(input.policy);

				if (!Object.hasOwn(columns, section)) throw new InputError('Invalid policy');

				const column = columns[section as keyof typeof columns];
				await db.query(`UPDATE kage_security_policies SET ${column}=$2 WHERE tenant_id=$1`, [
					tenant,
					value
				]);
				await audit(db, user, 'policy.update');
				if (section !== 'offline') {
					await db.query(
						'UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1',
						[tenant]
					);
				}

				return {
					ok: true,
					message:
						section === 'offline'
							? 'Offline preferences saved. Offline protection is not implemented.'
							: `Policy ${value ? 'enabled' : 'disabled'}. Changes apply on the next worker cycle.`
				};
			}

			switch (input.policy ?? 'automatic') {
				case 'automatic': {
					if (!['auto_lock', 'auto_logout'].includes(String(input.action))) {
						throw new InputError('Invalid automatic action');
					}

					await db.query(
						`UPDATE kage_security_policies SET enabled=COALESCE($4,enabled),action=$2,delay_seconds=$3,
						allow_extension=COALESCE($5,allow_extension) WHERE tenant_id=$1`,
						[
							tenant,
							input.action,
							integer(input.delay_seconds, 10, 3600),
							input.enabled === undefined ? null : boolean(input.enabled),
							input.allow_extension === undefined ? null : boolean(input.allow_extension)
						]
					);
					break;
				}
				case 'extension':
					await db.query(
						`UPDATE kage_security_policies SET allow_extension=COALESCE($2,allow_extension),extension_duration_seconds=$3,
						maximum_extensions=$4 WHERE tenant_id=$1`,
						[
							tenant,
							input.allow_extension === undefined ? null : boolean(input.allow_extension),
							integer(input.extension_duration_seconds, 10, 3600),
							integer(input.maximum_extensions, 1, 100)
						]
					);
					break;
				case 'offline':
					if (!['none', 'lock', 'logout'].includes(String(input.offline_action))) {
						throw new InputError('Invalid offline action');
					}

					await db.query(
						`UPDATE kage_security_policies SET client_disconnect_timeout_seconds=$2,offline_action=$3,
						allow_recovery_code=$4 WHERE tenant_id=$1`,
						[
							tenant,
							integer(input.client_disconnect_timeout_seconds, 10, 86400),
							input.offline_action,
							boolean(input.allow_recovery_code)
						]
					);
					break;
				case 'activity':
					await db.query(
						`UPDATE kage_security_policies SET inactivity_monitoring_enabled=COALESCE($2,inactivity_monitoring_enabled),inactivity_timeout_seconds=$3,
						confirmation_timeout_seconds=$4 WHERE tenant_id=$1`,
						[
							tenant,
							input.inactivity_monitoring_enabled === undefined
								? null
								: boolean(input.inactivity_monitoring_enabled),
							integer(input.inactivity_timeout_seconds, 10, 86400),
							integer(input.confirmation_timeout_seconds, 10, 3600)
						]
					);
					break;
				default:
					throw new InputError('Invalid policy');
			}
			await audit(db, user, 'policy.update');
			if (input.policy !== 'offline') {
				await db.query(
					'UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1',
					[tenant]
				);
			}

			return {
				ok: true,
				message:
					input.policy === 'offline'
						? 'Offline preferences saved. Offline protection is not implemented.'
						: 'Policy saved. Changes apply on the next worker cycle.'
			};
		}

		if (resource === 'account') {
			await db.query('UPDATE kage_users SET full_name=$3 WHERE tenant_id=$1 AND id=$2', [
				tenant,
				user.id,
				text(input.full_name, 'full name')
			]);
			if (input.new_password) {
				const { hashPassword, verifyPassword } = await import('./security.ts');
				const current = (
					await db.query('SELECT password_hash FROM kage_users WHERE tenant_id=$1 AND id=$2', [
						tenant,
						user.id
					])
				).rows[0];

				if (
					!(await verifyPassword(secretValue(input.current_password, 'current password', 256), current.password_hash))
				) {
					throw new InputError('Current password is incorrect');
				}

				await db.query('UPDATE kage_users SET password_hash=$3 WHERE tenant_id=$1 AND id=$2', [
					tenant,
					user.id,
					await hashPassword(password(input.new_password))
				]);
				await db.query('DELETE FROM kage_sessions WHERE user_id=$1', [user.id]);
			}

			await audit(db, user, 'account.update', user.id);

			return { ok: true };
		}

		throw new InputError('Not found', 404);
	});
}
