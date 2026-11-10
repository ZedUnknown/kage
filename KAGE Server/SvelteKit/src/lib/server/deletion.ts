import type pg from 'pg';
import { InputError } from './validation.ts';

// Delete children explicitly so device removal never silently removes a network.
export async function deleteResource(
	db: pg.PoolClient,
	tenant: string,
	resource: string,
	id: string
) {
	const values = [tenant, id];

	if (resource === 'brokers') {
		const broker = await db.query(
			'SELECT id FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
			values
		);

		if (!broker.rowCount) throw new InputError('Broker not found', 404);
		if (
			(
				await db.query(
					'SELECT 1 FROM kage_hubs WHERE tenant_id=$1 AND broker_id=$2 LIMIT 1',
					values
				)
			).rowCount
		) {
			throw new InputError("Delete this broker's hubs before deleting the broker.", 409);
		}

		await db.query('DELETE FROM kage_commands WHERE tenant_id=$1 AND broker_id=$2', values);
		await db.query(
			'UPDATE kage_events SET broker_id=NULL WHERE tenant_id=$1 AND broker_id=$2',
			values
		);
		await db.query('DELETE FROM kage_mqtt_brokers WHERE tenant_id=$1 AND id=$2', values);

		return 'Broker deleted. Its command history was removed. Events and audit history were kept.';
	}

	if (resource === 'hubs') {
		const hub = (
			await db.query(
				'SELECT id,broker_id,hub_id FROM kage_hubs WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
				values
			)
		).rows[0];

		if (!hub) throw new InputError('Hub not found', 404);
		if (
			(
				await db.query(
					'SELECT 1 FROM kage_clients WHERE tenant_id=$1 AND hub_id=$2 LIMIT 1',
					values
				)
			).rowCount
		) {
			throw new InputError("Delete this hub's clients before deleting the hub.", 409);
		}
		if (
			(await db.query('SELECT 1 FROM kage_nodes WHERE tenant_id=$1 AND hub_id=$2 LIMIT 1', values))
				.rowCount
		) {
			throw new InputError("Unpair and delete this hub's nodes before deleting the hub.", 409);
		}

		await db.query(
			`UPDATE kage_commands SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'unconfirmed' END,expires_at=now()
			WHERE tenant_id=$1 AND broker_id=$2 AND topic LIKE 'kage/hub/live/%' AND split_part(topic,'/',4)=$3
			AND status IN ('queued','dispatching','published','received','executing','unconfirmed')`,
			[tenant, hub.broker_id, hub.hub_id]
		);
		await db.query('DELETE FROM kage_pairing_requests WHERE tenant_id=$1 AND hub_id=$2', values);
		await db.query('DELETE FROM kage_device_credentials WHERE tenant_id=$1 AND hub_id=$2', values);
		await db.query('DELETE FROM kage_hubs WHERE tenant_id=$1 AND id=$2', values);
		await db.query('UPDATE kage_mqtt_brokers SET updated_at=now() WHERE tenant_id=$1 AND id=$2', [
			tenant,
			hub.broker_id
		]);

		return 'Hub deleted. Remove its MQTT account on the external broker and disconnect its sessions.';
	}

	if (resource === 'clients') {
		const client = (
			await db.query(
				'SELECT id,broker_id FROM kage_clients WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
				values
			)
		).rows[0];

		if (!client) throw new InputError('Client not found', 404);

		await db.query(
			`UPDATE kage_commands SET client_id=NULL,
			status=CASE WHEN status='queued' THEN 'cancelled' WHEN status IN ('dispatching','published','received','executing') THEN 'unconfirmed' ELSE status END,
			expires_at=LEAST(expires_at,now()) WHERE tenant_id=$1 AND client_id=$2`,
			values
		);
		await db.query(
			'DELETE FROM kage_node_client_mappings WHERE tenant_id=$1 AND client_id=$2',
			values
		);
		await db.query('DELETE FROM kage_device_states WHERE tenant_id=$1 AND client_id=$2', values);
		await db.query(
			'DELETE FROM kage_device_credentials WHERE tenant_id=$1 AND client_id=$2',
			values
		);
		await db.query('DELETE FROM kage_clients WHERE tenant_id=$1 AND id=$2', values);
		await db.query('UPDATE kage_mqtt_brokers SET updated_at=now() WHERE tenant_id=$1 AND id=$2', [
			tenant,
			client.broker_id
		]);

		return 'Client deleted. Remove its MQTT account on the external broker and disconnect its sessions.';
	}

	if (resource === 'nodes') {
		const node = (
			await db.query(
				`SELECT n.*,h.broker_id,h.hub_id AS hub_code FROM kage_nodes n
			JOIN kage_hubs h ON h.tenant_id=n.tenant_id AND h.id=n.hub_id WHERE n.tenant_id=$1 AND n.id=$2 FOR UPDATE OF n`,
				values
			)
		).rows[0];

		if (!node) throw new InputError('Node not found', 404);
		if (node.paired) {
			throw new InputError('Unpair this node and wait for hub confirmation before deleting it.', 409);
		}

		await db.query(
			`UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id IN
			(SELECT client_id FROM kage_node_client_mappings WHERE tenant_id=$1 AND node_id=$2)`,
			values
		);
		await db.query(
			'DELETE FROM kage_node_client_mappings WHERE tenant_id=$1 AND node_id=$2',
			values
		);
		await db.query(
			`UPDATE kage_commands SET node_id=NULL,
			status=CASE WHEN status='queued' THEN 'cancelled' WHEN status='dispatching' THEN 'unconfirmed' ELSE status END,
			expires_at=LEAST(expires_at,now()) WHERE tenant_id=$1 AND (node_id=$2 OR (broker_id=$3 AND topic=ANY($4::text[])))`,
			[
				tenant,
				id,
				node.broker_id,
				['pairing', 'unpair'].map(
					(kind) => `kage/hub/live/${node.hub_code}/${kind}_response/${node.mac_address}`
				)
			]
		);
		await db.query(
			'DELETE FROM kage_pairing_requests WHERE tenant_id=$1 AND hub_id=$2 AND mac_address=$3',
			[tenant, node.hub_id, node.mac_address]
		);
		await db.query('DELETE FROM kage_nodes WHERE tenant_id=$1 AND id=$2', values);

		return 'Unpaired node deleted.';
	}

	throw new InputError('Unsupported delete action');
}
