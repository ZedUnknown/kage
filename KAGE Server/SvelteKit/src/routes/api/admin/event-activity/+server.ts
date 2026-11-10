import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eventActivity } from '#lib/server/event-activity.ts';
import { failure } from '#lib/server/http.ts';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.account) return json({ error: 'Authentication required' }, { status: 401 });

	try {
		return json(await eventActivity(locals.account.tenant_id));
	} catch (error) {
		return failure(error);
	}
};
