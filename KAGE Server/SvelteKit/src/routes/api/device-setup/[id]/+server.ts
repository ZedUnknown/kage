import type { RequestHandler } from './$types';
import { rateLimit } from '#lib/server/auth.ts';
import { failure, readBody } from '#lib/server/http.ts';
import { redeemSetup } from '#lib/server/provisioning.ts';
import { InputError } from '#lib/server/validation.ts';

export const POST: RequestHandler = async ({ params, request, url, getClientAddress }) => {
	try {
		if (url.protocol !== 'https:') throw new InputError('Setup downloads require HTTPS.', 403);
		await rateLimit(`setup-download:${getClientAddress()}`, 20, 60);
		return await redeemSetup(params.id, await readBody(request));
	} catch (error) {
		return failure(error);
	}
};
