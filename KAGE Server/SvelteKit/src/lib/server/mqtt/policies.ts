import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { pool, transaction } from '../db/postgres.ts';
import { activeStatuses } from './lifecycle.ts';
import { clientState } from './protocol.ts';
import { InputError, integer } from '../validation.ts';

type Command = {
	command_id: string;
	version: number;
	protocol_version: number;
	command: string;
	priority: number;
	deadline_utc: string;
	expires_at_utc: string;
	server_time_utc: string;
	reason?: string;
	node_id?: string;
	episode?: string;
	extension_count?: number;
	extension_active?: boolean;
	allow_extension?: boolean;
	allow_cancellation?: boolean;
	extension_duration_seconds?: number;
	target_command_id?: string;
	target_deadline_utc?: string;
	message: string;
};

type Runtime = { presence?: string | null; activity?: string | null };

type Presence = Parameters<typeof clientState>[0] & { occupancy_since?: Date | null };

type Policy = {
	enabled: boolean;
	action: string;
	delay_seconds: number;
	allow_extension: boolean;
	extension_duration_seconds: number;
	maximum_extensions: number;
	inactivity_monitoring_enabled: boolean;
	inactivity_timeout_seconds: number;
	confirmation_timeout_seconds: number;
};

type Client = Presence & {
	id: string;
	tenant_id: string;
	broker_id: string;
	command_version: string | number;
	protocol_version: number;
	capabilities: string[];
	policy_runtime: Runtime;
	activity_seen_at: Date | null;
	last_input_at: Date | null;
	presence_seen_at: Date | null;
	connection_state: string;
	security_state: string;
};

export class PolicyCommandError extends InputError {
	readonly code = 'STALE_COMMAND';

	constructor() {
		super('The operation ID, version or deadline has changed or expired.', 409);
	}
}

export async function recordActivity(tenant: string, id: string, data: Record<string, unknown>) {
	const idle = data.idle_ms,
		tick = data.input_tick;

	if (
		typeof idle !== 'number' ||
		!Number.isInteger(idle) ||
		idle < 0 ||
		idle > 4294967295 ||
		typeof tick !== 'number' ||
		!Number.isInteger(tick) ||
		tick < 0 ||
		tick > 4294967295
	) {
		return;
	}

	await pool.query(
		`UPDATE kage_clients SET activity_seen_at=now(),activity_tick=$4,
	 last_input_at=CASE WHEN activity_tick IS DISTINCT FROM $4 OR last_input_at IS NULL
	 THEN GREATEST(last_input_at,now()-($5::double precision * interval '1 millisecond')) ELSE last_input_at END
	 WHERE tenant_id=$1 AND id=$2 AND presence_session=$3 AND connection_state='online'
	 AND capabilities @> '["activity_v1"]'::jsonb`,
		[tenant, id, data.session_id, tick, idle]
	);
}

// The client row serializes policy evaluation, administrator commands and user requests.
async function load(db: pg.PoolClient, tenant: string, id: string) {
	const client = (
		await db.query(
			`SELECT c.*,h.hub_id AS hub_code,h.last_seen AS hub_last_seen,
	 (h.connection_state='online' AND b.enabled AND b.acl_confirmed AND b.connection_state='connected'
	 AND b.last_seen>now()-interval '30 seconds') AS hub_online,
	 m.node_id,n.mac_address,n.paired AS node_paired,n.occupancy AS node_occupancy,
	 n.last_seen AS node_last_seen,n.occupancy_since
	 FROM kage_clients c JOIN kage_hubs h ON h.tenant_id=c.tenant_id AND h.id=c.hub_id
	 JOIN kage_mqtt_brokers b ON b.tenant_id=c.tenant_id AND b.id=c.broker_id
	 JOIN kage_device_credentials d ON d.tenant_id=c.tenant_id AND d.client_id=c.id AND d.status='admin_confirmed'
	 LEFT JOIN kage_node_client_mappings m ON m.tenant_id=c.tenant_id AND m.client_id=c.id
	 LEFT JOIN kage_nodes n ON n.tenant_id=m.tenant_id AND n.id=m.node_id
	 WHERE c.tenant_id=$1 AND c.id=$2 FOR UPDATE OF c`,
			[tenant, id]
		)
	).rows[0] as Client | undefined;

	if (!client) return null;

	const policy = (
		await db.query('SELECT * FROM kage_security_policies WHERE tenant_id=$1 FOR SHARE', [tenant])
	).rows[0] as Policy | undefined;
	const current = (
		await db.query(
			`SELECT payload,status FROM kage_commands WHERE tenant_id=$1 AND client_id=$2
	 AND version=$3 AND status=ANY($4::text[]) AND expires_at>now()`,
			[tenant, id, client.command_version, activeStatuses]
		)
	).rows[0];

	return {
		client,
		policy,
		active: current?.payload as Command | undefined,
		status: current?.status as string | undefined
	};
}

async function queue(db: pg.PoolClient, client: Client, command: Command, previous?: Command) {
	command.command_id = randomUUID();
	command.version = Number(client.command_version) + 1;
	if (!Number.isSafeInteger(command.version)) throw new Error('Command version exhausted');

	command.protocol_version = 1;
	command.server_time_utc = new Date().toISOString();
	if (previous) {
		await db.query(
			`UPDATE kage_commands SET status='superseded' WHERE tenant_id=$1 AND id=$2
	 AND status=ANY($3::text[])`,
			[client.tenant_id, previous.command_id, activeStatuses]
		);
	}

	await db.query(
		`INSERT INTO kage_commands(id,tenant_id,broker_id,client_id,kind,topic,payload,version,expires_at)
	 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		[
			command.command_id,
			client.tenant_id,
			client.broker_id,
			client.id,
			command.command,
			`kage/client/${client.hub_code}/${client.pc_id}/command`,
			command,
			command.version,
			command.expires_at_utc
		]
	);
	await db.query('UPDATE kage_clients SET command_version=$3 WHERE tenant_id=$1 AND id=$2', [
		client.tenant_id,
		client.id,
		command.version
	]);
	await db.query(
		'UPDATE kage_device_states SET dirty=true,updated_at=now() WHERE tenant_id=$1 AND client_id=$2',
		[client.tenant_id, client.id]
	);
	await db.query('INSERT INTO kage_events(tenant_id,broker_id,kind,detail) VALUES ($1,$2,$3,$4)', [
		client.tenant_id,
		client.broker_id,
		'policy.command',
		{
			client_id: client.id,
			command_id: command.command_id,
			command: command.command,
			reason: command.reason
		}
	]);

	return command;
}

async function cancel(db: pg.PoolClient, client: Client, active: Command, message: string) {
	const now = new Date().toISOString();

	return queue(
		db,
		client,
		{
			...active,
			command: `cancel_${active.command}`,
			target_command_id: active.command_id,
			target_deadline_utc: active.deadline_utc,
			deadline_utc: now,
			expires_at_utc: new Date(Date.now() + 30000).toISOString(),
			allow_extension: false,
			allow_cancellation: false,
			message
		},
		active
	);
}

export function presenceEpisode(client: Presence, now = Date.now()) {
	const state = clientState(client, now);
	const since = client.occupancy_since ?? client.node_last_seen;

	return since && state.sensor.online && state.sensor.state === 'empty'
		? `${client.node_id}:${new Date(since).toISOString()}`
		: null;
}

export function activityEpisode(
	client: Pick<Client, 'capabilities' | 'activity_seen_at' | 'last_input_at'>,
	policy: Pick<Policy, 'inactivity_monitoring_enabled' | 'inactivity_timeout_seconds'>,
	now = Date.now()
) {
	return policy.inactivity_monitoring_enabled &&
		client.capabilities?.includes('activity_v1') &&
		client.activity_seen_at &&
		new Date(client.activity_seen_at).getTime() >= now - 15000 &&
		client.last_input_at &&
		now - new Date(client.last_input_at).getTime() >= policy.inactivity_timeout_seconds * 1000
		? new Date(client.last_input_at).toISOString()
		: null;
}

export async function reconcileClient(tenant: string, id: string) {
	return transaction(async (db) => {
		const loaded = await load(db, tenant, id);

		if (!loaded || !loaded.policy) return;

		const { client, policy, active, status } = loaded;
		const runtime: Runtime = { ...client.policy_runtime };
		const presence = policy.enabled ? presenceEpisode(client) : null;
		const activity = activityEpisode(client, policy);

		if (!presence) runtime.presence = null;

		if (!policy.inactivity_monitoring_enabled) runtime.activity = null;
		// Cancel only policy operations. A forced administrator action always wins.
		if (active?.reason && !active.command.startsWith('cancel_') && status !== 'executing') {
			const invalidPresence =
				active.reason === 'presence' && (!presence || active.episode !== presence);
			const invalidActivity = active.reason === 'activity' && !policy.inactivity_monitoring_enabled;

			if (invalidPresence || invalidActivity || active.command !== policy.action) {
				await cancel(db, client, active, 'Policy condition cleared or settings changed.');
				if (active.command !== policy.action) {
					runtime[active.reason === 'presence' ? 'presence' : 'activity'] = null;
				}
			} else if (
				active.allow_extension !==
					(policy.allow_extension && (active.extension_count ?? 0) < policy.maximum_extensions) ||
				active.extension_duration_seconds !== policy.extension_duration_seconds
			) {
				await queue(
					db,
					client,
					{
						...active,
						allow_extension:
							policy.allow_extension && (active.extension_count ?? 0) < policy.maximum_extensions,
						extension_duration_seconds: policy.extension_duration_seconds
					},
					active
				);
			}
		} else if (
			!active &&
			client.protocol_version === 1 &&
			client.connection_state === 'online' &&
			client.presence_seen_at &&
			new Date(client.presence_seen_at).getTime() >= Date.now() - 30000 &&
			client.security_state === 'unlocked'
		) {
			// Presence takes precedence when both conditions become true together.
			const reason =
				presence && runtime.presence !== presence
					? 'presence'
					: activity && runtime.activity !== activity
						? 'activity'
						: null;

			if (reason) {
				const episode = (reason === 'presence' ? presence : activity)!;
				const seconds =
					reason === 'presence' ? policy.delay_seconds : policy.confirmation_timeout_seconds;
				await queue(db, client, {
					command_id: '',
					version: 0,
					protocol_version: 1,
					command: policy.action,
					priority: reason === 'presence' ? 10 : 20,
					reason,
					episode,
					node_id: reason === 'presence' ? (client.node_id ?? undefined) : undefined,
					extension_count: 0,
					extension_active: false,
					allow_extension: policy.allow_extension,
					allow_cancellation: true,
					extension_duration_seconds: policy.extension_duration_seconds,
					deadline_utc: new Date(Date.now() + seconds * 1000).toISOString(),
					expires_at_utc: new Date(Date.now() + (seconds + 30) * 1000).toISOString(),
					server_time_utc: '',
					message:
						reason === 'presence'
							? 'Your assigned chair is empty.'
							: 'No keyboard or mouse activity detected. Confirm you are here to continue.'
				});
				runtime[reason === 'presence' ? 'presence' : 'activity'] = episode;
			}
		}

		if (JSON.stringify(runtime) !== JSON.stringify(client.policy_runtime)) {
			await db.query('UPDATE kage_clients SET policy_runtime=$3 WHERE tenant_id=$1 AND id=$2', [
				tenant,
				id,
				runtime
			]);
		}
	});
}

export async function reconcilePolicies(tenant: string, broker: string) {
	const clients = await pool.query(
		'SELECT id FROM kage_clients WHERE tenant_id=$1 AND broker_id=$2',
		[tenant, broker]
	);

	for (const client of clients.rows) await reconcileClient(tenant, client.id);
}

export async function changePolicyCommand(
	tenant: string,
	id: string,
	action: string,
	data: Record<string, unknown>
) {
	return transaction(async (db) => {
		const loaded = await load(db, tenant, id);

		if (!loaded) throw new InputError('Client unavailable', 409);

		const { client, policy, active, status } = loaded;

		if (
			!active ||
			data.command_id !== active.command_id ||
			data.version !== active.version ||
			Date.parse(String(data.deadline_utc)) !== Date.parse(active.deadline_utc) ||
			Date.parse(active.deadline_utc) <= Date.now() ||
			status === 'executing'
		) {
			throw new PolicyCommandError();
		}
		if (!['auto_lock', 'auto_logout'].includes(active.command) || !active.reason) {
			throw new InputError('Administrator operations cannot be changed here.', 403);
		}
		if (!policy) throw new InputError('Policy unavailable', 409);

		if (action === 'confirm_activity') {
			if (active.reason !== 'activity') {
				throw new InputError('This is not an inactivity prompt.', 409);
			}

			await db.query(
				'UPDATE kage_clients SET last_input_at=now(),activity_seen_at=now() WHERE tenant_id=$1 AND id=$2',
				[tenant, id]
			);

			return cancel(db, client, active, 'User confirmed activity.');
		}

		const episode = policy.enabled ? presenceEpisode(client) : null;

		if (active.reason === 'presence' && (episode !== active.episode || !episode)) {
			if (action !== 'cancel_extension') {
				throw new InputError('Chair presence changed. Refresh the current operation.', 409);
			}
		}

		if (action === 'cancel_extension') {
			const state = clientState(client);

			if (
				active.reason !== 'presence' ||
				!active.extension_active ||
				!state.chair?.online ||
				!state.chair.occupied
			) {
				throw new InputError('Cancellation requires fresh occupied chair presence.', 409);
			}

			return cancel(db, client, active, 'Chair presence restored.');
		}

		if ((active.extension_count ?? 0) >= policy.maximum_extensions) {
			throw new InputError('Maximum extensions reached.', 409);
		}
		if (action !== 'extend' || !policy.allow_extension || !active.allow_extension) {
			throw new InputError('Extensions are disabled.', 403);
		}
		if (active.reason === 'activity' && !policy.inactivity_monitoring_enabled) {
			throw new InputError('Inactivity monitoring is disabled.', 409);
		}
		// The configured duration is authoritative; a client cannot choose a larger value.
		const seconds = integer(data.requested_seconds, 10, 3600);

		if (seconds !== policy.extension_duration_seconds) {
			throw new InputError('Use the configured extension duration.', 400);
		}

		const deadline = Date.parse(active.deadline_utc) + seconds * 1000;

		if (deadline + 30000 > Date.now() + 86400000) {
			throw new InputError('The extended deadline cannot exceed 24 hours.', 409);
		}

		return queue(
			db,
			client,
			{
				...active,
				extension_active: true,
				extension_count: (active.extension_count ?? 0) + 1,
				allow_extension: (active.extension_count ?? 0) + 1 < policy.maximum_extensions,
				deadline_utc: new Date(deadline).toISOString(),
				expires_at_utc: new Date(deadline + 30000).toISOString(),
				message: 'Extension approved by the server.'
			},
			active
		);
	});
}
