import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { accountForSession } from '#lib/server/auth.ts';
import { allowedOrigins } from '#lib/server/origin.ts';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (
		process.env.NODE_ENV === 'production' &&
		!allowedOrigins(process.env.CORS_ALLOW_ORIGINS).has(event.url.origin)
	) {
		return new Response('Invalid request host', { status: 403 });
	}

	if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
		if (event.request.headers.get('origin') !== event.url.origin) {
			return json({ error: 'Invalid request origin' }, { status: 403 });
		}
		if (Number(event.request.headers.get('content-length') || 0) > 32768) {
			return json({ error: 'Request too large' }, { status: 413 });
		}
	}

	event.locals.account = await accountForSession(event.cookies.get('kage_session'));
	const publicPath = pathname === '/auth' || pathname.startsWith('/api/auth/');

	if (!publicPath && !event.locals.account) {
		if (pathname.startsWith('/api/')) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		redirect(303, '/auth');
	}

	const response = await resolve(event);
	response.headers.set('Cache-Control', 'no-store');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');

	return response;
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	console.error(
		`[HTTP] Request failed (${kind}) ${event.request.method} ${event.url.pathname}`,
		error
	);

	return { message: 'Could not complete the request.' };
};
