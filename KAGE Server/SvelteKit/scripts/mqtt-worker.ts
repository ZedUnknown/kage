import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import pg from 'pg';
import { pool } from '../src/lib/server/db/postgres.ts';
import { decrypt } from '../src/lib/server/security.ts';
import { resolveBroker } from '../src/lib/server/network.ts';
import { ingest, stateForClient } from '../src/lib/server/mqtt/ingest.ts';
import { clientSetupRequestFilter } from '../src/lib/server/mqtt/enrollment.ts';
import { expireOccupancy } from '../src/lib/server/mqtt/occupancy.ts';
import { reconcilePolicies } from '../src/lib/server/mqtt/policies.ts';

type Broker = {
	id: string;
	tenant_id: string;
	hostname: string;
	port: number;
	tls: boolean;
	username: string;
	password_encrypted: string;
	ca_certificate: string | null;
	acl_confirmed: boolean;
};

type Connection = {
	broker: Broker;
	lock: pg.Client;
	client: MqttClient | null;
	subscriptions: string;
	retryAt: number;
	pending: number;
	chain: Promise<void>;
};

const connections = new Map<string, Connection>();
let stopping = false;

function bounded<T>(work: Promise<T>, milliseconds = 5000): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;

	return Promise.race([
		work,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error('Timeout')), milliseconds);
		})
	]).finally(() => clearTimeout(timer));
}

async function publish(connection: Connection, topic: string, payload: unknown) {
	const client = connection.client;

	if (!client?.connected) throw new Error('Broker unavailable');
	if (!connection.broker.acl_confirmed) throw new Error('Device permissions required');

	try {
		await bounded(
			client.publishAsync(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), {
				qos: 1,
				retain: false
			})
		);
	} catch (error) {
		client.end(true);
		connection.client = null;
		connection.retryAt = Date.now() + 5000;
		throw error;
	}
}

async function setOffline(connection: Connection) {
	await pool.query(
		"UPDATE kage_mqtt_brokers SET connection_state='disconnected' WHERE tenant_id=$1 AND id=$2",
		[connection.broker.tenant_id, connection.broker.id]
	);
	await pool.query(
		"UPDATE kage_hubs SET connection_state='unknown' WHERE tenant_id=$1 AND broker_id=$2",
		[connection.broker.tenant_id, connection.broker.id]
	);
}

async function connect(connection: Connection) {
	const b = connection.broker;
	const address = await resolveBroker(b.hostname, b.tls);
	const client = mqtt.connect({
		protocol: b.tls ? 'mqtts' : 'mqtt',
		hostname: address.address,
		port: b.port,
		clientId: `kage-admin-${b.id}`,
		username: b.username,
		password: decrypt(b.password_encrypted, `${b.tenant_id}:${b.id}`),
		ca: b.ca_certificate || undefined,
		rejectUnauthorized: true,
		servername: b.hostname,
		clean: true,
		reconnectPeriod: 0,
		connectTimeout: 5000,
		queueQoSZero: false,
		resubscribe: false
	});
	connection.client = client;
	connection.subscriptions = '';
	client.on('error', () => {});
	client.on('close', () => {
		if (connection.client === client) connection.client = null;

		client.end(true);
		connection.retryAt = Date.now() + 5000;
		void setOffline(connection).catch(() => {});
	});
	client.on('message', (topic, payload, packet) => {
		if (!connection.broker.acl_confirmed || connection.pending >= 100 || payload.length > 8192) {
			return;
		}

		connection.pending++;
		connection.chain = connection.chain
			.then(() => ingest(b, topic, payload, packet.retain, (t, p) => publish(connection, t, p)))
			.catch(() => console.error(`[MQTT] Invalid or failed message on broker ${b.id}`))
			.finally(() => {
				connection.pending--;
			});
	});
	await bounded(
		new Promise<void>((resolve, reject) => {
			client.once('connect', () => resolve());
			client.once('error', reject);
			client.once('close', () => reject(new Error('Disconnected')));
		})
	);
	await pool.query(
		"UPDATE kage_mqtt_brokers SET connection_state='connected',last_seen=now() WHERE tenant_id=$1 AND id=$2",
		[b.tenant_id, b.id]
	);
}

async function tick(connection: Connection) {
	const b = connection.broker;

	if (!connection.client) {
		if (Date.now() < connection.retryAt) return;

		try {
			await connect(connection);
		} catch {
			(connection.client as MqttClient | null)?.end(true);
			connection.client = null;
			connection.retryAt = Date.now() + 5000;
			await setOffline(connection);

			return;
		}
	}

	if (!connection.client?.connected) return;

	await pool.query(
		"UPDATE kage_mqtt_brokers SET connection_state='connected',last_seen=now() WHERE tenant_id=$1 AND id=$2",
		[b.tenant_id, b.id]
	);
	if (!b.acl_confirmed) {
		if (connection.subscriptions) {
			await bounded(connection.client.unsubscribeAsync(connection.subscriptions.split('|')));
			connection.subscriptions = '';
		}

		await pool.query(
			"UPDATE kage_hubs SET connection_state='unknown' WHERE tenant_id=$1 AND broker_id=$2 AND connection_state<>'unknown'",
			[b.tenant_id, b.id]
		);

		return;
	}

	await reconcilePolicies(b.tenant_id, b.id);
	const clients = (
		await pool.query(
			`SELECT c.id,c.pc_id,d.username,h.hub_id,s.dirty,s.updated_at FROM kage_clients c JOIN kage_hubs h ON h.id=c.hub_id AND h.tenant_id=c.tenant_id
		JOIN kage_device_credentials d ON d.client_id=c.id AND d.tenant_id=c.tenant_id JOIN kage_device_states s ON s.client_id=c.id AND s.tenant_id=c.tenant_id
		WHERE c.tenant_id=$1 AND c.broker_id=$2 AND d.status='admin_confirmed'`,
			[b.tenant_id, b.id]
		)
	).rows;
	const topics = [
		clientSetupRequestFilter,
		'kage/client/+/+/request',
		'kage/client/+/+/presence',
		'kage/hub/live/+/+',
		'kage/hub/live/+/occupancy/+/+'
	].sort();
	const fingerprint = topics.join('|');

	if (connection.subscriptions !== fingerprint) {
		const old = connection.subscriptions.split('|').filter((topic) => topic && !topics.includes(topic));

		if (old.length) await bounded(connection.client.unsubscribeAsync(old));

		const result = await bounded(connection.client.subscribeAsync(topics, { qos: 1 }));

		if (result.some((entry) => entry.qos === 128)) throw new Error('Subscription rejected');

		connection.subscriptions = fingerprint;
	}

	for (const client of clients.filter((c) => c.dirty)) {
		await publish(
			connection,
			`kage/client/${client.hub_id}/${client.pc_id}/state`,
			await stateForClient(b.tenant_id, client.id)
		);
		await pool.query(
			'UPDATE kage_device_states SET dirty=false WHERE tenant_id=$1 AND client_id=$2 AND updated_at=$3',
			[b.tenant_id, client.id, client.updated_at]
		);
	}

	const commands = (
		await pool.query(
			`UPDATE kage_commands SET status='dispatching' WHERE id IN
		(SELECT q.id FROM kage_commands q WHERE q.tenant_id=$1 AND q.broker_id=$2 AND q.status='queued' AND q.expires_at>now()
		AND (q.client_id IS NULL OR EXISTS (SELECT 1 FROM kage_device_credentials d WHERE d.tenant_id=q.tenant_id AND d.client_id=q.client_id AND d.status='admin_confirmed'))
        AND (q.client_id IS NULL OR EXISTS (SELECT 1 FROM kage_clients c WHERE c.tenant_id=q.tenant_id AND c.id=q.client_id
            AND c.command_version=q.version AND c.protocol_version=1 AND c.capabilities @> '["command_lifecycle_v1"]'::jsonb))
		ORDER BY q.created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`,
			[b.tenant_id, b.id]
		)
	).rows;

	for (const command of commands) {
		let status = 'published';

		try {
			const authorized = command.client_id
				? (
						await pool.query(
							"SELECT 1 FROM kage_device_credentials WHERE tenant_id=$1 AND broker_id=$2 AND client_id=$3 AND status='admin_confirmed'",
							[b.tenant_id, b.id, command.client_id]
						)
					).rowCount
				: command.kind === 'identify'
					? (
							await pool.query(
								`SELECT 1 FROM kage_nodes n
								JOIN kage_hubs h ON h.tenant_id=n.tenant_id AND h.id=n.hub_id
								JOIN kage_device_credentials d ON d.tenant_id=h.tenant_id AND d.hub_id=h.id
								WHERE n.tenant_id=$1 AND h.broker_id=$2 AND n.id=$3 AND n.paired
								AND d.status='admin_confirmed' AND n.mac_address=$4
								AND $5='kage/hub/live/' || h.hub_id || '/identify'`,
								[b.tenant_id, b.id, command.node_id, command.payload.mac_address, command.topic]
							)
						).rowCount
					: (
							await pool.query(
								`SELECT 1 FROM kage_hubs h JOIN kage_device_credentials d ON d.tenant_id=h.tenant_id AND d.hub_id=h.id
					WHERE h.tenant_id=$1 AND h.broker_id=$2 AND d.status='admin_confirmed'
					AND split_part($3,'/',4)=h.hub_id`,
								[b.tenant_id, b.id, command.topic]
							)
						).rowCount;

			if (!authorized) status = 'failed';
			else if (new Date(command.expires_at).getTime() <= Date.now()) status = 'expired';
			else {
				if (command.client_id) command.payload.server_time_utc = new Date().toISOString();

				await publish(connection, command.topic, command.payload);
			}
		} catch {
			status = 'unconfirmed';
		}

		await pool.query(
			"UPDATE kage_commands SET status=$3,published_at=CASE WHEN $3='published' THEN now() ELSE NULL END WHERE tenant_id=$1 AND id=$2 AND status='dispatching'",
			[b.tenant_id, command.id, status]
		);
	}
}

async function release(connection: Connection) {
	connection.client?.end(true);
	await connection.chain;
	await setOffline(connection);
	await connection.lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
		connection.broker.id
	]);
	await connection.lock.end();
}

async function cycle() {
	const brokers: Broker[] = (await pool.query('SELECT * FROM kage_mqtt_brokers WHERE enabled'))
		.rows;

	for (const [id, connection] of connections) {
		const current = brokers.find((b) => b.id === id);
		const settings = ['hostname', 'port', 'tls', 'username', 'password_encrypted', 'ca_certificate'] as const;

		if (!current || settings.some((key) => current[key] !== connection.broker[key])) {
			connections.delete(id);
			await release(connection);
		} else {
			connection.broker = current;
		}
	}

	for (const broker of brokers) {
		if (connections.has(broker.id)) continue;

		const lock = new pg.Client(pool.options);
		await lock.connect();
		const held = (
			await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS held', [broker.id])
		).rows[0].held;

		if (!held) {
			await lock.end();
			continue;
		}

		const connection: Connection = {
			broker,
			lock,
			client: null,
			subscriptions: '',
			retryAt: 0,
			pending: 0,
			chain: Promise.resolve()
		};
		lock.on('error', () => {
			connection.client?.end(true);
			connections.delete(broker.id);
		});
		connections.set(broker.id, connection);
	}

	await pool.query(
		"UPDATE kage_commands SET status='expired' WHERE status IN ('queued','published','received','unconfirmed') AND expires_at<=now()"
	);
	await pool.query(
		"UPDATE kage_commands SET status='unconfirmed' WHERE status='dispatching' AND expires_at<now()-interval '30 seconds'"
	);
	await pool.query(
		"UPDATE kage_pairing_requests SET status='expired' WHERE status IN ('pending','approved') AND expires_at<=now()"
	);
	await expireOccupancy();
	await pool.query('DELETE FROM kage_rate_limits WHERE expires_at<now()');
	await pool.query('DELETE FROM kage_sessions WHERE expires_at<now()');
	await pool.query('DELETE FROM kage_email_verifications WHERE expires_at<now()');
	await Promise.allSettled(
		[...connections.values()].map(async (connection) => {
			try {
				await tick(connection);
			} catch {
				connection.client?.end(true);
				connection.client = null;
				connection.retryAt = Date.now() + 5000;
				await setOffline(connection);
			}
		})
	);
}

process.on('SIGINT', () => {
	stopping = true;
});
process.on('SIGTERM', () => {
	stopping = true;
});
console.log('[MQTT] Worker started. Broker credentials and payloads are never logged.');

try {
	while (!stopping) {
		try {
			await cycle();
		} catch {
			console.error('[MQTT] Reconciliation failed. Retrying.');
		}

		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
} finally {
	await Promise.allSettled([...connections.values()].map(release));
	await pool.end();
}
