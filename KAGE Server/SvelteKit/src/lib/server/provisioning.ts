import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import type { Account } from './auth.ts';
import { pool, transaction } from './db/postgres.ts';
import { clientTopics } from './mqtt/acl.ts';
import { decrypt, digest, encrypt } from './security.ts';
import { InputError, object, text, uuid } from './validation.ts';

const devices = `SELECT d.id,d.tenant_id,d.broker_id,d.username,d.token_encrypted,d.status,d.rotated_at,
	d.provisioning_password_encrypted,COALESCE(h.hub_id,ch.hub_id) AS hub_code,c.pc_id,
	b.hostname,b.port,b.tls,b.ca_certificate
	FROM kage_device_credentials d
	JOIN kage_mqtt_brokers b ON b.tenant_id=d.tenant_id AND b.id=d.broker_id
	LEFT JOIN kage_hubs h ON h.tenant_id=d.tenant_id AND h.id=d.hub_id
	LEFT JOIN kage_clients c ON c.tenant_id=d.tenant_id AND c.id=d.client_id
	LEFT JOIN kage_hubs ch ON ch.tenant_id=c.tenant_id AND ch.id=c.hub_id`;

type Device = {
	id: string;
	tenant_id: string;
	username: string;
	token_encrypted: string;
	provisioning_password_encrypted: string | null;
	hub_code: string;
	pc_id: string | null;
	hostname: string;
	port: number;
	tls: boolean;
	ca_certificate: string | null;
};

function attachment(body: string, filename: string, contentType: string) {
	return new Response(body, {
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
}

const serverPublish = [
	'kage/client/setup/by-user/+/response/+',
	...['response', 'state', 'command'].map((suffix) => `kage/client/+/+/${suffix}`),
	...[
		'ping_response',
		'paired_nodes_request',
		'identify',
		'pairing_response/+',
		'unpair_response/+'
	].map((suffix) => `kage/hub/live/+/${suffix}`)
];
const serverSubscribe = [
	'kage/client/setup/by-user/+/request',
	'kage/client/+/+/request',
	'kage/client/+/+/presence',
	'kage/hub/live/+/+',
	'kage/hub/live/+/occupancy/+/+'
];

function hubTopics(hubId: string) {
	const base = `kage/hub/live/${hubId}/`;
	return {
		publish: [
			'status',
			'ping_request',
			'identify_result',
			'pairing_request',
			'pairing_confirm',
			'unpair_request',
			'unpair_confirm',
			'paired_nodes',
			'occupancy/+/+'
		].map((suffix) => base + suffix),
		subscribe: [
			'ping_response',
			'paired_nodes_request',
			'identify',
			'pairing_response/+',
			'unpair_response/+'
		].map((suffix) => base + suffix)
	};
}

function topicRows(username: string, publish: string[], subscribe: string[]) {
	return [
		...publish.map((topic) => ({ username, topic, action: 'pub', access: 'allow' })),
		...subscribe.map((topic) => ({ username, topic, action: 'sub', access: 'allow' }))
	];
}

function csv(rows: Record<string, string>[], fields: string[], mapping: unknown) {
	const columns =
		mapping === undefined
			? fields.map((field) => ({ field, header: field }))
			: Array.isArray(mapping)
				? mapping.map((entry) => {
						const column = object(entry);
						return {
							field: text(column.field, 'column field', 32),
							header: text(column.header, 'column header', 64)
						};
					})
				: [];
	if (
		columns.length !== fields.length ||
		new Set(columns.map(({ field }) => field)).size !== fields.length ||
		new Set(columns.map(({ header }) => header.toLowerCase())).size !== fields.length ||
		columns.some(({ field, header }) => !fields.includes(field) || /[\r\n]/.test(header))
	)
		throw new InputError('Map each CSV field to a unique column header.');

	const escape = (value: string) =>
		/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
	return (
		[
			columns.map(({ header }) => escape(header)).join(','),
			...rows.map((row) => columns.map(({ field }) => escape(row[field])).join(','))
		].join('\r\n') + '\r\n'
	);
}

async function audit(db: pg.PoolClient, admin: Account, action: string, id: string) {
	await db.query(
		'INSERT INTO kage_audit_logs(tenant_id,user_id,action,resource_id) VALUES ($1,$2,$3,$4)',
		[admin.tenant_id, admin.id, action, id]
	);
}

async function exportBroker(
	admin: Account,
	input: Record<string, unknown>,
	authentication: boolean
) {
	const id = uuid(input.id);
	const tenant = admin.tenant_id;
	return transaction(async (db) => {
		const broker = (
			await db.query(
				'SELECT username,password_encrypted FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2',
				[tenant, id]
			)
		).rows[0];
		if (!broker) throw new InputError('Broker not found', 404);
		const { rows } = await db.query<Device>(
			`${devices} WHERE d.tenant_id=$1 AND d.broker_id=$2 AND d.status<>'revoked'
			AND (NOT $3 OR d.status='generated') ORDER BY d.username`,
			[tenant, id, authentication]
		);
		if (authentication) {
			const credentials = rows.map((device) => ({
				username: device.username,
				password: decrypt(device.token_encrypted, `${tenant}:${device.id}`)
			}));
			if (input.include_server === true) {
				credentials.unshift({
					username: broker.username,
					password: decrypt(broker.password_encrypted, `${tenant}:${id}`)
				});
			}
			if (!credentials.length)
				throw new InputError('There are no pending device credentials to export.', 409);
			const content = csv(credentials, ['username', 'password'], input.columns);
			await audit(db, admin, 'broker.export_authentication', id);
			return attachment(content, 'emqx-authentication.csv', 'text/csv; charset=utf-8');
		}
		const rules = topicRows(broker.username, serverPublish, serverSubscribe);
		for (const device of rows) {
			const topics = device.pc_id
				? clientTopics(device.username, device.hub_code, device.pc_id)
				: hubTopics(device.hub_code);
			rules.push(...topicRows(device.username, topics.publish, topics.subscribe));
		}
		const content = csv(rules, ['username', 'topic', 'action', 'access'], input.columns);
		await audit(db, admin, 'broker.export_authorization', id);
		return attachment(content, 'emqx-authorization.csv', 'text/csv; charset=utf-8');
	});
}

async function provisioningPassword(db: pg.PoolClient, device: Device) {
	const context = `provisioning:${device.tenant_id}:${device.id}`;
	if (device.provisioning_password_encrypted)
		return decrypt(device.provisioning_password_encrypted, context);
	const password = randomBytes(10).toString('hex').match(/.{5}/g)!.join('-');
	await db.query(
		'UPDATE kage_device_credentials SET provisioning_password_encrypted=$2 WHERE id=$1',
		[device.id, encrypt(password, context)]
	);
	await db.query(
		`UPDATE kage_device_states SET dirty=true,updated_at=now()
		WHERE tenant_id=$1 AND client_id=(SELECT client_id FROM kage_device_credentials WHERE id=$2)`,
		[device.tenant_id, device.id]
	);
	return password;
}

export function provisioningPasswordHash(tenant: string, credentialId: string, encrypted: string) {
	return digest(decrypt(encrypted, `provisioning:${tenant}:${credentialId}`));
}

async function setupFile(db: pg.PoolClient, device: Device) {
	const body = {
		version: 1,
		kind: device.pc_id ? 'client' : 'hub',
		hubId: device.hub_code,
		pcId: device.pc_id,
		mqtt: {
			address: device.hostname,
			port: device.port,
			useTls: device.tls,
			certificateAuthorityPem: device.ca_certificate,
			username: device.username,
			password: decrypt(device.token_encrypted, `${device.tenant_id}:${device.id}`)
		},
		...(device.pc_id ? { provisioningPassword: await provisioningPassword(db, device) } : {})
	};
	return attachment(
		JSON.stringify(body, null, 2),
		`kage-${device.pc_id ?? device.hub_code}-setup.json`,
		'application/json'
	);
}

async function managePortal(admin: Account, input: Record<string, unknown>, origin: string) {
	const hubId = uuid(input.id);
	const tenant = admin.tenant_id;
	if (input.action === 'portal_list') {
		const { rows } = await pool.query(
			`SELECT d.id,c.id AS client_id,COALESCE(c.pc_id,h.hub_id) AS code,
				COALESCE(c.name,h.name) AS name
			FROM kage_device_credentials d
			LEFT JOIN kage_clients c ON c.tenant_id=d.tenant_id AND c.id=d.client_id
			JOIN kage_hubs h ON h.tenant_id=d.tenant_id AND h.id=COALESCE(d.hub_id,c.hub_id)
			WHERE h.tenant_id=$1 AND h.id=$2 AND d.status<>'revoked'
			ORDER BY c.id IS NOT NULL,code`,
			[tenant, hubId]
		);
		return { files: rows };
	}

	if (!origin.startsWith('https://'))
		throw new InputError('Setup links require an HTTPS KAGE address.');
	const fileId = input.file === undefined ? null : uuid(input.file);
	const username = `setup-${randomBytes(5).toString('hex')}`;
	const password = randomBytes(16).toString('base64url');
	return transaction(async (db) => {
		const hub = await db.query(
			'SELECT id FROM kage_hubs WHERE tenant_id=$1 AND id=$2 FOR KEY SHARE',
			[tenant, hubId]
		);
		if (!hub.rowCount) throw new InputError('Hub not found', 404);
		await db.query('DELETE FROM kage_provisioning_portals WHERE hub_id=$1 AND expires_at<=now()', [
			hubId
		]);
		const {
			rows: [portal]
		} = await db.query(
			`INSERT INTO kage_provisioning_portals(hub_id,username,password_digest,expires_at)
			VALUES ($1,$2,$3,now()+interval '30 minutes') RETURNING id,expires_at`,
			[hubId, username, digest(password)]
		);
		const granted = await db.query(
			`INSERT INTO kage_provisioning_portal_files(portal_id,credential_id,credential_rotated_at)
			SELECT $4,d.id,d.rotated_at FROM kage_device_credentials d
			LEFT JOIN kage_clients c ON c.tenant_id=d.tenant_id AND c.id=d.client_id
			WHERE d.tenant_id=$1 AND COALESCE(d.hub_id,c.hub_id)=$2 AND d.status<>'revoked'
			AND ($3::uuid IS NULL OR d.id=$3)
			ORDER BY d.id FOR SHARE OF d`,
			[tenant, hubId, fileId, portal.id]
		);
		if (!granted.rowCount) throw new InputError('No eligible setup files for this link.', 404);
		await audit(db, admin, fileId ? 'provisioning.share_device' : 'provisioning.share_hub', hubId);
		const url = new URL(`/provisioning/${portal.id}`, origin);
		if (fileId) url.searchParams.set('file', fileId);
		return {
			url: url.href,
			username,
			password,
			expires_at: portal.expires_at,
			file_count: granted.rowCount
		};
	});
}

async function authorizePortal(db: pg.PoolClient, id: string, input: Record<string, unknown>) {
	const username = text(input.username, 'temporary username', 64);
	const password = text(input.password, 'temporary password', 64);
	const {
		rows: [portal]
	} = await db.query<{ hub_id: string; name: string }>(
		`SELECT p.hub_id,h.name FROM kage_provisioning_portals p JOIN kage_hubs h ON h.id=p.hub_id
		WHERE p.id=$1 AND p.username=$2 AND p.password_digest=$3 AND p.expires_at>now()`,
		[uuid(id), username, digest(password)]
	);
	if (!portal) throw new InputError('Invalid or expired provisioning portal credentials.', 403);
	return portal;
}

export async function accessPortal(id: string, input: Record<string, unknown>) {
	if (input.action !== 'list' && input.action !== 'download')
		throw new InputError('Invalid provisioning action');
	return transaction(async (db) => {
		const portal = await authorizePortal(db, id, input);
		if (input.action === 'list') {
			const { rows } = await db.query(
				`SELECT d.id,COALESCE(c.pc_id,h.hub_id) AS code,COALESCE(c.name,h.name) AS name,
					CASE WHEN c.id IS NULL THEN 'hub' ELSE 'client' END AS kind
				FROM kage_provisioning_portal_files f
				JOIN kage_device_credentials d ON d.id=f.credential_id AND d.rotated_at=f.credential_rotated_at
				JOIN kage_hubs h ON h.id=$2
				LEFT JOIN kage_clients c ON c.tenant_id=d.tenant_id AND c.id=d.client_id
				WHERE f.portal_id=$1 AND d.tenant_id=h.tenant_id
				AND COALESCE(d.hub_id,c.hub_id)=h.id AND d.status<>'revoked'
				ORDER BY c.id IS NOT NULL,code`,
				[id, portal.hub_id]
			);
			return { name: portal.name, files: rows };
		}
		const fileId = uuid(input.file);
		const {
			rows: [device]
		} = await db.query<Device>(
			`${devices}
			JOIN kage_provisioning_portal_files f ON f.credential_id=d.id AND f.credential_rotated_at=d.rotated_at
			WHERE f.portal_id=$1 AND d.id=$2 AND COALESCE(d.hub_id,c.hub_id)=$3
			AND d.status<>'revoked' FOR UPDATE OF d`,
			[id, fileId, portal.hub_id]
		);
		if (!device) throw new InputError('Setup file unavailable or already downloaded.', 403);
		const consumed = await db.query(
			`DELETE FROM kage_provisioning_portal_files f USING kage_provisioning_portals p
			WHERE p.id=f.portal_id AND p.id=$1 AND f.credential_id=$2 AND p.expires_at>statement_timestamp()`,
			[id, fileId]
		);
		if (!consumed.rowCount)
			throw new InputError('Setup file unavailable or already downloaded.', 403);
		return setupFile(db, device);
	});
}

export async function manageProvisioning(
	admin: Account,
	input: Record<string, unknown>,
	origin: string
) {
	if (admin.role !== 'admin') throw new InputError('Administrator access required', 403);
	if (input.action === 'export_authentication' || input.action === 'export_authorization') {
		return exportBroker(admin, input, input.action === 'export_authentication');
	}
	if (input.action === 'portal_list' || input.action === 'portal_share')
		return managePortal(admin, input, origin);
	if (!['download', 'share', 'password'].includes(String(input.action)))
		throw new InputError('Invalid provisioning action');

	const id = uuid(input.id);
	const scope = input.kind === 'hub' ? 'hub_id' : input.kind === 'client' ? 'client_id' : null;
	if (!scope) throw new InputError('Invalid device type');
	return transaction(async (db) => {
		const device = (
			await db.query<Device>(
				`${devices} WHERE d.tenant_id=$1 AND d.${scope}=$2 AND d.status<>'revoked' FOR UPDATE OF d`,
				[admin.tenant_id, id]
			)
		).rows[0];
		if (!device) throw new InputError('Device unavailable or revoked', 404);
		if (input.action === 'password') {
			if (!device.pc_id) throw new InputError('Choose a Windows Client');
			const password = await provisioningPassword(db, device);
			await audit(db, admin, 'provisioning.view_password', id);
			return { password };
		}
		if (input.action === 'share') {
			if (!origin.startsWith('https://'))
				throw new InputError('Setup links require an HTTPS KAGE address.');
			const username = `setup-${randomBytes(5).toString('hex')}`;
			const password = randomBytes(16).toString('base64url');
			const { rows } = await db.query(
				`INSERT INTO kage_device_setup_downloads(credential_id,username,password_digest,credential_rotated_at,expires_at)
				SELECT id,$2,$3,rotated_at,now()+interval '30 minutes' FROM kage_device_credentials WHERE id=$1
				ON CONFLICT(credential_id) DO UPDATE SET id=gen_random_uuid(),username=EXCLUDED.username,
					password_digest=EXCLUDED.password_digest,credential_rotated_at=EXCLUDED.credential_rotated_at,
					expires_at=EXCLUDED.expires_at RETURNING id,expires_at`,
				[device.id, username, digest(password)]
			);
			await audit(db, admin, 'provisioning.share', id);
			return {
				url: new URL(`/device-setup/${rows[0].id}`, origin).href,
				username,
				password,
				expires_at: rows[0].expires_at
			};
		}
		const file = await setupFile(db, device);
		await audit(db, admin, 'provisioning.download', id);
		return file;
	});
}

export async function redeemSetup(id: string, input: Record<string, unknown>) {
	const username = text(input.username, 'temporary username', 64);
	const password = text(input.password, 'temporary password', 64);
	return transaction(async (db) => {
		const link = (
			await db.query(
				'SELECT credential_id FROM kage_device_setup_downloads WHERE id=$1 AND expires_at>now() AND username=$2 AND password_digest=$3',
				[uuid(id), username, digest(password)]
			)
		).rows[0];
		if (!link) throw new InputError('Invalid, expired or already used setup link.', 403);
		const device = (
			await db.query<Device>(`${devices} WHERE d.id=$1 AND d.status<>'revoked' FOR UPDATE OF d`, [
				link.credential_id
			])
		).rows[0];
		if (!device) throw new InputError('Invalid, expired or already used setup link.', 403);

		const redeemed = await db.query(
			`DELETE FROM kage_device_setup_downloads s USING kage_device_credentials d
			WHERE s.id=$1 AND s.credential_id=d.id AND d.id=$2 AND s.expires_at>now()
			AND s.credential_rotated_at=d.rotated_at`,
			[id, device.id]
		);
		if (!redeemed.rowCount)
			throw new InputError('Invalid, expired or already used setup link.', 403);
		return setupFile(db, device);
	});
}
