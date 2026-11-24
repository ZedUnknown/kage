import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '#lib/server/auth.ts';
import { failure, readBody } from '#lib/server/http.ts';
import { manageProvisioning } from '#lib/server/provisioning.ts';

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.account) return json({ error: 'Authentication required' }, { status: 401 });
	try {
		await rateLimit(`provisioning:${locals.account.id}`, 30, 60);
		const result = await manageProvisioning(locals.account, await readBody(request), url.origin);
		return result instanceof Response ? result : json(result);
	} catch (error) {
		return failure(error);
	}
};
