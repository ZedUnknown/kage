import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { InputError, text } from './validation.ts';

export function hostname(value: unknown) {
	const host = text(value, 'hostname', 253).toLowerCase().replace(/\.$/, '');

	if (!/^[a-z0-9][a-z0-9.-]*$/.test(host) || host.includes('..')) {
		throw new InputError('Enter a hostname or IPv4 address without a URL or port');
	}

	return host;
}

export function publicAddress(address: string) {
	if (isIP(address) !== 4) return false;

	const [a, b] = address.split('.').map(Number);

	return !(
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && [0, 168].includes(b)) ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 198 && [18, 19].includes(b))
	);
}

export async function resolveBroker(host: string, tls: boolean) {
	const allowPrivate = (process.env.MQTT_ALLOWED_PRIVATE_HOSTS || '')
		.split(',')
		.map((s) => s.trim())
		.includes(host);

	if (
		!tls &&
		!(
			process.env.NODE_ENV !== 'production' &&
			process.env.ALLOW_PLAINTEXT_MQTT === 'true' &&
			allowPrivate
		)
	) {
		throw new InputError('Plaintext MQTT requires an explicitly allowed development broker');
	}

	const addresses = await lookup(host, { all: true, family: 4 });

	if (
		!addresses.length ||
		(!allowPrivate && addresses.some((entry) => !publicAddress(entry.address)))
	) {
		throw new InputError('This broker address requires operator approval in MQTT_ALLOWED_PRIVATE_HOSTS');
	}

	return addresses[0];
}
