import type pg from 'pg';
import { pool } from '../db/postgres.ts';
import { InputError, macAddress, object } from '../validation.ts';
import type { BrokerContext } from './ingest.ts';

const maxPairedNodes = 100;
const reportingHubs = `
	FROM kage_hubs h
	JOIN kage_mqtt_brokers b ON b.tenant_id=h.tenant_id AND b.id=h.broker_id
	JOIN kage_device_credentials d ON d.tenant_id=h.tenant_id AND d.hub_id=h.id
`;
const freshReport = `
	h.tenant_id=$1 AND d.status='admin_confirmed' AND b.enabled AND b.acl_confirmed
	AND b.connection_state='connected' AND b.last_seen>now()-interval '30 seconds'
	AND h.connection_state='online' AND h.paired_nodes_seen_at>now()-interval '45 seconds'
	AND h.paired_nodes_seen_at>=d.rotated_at
`;

export const savedPairingsQuery = `SELECT h.id AS hub_id,h.hub_id AS hub_code,saved.mac_address,
	h.paired_nodes_seen_at AS last_seen
	${reportingHubs}
	CROSS JOIN LATERAL unnest(h.paired_node_macs) AS saved(mac_address)
	WHERE ${freshReport} AND NOT EXISTS (
		SELECT 1 FROM kage_nodes n
		WHERE n.tenant_id=h.tenant_id AND n.mac_address=saved.mac_address AND n.paired
	)
	ORDER BY h.hub_id,saved.mac_address
`;

export async function recordPairedNodes(context: BrokerContext, hubId: string, payload: Buffer) {
	const report = object(JSON.parse(payload.toString('utf8')));
	if (
		report.version !== 1 ||
		!Array.isArray(report.mac_addresses) ||
		report.mac_addresses.length > maxPairedNodes
	) {
		throw new InputError('Invalid paired node report');
	}

	const addresses = [...new Set(report.mac_addresses.map(macAddress))];
	await pool.query(
		`UPDATE kage_hubs SET paired_node_macs=$4,paired_nodes_seen_at=now()
		WHERE tenant_id=$1 AND broker_id=$2 AND id=$3`,
		[context.tenant_id, context.id, hubId, addresses]
	);
}

export async function savePairedNode(
	db: pg.PoolClient,
	tenant: string,
	hubId: string,
	mac: string,
	allowAlreadyPaired = true
) {
	return (
		await db.query(
			`INSERT INTO kage_nodes(tenant_id,hub_id,mac_address,paired) VALUES ($1,$2,$3,true)
			ON CONFLICT(tenant_id,mac_address) DO UPDATE SET paired=true,hub_id=$2
			WHERE NOT kage_nodes.paired OR ($4 AND kage_nodes.hub_id=$2) RETURNING id`,
			[tenant, hubId, mac, allowAlreadyPaired]
		)
	).rows[0];
}

export async function restorePairedNode(
	db: pg.PoolClient,
	tenant: string,
	hubId: string,
	mac: string
) {
	const hub = (
		await db.query(
			`SELECT h.broker_id,h.hub_id ${reportingHubs}
			WHERE ${freshReport} AND h.id=$2 AND $3=ANY(h.paired_node_macs) FOR UPDATE OF h`,
			[tenant, hubId, mac]
		)
	).rows[0];
	if (!hub)
		throw new InputError('This saved pairing is unavailable. Wait for a fresh Hub report.', 409);

	const node = await savePairedNode(db, tenant, hubId, mac, false);
	if (!node) {
		const existing = await db.query(
			'SELECT 1 FROM kage_nodes WHERE tenant_id=$1 AND hub_id=$2 AND mac_address=$3 AND paired',
			[tenant, hubId, mac]
		);
		if (existing.rowCount) return null;
		throw new InputError('Node belongs to another Hub', 409);
	}

	await db.query('INSERT INTO kage_events(tenant_id,broker_id,kind,detail) VALUES ($1,$2,$3,$4)', [
		tenant,
		hub.broker_id,
		'node.pairing_restored',
		{ hub_id: hub.hub_id, mac_address: mac }
	]);
	return node.id as string;
}
