import { pool } from '../db/postgres.ts';
import { parseRequest, reply } from './protocol.ts';
import type { BrokerContext, Publish } from './ingest.ts';

// Listen even before Client provisioning is confirmed, so setup can return a
// denial instead of silently timing out. Authorization still happens below.
export const clientSetupRequestFilter = 'kage/client/setup/by-user/+/request';

// The broker must bind this exact namespace to CONNECT username using its ACL.
export async function enroll(
	context: BrokerContext,
	topic: string,
	payload: Buffer,
	publish: Publish
) {
	const match = /^kage\/client\/setup\/by-user\/([A-Za-z0-9_-]{1,64})\/request$/.exec(topic);

	if (!match) return false;

	const base = `kage/client/setup/by-user/${match[1]}`;
	const envelope = JSON.parse(payload.toString('utf8'));

	if (
		typeof envelope?.reply_to !== 'string' ||
		!new RegExp(`^${base}/response/kage-pc-[a-f0-9]{32}$`).test(envelope.reply_to)
	) {
		throw new Error('Invalid enrollment reply topic');
	}

	const request = parseRequest(payload, envelope.reply_to);
	const { rows } = await pool.query(
		`SELECT c.id,c.pc_id,h.hub_id,d.id AS credential_id FROM kage_device_credentials d
         JOIN kage_clients c ON c.tenant_id=d.tenant_id AND c.id=d.client_id AND c.broker_id=d.broker_id
         JOIN kage_hubs h ON h.tenant_id=c.tenant_id AND h.id=c.hub_id
         WHERE d.tenant_id=$1 AND d.broker_id=$2 AND d.username=$3 AND d.status='admin_confirmed'`,
		[context.tenant_id, context.id, match[1]]
	);
	const client = rows[0];

	if (
		!client ||
		!['assignment', 'hub_check', 'pc_check', 'register'].includes(request.action) ||
		(request.action !== 'assignment' &&
			(request.data.hub_id !== client.hub_id ||
				(request.action !== 'hub_check' && request.data.pc_id !== client.pc_id)))
	) {
		await publish(
			request.reply,
			reply(
				request.requestId,
				{},
				'NOT_AUTHORIZED',
				client
					? 'These Client credentials are not assigned to that Hub/PC. Use the Hub and PC assigned in KAGE.'
					: 'Register this Client under its Hub in KAGE, provision its Client username/token on the broker, and confirm provisioning. Use those Client credentials here.'
			)
		);

		return true;
	}

	if (request.action === 'register') {
		await pool.query(
			`UPDATE kage_device_credentials SET connection_verified_at=COALESCE(connection_verified_at,now())
         WHERE tenant_id=$1 AND id=$2 AND status='admin_confirmed'`,
			[context.tenant_id, client.credential_id]
		);
	}

	const data =
		request.action === 'assignment'
			? { hub_id: client.hub_id, pc_id: client.pc_id }
			: request.action === 'hub_check'
				? { available: true, available_pcs: [client.pc_id] }
				: request.action === 'pc_check'
					? { available: true }
					: { registered: true };
	await publish(request.reply, reply(request.requestId, data));

	return true;
}
