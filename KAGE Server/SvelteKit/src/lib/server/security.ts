import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { required } from './config.ts';

export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function key() {
	const value = Buffer.from(required('KAGE_ENCRYPTION_KEY'), 'base64');

	if (value.length !== 32) throw new Error('KAGE_ENCRYPTION_KEY must encode 32 bytes');

	return value;
}

export function encrypt(value: string, context: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	cipher.setAAD(Buffer.from(context));
	const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

	return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}

export function decrypt(value: string, context: string): string {
	const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64'));
	const cipher = createDecipheriv('aes-256-gcm', key(), iv);
	cipher.setAAD(Buffer.from(context));
	cipher.setAuthTag(tag);

	return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}

export const verificationHash = (email: string, code: string) => createHmac('sha256', key()).update(`${email}:${code}`).digest('hex');

function derive(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scrypt(
			password,
			salt,
			64,
			{ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
			(error, result) => (error ? reject(error) : resolve(result))
		)
	);
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');

	return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string) {
	const [, salt, encoded] = hash.split(':');
	const actual = await derive(password, salt);
	const expected = Buffer.from(encoded, 'hex');

	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
