import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSession, login, register, rateLimit, sendVerification } from '#lib/server/auth.ts';
import { verificationRequired } from '#lib/server/config.ts';
import { pool } from '#lib/server/db/postgres.ts';
import { digest } from '#lib/server/security.ts';
import { InputError } from '#lib/server/validation.ts';
import { readBody, failure } from '#lib/server/http.ts';

export const GET: RequestHandler = ({ params }) =>
	params.action === 'config'
		? json({ verification_required: verificationRequired() })
		: json({ error: 'Not found' }, { status: 404 });

export const POST: RequestHandler = async (event) => {
	try {
		await rateLimit(`auth-ip:${event.getClientAddress()}`, 30, 900);
		const input = await readBody(event.request);

		if (event.params.action === 'logout') {
			await pool.query('DELETE FROM kage_sessions WHERE token_hash=$1', [
				digest(event.cookies.get('kage_session') || '')
			]);
			event.cookies.delete('kage_session', { path: '/' });

			return json({ ok: true });
		}

		if (event.params.action === 'verify') {
			await sendVerification(input.email);

			return json({ ok: true });
		}

		if (!['register', 'login'].includes(event.params.action)) {
			throw new InputError('Not found', 404);
		}

		const userId = event.params.action === 'register' ? await register(input) : await login(input);
		event.cookies.set('kage_session', await createSession(userId), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 7 * 86400,
			secure: event.url.protocol === 'https:' || process.env.NODE_ENV === 'production'
		});

		return json({ ok: true });
	} catch (error) {
		return failure(error);
	}
};
