import { pool, transaction } from '../db/postgres.ts';
import { InputError, macAddress, object, uuid } from '../validation.ts';
import { clientState, parseRequest, reply } from './protocol.ts';
import { enroll } from './enrollment.ts';
import { activeCommand, capabilities, protocolVersion, recordReport } from './lifecycle.ts';
import { recordOccupancy } from './occupancy.ts';
import { changePolicyCommand, PolicyCommandError, recordActivity } from './policies.ts';

export type BrokerContext = { id: string; tenant_id: string };

export type Publish = (topic: string, payload: unknown) => Promise<void>;

async function recordHubStatus(
	context: BrokerContext,
	hub: { id: string; hub_id: string; connection_state: string },
	state: 'online' | 'offline'
) {
	await transaction(async (db) => {
		await db.query(
			'UPDATE kage_hubs SET connection_state=$3,last_seen=now() WHERE tenant_id=$1 AND id=$2',
			[context.tenant_id, hub.id, state]
		);
		// Heartbeats refresh presence without adding duplicate events or Client updates.
		if (hub.connection_state === state) return;

		await db.query(
			'UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id IN (SELECT id FROM kage_clients WHERE tenant_id=$1 AND hub_id=$2)',
			[context.tenant_id, hub.id]
		);
		await db.query(
			'INSERT INTO kage_events(tenant_id,broker_id,kind,detail) VALUES ($1,$2,$3,$4)',
			[context.tenant_id, context.id, 'hub.status', { hub_id: hub.hub_id, state }]
		);
	});
}

export async function stateForClient(tenant: string, id: string) {
	const { rows } = await pool.query(
		`SELECT c.pc_id,c.command_version,h.hub_id AS hub_code,h.last_seen AS hub_last_seen,
		(h.connection_state='online' AND b.enabled AND b.acl_confirmed AND b.connection_state='connected' AND b.last_seen>now()-interval '30 seconds') AS hub_online,
		m.node_id,n.mac_address,n.paired AS node_paired,n.occupancy AS node_occupancy,n.last_seen AS node_last_seen,
		p.enabled AS policy_enabled,p.action,p.delay_seconds,p.allow_extension,p.extension_duration_seconds,
		p.maximum_extensions,p.inactivity_monitoring_enabled,p.inactivity_timeout_seconds,p.confirmation_timeout_seconds,
		c.capabilities AS client_capabilities
		FROM kage_clients c JOIN kage_hubs h ON h.id=c.hub_id AND h.tenant_id=c.tenant_id
		JOIN kage_mqtt_brokers b ON b.id=c.broker_id AND b.tenant_id=c.tenant_id
		LEFT JOIN kage_node_client_mappings m ON m.tenant_id=c.tenant_id AND m.client_id=c.id
		LEFT JOIN kage_nodes n ON n.tenant_id=m.tenant_id AND n.id=m.node_id
		LEFT JOIN kage_security_policies p ON p.tenant_id=c.tenant_id
		WHERE c.tenant_id=$1 AND c.id=$2`,
		[tenant, id]
	);

	if (!rows[0]) throw new Error('Client unavailable');

	return {
		...clientState(rows[0]),
		protocol_version: protocolVersion,
		capabilities,
		command_version: Number(rows[0].command_version),
		server_time_utc: new Date().toISOString(),
		policies:
			rows[0].policy_enabled == null
				? null
				: {
						enforcement_version: 1,
						enabled: rows[0].policy_enabled,
						action: rows[0].action,
						delay_seconds: rows[0].delay_seconds,
						allow_extension: rows[0].allow_extension,
						extension_duration_seconds: rows[0].extension_duration_seconds,
						maximum_extensions: rows[0].maximum_extensions,
						inactivity_monitoring_enabled: rows[0].inactivity_monitoring_enabled,
						inactivity_timeout_seconds: rows[0].inactivity_timeout_seconds,
						confirmation_timeout_seconds: rows[0].confirmation_timeout_seconds,
						activity_supported: rows[0].client_capabilities?.includes('activity_v1') === true
					},
		active_command: await activeCommand(tenant, id, Number(rows[0].command_version))
	};
}

export async function ingest(
	context: BrokerContext,
	topic: string,
	payload: Buffer,
	retained: boolean,
	publish: Publish
) {
	if (payload.length > 8192 || retained) return;

	const tenant = context.tenant_id;
	const allowed = await pool.query(
		'SELECT id FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2 AND enabled AND acl_confirmed',
		[tenant, context.id]
	);

	if (!allowed.rowCount) return;
	if (await enroll(context, topic, payload, publish)) return;
	if (topic === 'kage/hub/setup/ping_request') {
		// The current request has no device identity. A shared success reply would authorize unknown hubs.
		return;
	}

	if (topic === 'kage/client/setup/request') {
		const request = parseRequest(payload);
		await publish(
			request.reply,
			reply(
				request.requestId,
				{},
				'NOT_AUTHORIZED',
				'Setup requires an authenticated device identity binding. See Deferred Cross-Project Work in KAGE Server.'
			)
		);

		return;
	}

	const parts = topic.split('/');

	if (
		parts[0] === 'kage' &&
		parts[1] === 'hub' &&
		parts[2] === 'live' &&
		(parts.length === 5 || (parts.length === 7 && parts[4] === 'occupancy'))
	) {
		// The Hub wildcard also receives server publications and unknown message types.
		if (
			!['ping_request', 'identify_result', 'status', 'occupancy', 'pairing_request', 'pairing_confirm', 'unpair_request', 'unpair_confirm'].includes(parts[4])
		) {
			return;
		}

		const hub = (
			await pool.query(
				`SELECT h.* FROM kage_hubs h JOIN kage_device_credentials d ON d.tenant_id=h.tenant_id AND d.hub_id=h.id
			WHERE h.tenant_id=$1 AND h.broker_id=$2 AND h.hub_id=$3 AND d.status='admin_confirmed'`,
				[tenant, context.id, parts[3]]
			)
		).rows[0];

		if (!hub) return;

		if (parts[4] === 'occupancy') {
			if (parts.length !== 7) return;

			await recordOccupancy(context, hub.id, parts[5], parts[6], payload);

			return;
		}

		if (parts[4] === 'identify_result') {
			const result = object(JSON.parse(payload.toString('utf8')));

			if (
				result.version !== 1 ||
				!['dispatched', 'delivery_failed', 'rejected'].includes(String(result.status))
			) {
				return;
			}

			const commandId = uuid(result.command_id);
			const mac = macAddress(result.mac_address);

			if (
				result.reason !== undefined &&
				(typeof result.reason !== 'string' || result.reason.length > 128)
			) {
				return;
			}

			const status = result.status === 'delivery_failed' ? 'failed' : result.status;
			await transaction(async (db) => {
				const updated = await db.query(
					`UPDATE kage_commands c SET status=$7,report=$8 FROM kage_nodes n
					WHERE c.tenant_id=$1 AND c.broker_id=$2 AND c.id=$3 AND c.kind='identify'
					AND c.node_id=n.id AND n.tenant_id=c.tenant_id AND n.hub_id=$4 AND n.mac_address=$5
					AND c.topic=$6 AND c.version=1 AND c.payload->>'mac_address'=$5
					AND c.status IN ('dispatching','published','unconfirmed') AND c.expires_at>now()
					RETURNING c.id`,
					[
						tenant,
						context.id,
						commandId,
						hub.id,
						mac,
						`kage/hub/live/${hub.hub_id}/identify`,
						status,
						{
							status: result.status,
							...(result.reason ? { reason: result.reason } : {}),
							received_at: new Date().toISOString()
						}
					]
				);

				if (updated.rowCount) {
					await db.query(
						'INSERT INTO kage_events(tenant_id,broker_id,kind,detail) VALUES ($1,$2,$3,$4)',
						[
							tenant,
							context.id,
							'node.identify_result',
							{
								hub_id: hub.hub_id,
								command_id: commandId,
								mac_address: mac,
								status: result.status,
								reason: result.reason
							}
						]
					);
				}
			});

			return;
		}

		if (parts[4] === 'ping_request') {
			const request = object(JSON.parse(payload.toString('utf8')));

			if (typeof request.request_id !== 'string' || !/^[a-f0-9]{32}$/.test(request.request_id)) {
				return;
			}
			// A valid live startup ping also proves the confirmed Hub is online.
			await recordHubStatus(context, hub, 'online');
			await publish(`kage/hub/live/${hub.hub_id}/ping_response`, {
				request_id: request.request_id,
				data: { key: 'KAGE' }
			});

			return;
		}

		if (parts[4] === 'status') {
			const state = payload.toString('utf8');

			if (state !== 'online' && state !== 'offline') return;

			await recordHubStatus(context, hub, state);

			return;
		}

		const action = parts[4];

		if (
			!['pairing_request', 'unpair_request', 'pairing_confirm', 'unpair_confirm'].includes(action)
		) {
			return;
		}

		const mac = macAddress(object(JSON.parse(payload.toString('utf8'))).mac_address);
		const kind = action.startsWith('pairing') ? 'pair' : 'unpair';
		await transaction(async (db) => {
			if (action.endsWith('_request')) {
				await db.query(
					`INSERT INTO kage_pairing_requests(tenant_id,hub_id,mac_address,kind) VALUES ($1,$2,$3,$4)
					ON CONFLICT(hub_id,mac_address,kind) DO UPDATE SET last_seen=now(),
					status=CASE WHEN kage_pairing_requests.expires_at<now() THEN 'pending' ELSE kage_pairing_requests.status END,
					expires_at=CASE WHEN kage_pairing_requests.expires_at<now() THEN now()+interval '15 minutes' ELSE kage_pairing_requests.expires_at END`,
					[tenant, hub.id, mac, kind]
				);

				return;
			}

			const approved = await db.query(
				`UPDATE kage_pairing_requests SET status='completed',last_seen=now()
				WHERE tenant_id=$1 AND hub_id=$2 AND mac_address=$3 AND kind=$4 AND status='approved' AND expires_at>now() RETURNING id`,
				[tenant, hub.id, mac, kind]
			);

			if (!approved.rowCount) return;

			if (kind === 'pair') {
				const result = await db.query(
					`INSERT INTO kage_nodes(tenant_id,hub_id,mac_address,paired) VALUES ($1,$2,$3,true)
					ON CONFLICT(tenant_id,mac_address) DO UPDATE SET paired=true,hub_id=$2
					WHERE NOT kage_nodes.paired OR kage_nodes.hub_id=$2 RETURNING id`,
					[tenant, hub.id, mac]
				);

				if (!result.rowCount) throw new Error('Node belongs to another Hub');
			} else {
				await db.query(
					`UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id IN
					(SELECT m.client_id FROM kage_node_client_mappings m JOIN kage_nodes n ON n.tenant_id=m.tenant_id AND n.id=m.node_id WHERE n.tenant_id=$1 AND n.hub_id=$2 AND n.mac_address=$3)`,
					[tenant, hub.id, mac]
				);
				await db.query(
					`DELETE FROM kage_node_client_mappings WHERE tenant_id=$1 AND node_id IN (SELECT id FROM kage_nodes WHERE tenant_id=$1 AND hub_id=$2 AND mac_address=$3)`,
					[tenant, hub.id, mac]
				);
				await db.query(
					"UPDATE kage_nodes SET paired=false,occupancy='unknown' WHERE tenant_id=$1 AND hub_id=$2 AND mac_address=$3",
					[tenant, hub.id, mac]
				);
			}

			await db.query(
				'INSERT INTO kage_events(tenant_id,broker_id,kind,detail) VALUES ($1,$2,$3,$4)',
				[tenant, context.id, action, { hub_id: hub.hub_id, mac_address: mac }]
			);
		});

		return;
	}

	if (parts[0] !== 'kage' || parts[1] !== 'client' || ![5, 6].includes(parts.length)) return;

	const client = (
		await pool.query(
			`SELECT c.* FROM kage_clients c JOIN kage_hubs h ON h.tenant_id=c.tenant_id AND h.id=c.hub_id
		JOIN kage_device_credentials d ON d.tenant_id=c.tenant_id AND d.client_id=c.id
		WHERE c.tenant_id=$1 AND c.broker_id=$2 AND h.hub_id=$3 AND c.pc_id=$4 AND d.status='admin_confirmed'`,
			[tenant, context.id, parts[2], parts[3]]
		)
	).rows[0];

	if (!client) return;

	if (parts.length === 5 && parts[4] === 'presence') {
		const presence = object(JSON.parse(payload.toString('utf8')));

		if (typeof presence.online !== 'boolean' || typeof presence.session_id !== 'string') return;

		const security = ['locked', 'unlocked', 'logging_off', 'unknown'].includes(String(presence.security_state))
			? presence.security_state
			: 'unknown';
		await pool.query(
			`UPDATE kage_clients SET connection_state=$4,last_seen=now(),presence_seen_at=now(),security_state=$5,security_updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND presence_session=$3`,
			[
				tenant,
				client.id,
				presence.session_id,
				presence.online ? 'online' : 'offline',
				presence.online ? security : 'unknown'
			]
		);
		if (presence.online === true) await recordActivity(tenant, client.id, presence);

		return;
	}

	if (parts.length === 6 && parts[4] === 'extension' && parts[5] === 'request') {
		// Extensions require a lifecycle v1 request tied to a command. Ignore legacy requests.
		return;
	}
	if (parts.length !== 5 || parts[4] !== 'request') return;

	const base = `kage/client/${parts[2]}/${parts[3]}`;
	const request = parseRequest(payload, `${base}/response`);

	if (request.data.hub_id !== parts[2] || request.data.pc_id !== parts[3]) return;
	// The transient connection probe consumes this reply directly. It is not
	// a command report or a request for a state change.
	if (request.action === 'connection_test_reply') return;

	await pool.query('UPDATE kage_clients SET last_seen=now() WHERE tenant_id=$1 AND id=$2', [
		tenant,
		client.id
	]);
	if (request.action === 'hello') {
		const supported =
			request.data.protocol_version === protocolVersion &&
			Array.isArray(request.data.capabilities) &&
			capabilities.every((c) => (request.data.capabilities as unknown[]).includes(c)) &&
			typeof request.data.session_id === 'string' &&
			/^kage-session-[a-f0-9]{32}$/.test(request.data.session_id);

		if (supported) {
			await pool.query(
				`UPDATE kage_clients SET protocol_version=$3,capabilities=$4,presence_session=$5,connection_state='unknown'
            WHERE tenant_id=$1 AND id=$2`,
				[
					tenant,
					client.id,
					protocolVersion,
					JSON.stringify(request.data.capabilities),
					request.data.session_id
				]
			);
		}

		await publish(
			request.reply,
			reply(
				request.requestId,
				supported ? { protocol_version: protocolVersion, capabilities } : {},
				supported ? 'SUCCESS' : 'UNSUPPORTED_PROTOCOL',
				supported ? 'Capabilities accepted.' : 'Command lifecycle v1 is required.'
			)
		);
	} else if (request.action === 'command_report') {
		await transaction((db) => recordReport(db, tenant, client.id, request.data));
		await publish(request.reply, reply(request.requestId, { acknowledged: true }));
	} else if (request.action === 'state') {
		await publish(request.reply, reply(request.requestId, await stateForClient(tenant, client.id)));
	} else if (['extend', 'cancel_extension', 'confirm_activity'].includes(request.action)) {
		try {
			const command = await changePolicyCommand(tenant, client.id, request.action, request.data);
			await publish(request.reply, reply(request.requestId, command));
		} catch (error) {
			if (!(error instanceof InputError)) throw error;

			await publish(
				request.reply,
				reply(
					request.requestId,
					{},
					error instanceof PolicyCommandError ? error.code : 'POLICY_REJECTED',
					error.message
				)
			);
		}
	} else {
		await publish(
			request.reply,
			reply(request.requestId, {}, 'UNSUPPORTED_ACTION', 'Unsupported client action.')
		);
	}
}
