import type pg from 'pg';
import { pool } from '../db/postgres.ts';
import { integer, text, uuid } from '../validation.ts';

export const protocolVersion = 1;
export const capabilities = ['command_lifecycle_v1', 'presence_v1', 'security_state_v1'];
export const activeStatuses = ['queued', 'dispatching', 'published', 'received', 'executing', 'unconfirmed'];
const terminal = ['executed', 'failed', 'cancelled', 'rejected', 'expired', 'superseded'];

export function reportStatus(current: string, incoming: string) {
	if (!['received', 'executing', 'executed', 'failed', 'cancelled', 'rejected'].includes(incoming)) {
		throw new Error('Invalid command report');
	}
	if (terminal.includes(current)) return current;
	if (current === 'executing' && incoming === 'received') return current;

	return incoming;
}

export async function activeCommand(tenant: string, client: string, version: number) {
	const result = await pool.query(
		`SELECT payload FROM kage_commands WHERE tenant_id=$1 AND client_id=$2 AND version=$3
         AND status=ANY($4::text[]) AND expires_at>now()`,
		[tenant, client, version, activeStatuses]
	);

	return result.rows[0]
		? { ...result.rows[0].payload, server_time_utc: new Date().toISOString() }
		: null;
}

export async function recordReport(
	db: pg.PoolClient,
	tenant: string,
	client: string,
	data: Record<string, unknown>
) {
	const id = uuid(data.command_id);
	const version = integer(data.version, 1, Number.MAX_SAFE_INTEGER);
	const incoming = text(data.status, 'status', 32);
	const message = typeof data.message === 'string' ? data.message.slice(0, 512) : '';
	const result = await db.query(
		'SELECT status,version,report FROM kage_commands WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR UPDATE',
		[tenant, client, id]
	);
	const command = result.rows[0];

	if (!command || Number(command.version) !== version) throw new Error('Unknown command/version');

	const status = reportStatus(command.status, incoming);
	// A delayed received/executing ACK must not replace a completed outcome or its detail.
	if (
		terminal.includes(command.status) &&
		status !== incoming &&
		!['superseded', 'expired'].includes(command.status)
	) {
		return;
	}

	await db.query(
		'UPDATE kage_commands SET status=$4,report=$5 WHERE tenant_id=$1 AND client_id=$2 AND id=$3',
		[
			tenant,
			client,
			id,
			status,
			{ status: incoming, message, received_at: new Date().toISOString() }
		]
	);
	// Duplicate reports are harmless. A transport PUBACK never invokes this transition.
	if (status !== command.status) {
		await db.query('INSERT INTO kage_events(tenant_id,kind,detail) VALUES ($1,$2,$3)', [
			tenant,
			'client.command_report',
			{ client_id: client, command_id: id, version, status: incoming, message }
		]);
	}
}
