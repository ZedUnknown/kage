import { object, text } from '../validation.ts';
import { occupancyClockSkewMs, occupancyTimeoutSeconds } from './occupancy.ts';

export function parseRequest(payload: Buffer, expectedReply?: string) {
	if (payload.length > 8192) throw new Error('Payload too large');

	const request = object(JSON.parse(payload.toString('utf8')));
	const requestId = text(request.request_id, 'request ID', 64);

	if (!/^[a-zA-Z0-9_-]+$/.test(requestId)) throw new Error('Invalid request ID');

	const reply = text(request.reply_to, 'reply topic', 200);

	if (
		expectedReply
			? reply !== expectedReply
			: !/^kage\/client\/setup\/kage-pc-[a-f0-9]{32}\/response$/.test(reply)
	) {
		throw new Error('Invalid reply topic');
	}

	return {
		requestId,
		reply,
		action: text(request.action, 'action', 32),
		data: object(request.data)
	};
}

export const reply = (
	requestId: string,
	data: object,
	code = 'SUCCESS',
	message = 'Request completed.'
) => ({ request_id: requestId, data, detail: { code, message } });

export const hubPingResponse = { data: { key: 'KAGE' } };

export function clientState(
	row: {
		hub_code: string;
		pc_id: string;
		hub_online: boolean;
		hub_last_seen: Date | null;
		node_id: string | null;
		mac_address: string | null;
		node_paired?: boolean;
		node_occupancy?: string;
		node_last_seen?: Date | null;
	},
	now = Date.now()
) {
	const lastSeen = row.node_last_seen?.getTime();
	const online =
		!!row.node_id &&
		row.node_paired === true &&
		row.hub_online &&
		lastSeen !== undefined &&
		lastSeen >= now - occupancyTimeoutSeconds * 1000 &&
		lastSeen <= now + occupancyClockSkewMs &&
		['occupied', 'empty'].includes(row.node_occupancy ?? '');

	return {
		hub: {
			hub_id: row.hub_code,
			online: row.hub_online,
			last_seen: row.hub_last_seen?.toISOString() || ''
		},
		pc: { pc_id: row.pc_id },
		assignment: { assigned: !!row.node_id, chair_id: row.mac_address },
		chair: row.node_id
			? {
					chair_id: row.mac_address,
					online,
					occupied: online && row.node_occupancy === 'occupied',
					last_seen: row.node_last_seen?.toISOString() || ''
				}
			: null,
		sensor: { online, state: online ? row.node_occupancy : 'unknown' }
	};
}
