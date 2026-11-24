import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '#lib/server/auth.ts';
import { failure, readBody } from '#lib/server/http.ts';
import { accessPortal } from '#lib/server/provisioning.ts';
import { InputError } from '#lib/server/validation.ts';

export const POST: RequestHandler = async ({ params, request, url, getClientAddress }) => {
	try {
		if (url.protocol !== 'https:') throw new InputError('Setup downloads require HTTPS.', 403);
		const input = await readBody(request);
		const download = input.action === 'download';
		await rateLimit(
			`provisioning-portal:${download ? 'download' : 'list'}:${getClientAddress()}`,
			download ? 120 : 20,
			60
		);
		const result = await accessPortal(params.id, input);
		return result instanceof Response ? result : json(result);
	} catch (error) {
		return failure(error);
	}
};
