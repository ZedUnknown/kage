import { json } from '@sveltejs/kit';
import { InputError, object } from './validation.ts';

export async function readBody(request: Request) {
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		throw new InputError('Expected JSON');
	}

	const reader = request.body?.getReader();

	if (!reader) throw new InputError('Missing request body');

	const chunks: Uint8Array[] = [];
	let size = 0;

	while (true) {
		const { done, value } = await reader.read();

		if (done) break;

		size += value.length;
		if (size > 32768) {
			await reader.cancel();
			throw new InputError('Request too large', 413);
		}

		chunks.push(value);
	}

	try {
		return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
	} catch {
		throw new InputError('Invalid JSON object');
	}
}

export function failure(error: unknown) {
	if (error instanceof InputError) return json({ error: error.message }, { status: error.status });

	const code = (error as { code?: string })?.code;

	if (code === '23505' || code === '23503') {
		return json(
			{ error: 'A conflicting record exists or a referenced resource is unavailable.' },
			{ status: 409 }
		);
	}

	console.error('[API] Operation failed');

	return json({ error: 'Operation unavailable. Check the server configuration.' }, { status: 503 });
}
