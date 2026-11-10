import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dashboard, manage } from '#lib/server/devices.ts';
import { rateLimit } from '#lib/server/auth.ts';
import { failure, readBody } from '#lib/server/http.ts';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.account) return json({ error: 'Authentication required' }, { status: 401 });

	try {
		if (params.resource !== 'dashboard') return json({ error: 'Not found' }, { status: 404 });

		return json(await dashboard(locals.account));
	} catch (error) {
		return failure(error);
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.account) return json({ error: 'Authentication required' }, { status: 401 });

	try {
		await rateLimit(`admin:${locals.account.id}`, 120, 60);

		return json(await manage(locals.account, params.resource, await readBody(request)));
	} catch (error) {
		return failure(error);
	}
};
