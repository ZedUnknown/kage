import { pool, transaction } from '../db/postgres.ts';
import { macAddress } from '../validation.ts';
import type { BrokerContext } from './ingest.ts';

export const occupancyTimeoutSeconds = 60;
export const occupancyClockSkewMs = 5000;

// The broker and confirmed Hub identity must be checked before calling this.
export async function recordOccupancy(
	context: BrokerContext,
	hubId: string,
	nodeMac: string,
	occupancy: string,
	payload: Buffer,
	now = Date.now()
) {
	const timestamp = payload.toString('utf8');
	const observedAt = Number(timestamp);

	if (
		!['occupied', 'empty'].includes(occupancy) ||
		!/^\d{13}$/.test(timestamp) ||
		observedAt < now - occupancyTimeoutSeconds * 1000 ||
		observedAt > now + occupancyClockSkewMs
	) {
		return false;
	}

	const mac = macAddress(nodeMac);

	return transaction(async (db) => {
		const { rows } = await db.query(
			`SELECT id,occupancy,last_seen FROM kage_nodes
			WHERE tenant_id=$1 AND hub_id=$2 AND mac_address=$3 AND paired FOR UPDATE`,
			[context.tenant_id, hubId, mac]
		);
		const node = rows[0];
		// Never create an unknown Node, revive an unpaired Node or replay an older sample.
		if (!node || (node.last_seen && new Date(node.last_seen).getTime() >= observedAt)) return false;

		await db.query(
			`UPDATE kage_nodes SET occupancy_since=CASE WHEN occupancy<>$3 OR occupancy_since IS NULL
			THEN to_timestamp($4::double precision/1000) ELSE occupancy_since END,
			occupancy=$3,last_seen=to_timestamp($4::double precision/1000)
			WHERE tenant_id=$1 AND id=$2`,
			[context.tenant_id, node.id, occupancy, observedAt]
		);
		await db.query(
			`UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id IN
			(SELECT client_id FROM kage_node_client_mappings WHERE tenant_id=$1 AND node_id=$2)`,
			[context.tenant_id, node.id]
		);
		if (node.occupancy !== occupancy) {
			await db.query(
				'INSERT INTO kage_events(tenant_id,broker_id,kind,detail) VALUES ($1,$2,$3,$4)',
				[
					context.tenant_id,
					context.id,
					'node.occupancy',
					{ hub_id: hubId, mac_address: mac, occupancy }
				]
			);
		}

		return true;
	});
}

// Invalidate stale readings once and publish unknown state to mapped Clients.
export async function expireOccupancy() {
	await pool.query(`WITH stale AS (
		UPDATE kage_nodes SET occupancy='unknown'
		WHERE occupancy<>'unknown' AND (NOT paired OR last_seen IS NULL
			OR last_seen<now()-interval '${occupancyTimeoutSeconds} seconds')
		RETURNING tenant_id,id
	)
	UPDATE kage_device_states s SET dirty=true,updated_at=now()
	FROM kage_node_client_mappings m JOIN stale n ON n.tenant_id=m.tenant_id AND n.id=m.node_id
	WHERE s.tenant_id=m.tenant_id AND s.client_id=m.client_id`);
}
