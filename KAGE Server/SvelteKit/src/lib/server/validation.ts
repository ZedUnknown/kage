export class InputError extends Error {
	status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

export function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new InputError('Expected an object');
	}

	return value as Record<string, unknown>;
}

export function text(value: unknown, name: string, max = 128): string {
	if (typeof value !== 'string' || !value.trim() || value.length > max) {
		throw new InputError(`Invalid ${name}`);
	}

	return value.trim();
}

export function uuid(value: unknown): string {
	const id = text(value, 'resource ID', 36);

	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
		throw new InputError('Invalid resource ID');
	}

	return id;
}

export function segment(value: unknown): string {
	const id = text(value, 'device identifier', 64);

	if (!/^[A-Za-z0-9_-]+$/.test(id)) {
		throw new InputError('Use letters, digits, underscores or hyphens for device IDs');
	}

	return id;
}

export function integer(value: unknown, min: number, max: number): number {
	const n = Number(value);

	if (!Number.isInteger(n) || n < min || n > max) {
		throw new InputError(`Expected a number from ${min} to ${max}`);
	}

	return n;
}

export function emailAddress(value: unknown): string {
	const email = text(value, 'email', 254).toLowerCase();

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Invalid email address');

	return email;
}

export function password(value: unknown): string {
	if (typeof value !== 'string' || value.length < 12 || value.length > 256) {
		throw new InputError('Use a password of 12–256 characters');
	}

	return value;
}

export function secret(value: unknown, name: string, max = 1024): string {
	if (typeof value !== 'string' || !value.length || value.length > max) {
		throw new InputError(`Invalid ${name}`);
	}

	return value;
}

export function macAddress(value: unknown): string {
	const mac = text(value, 'MAC address', 17).toUpperCase();

	if (
		!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) ||
		parseInt(mac.slice(0, 2), 16) & 1 ||
		mac === '00:00:00:00:00:00'
	) {
		throw new InputError('Invalid Node MAC address');
	}

	return mac;
}
