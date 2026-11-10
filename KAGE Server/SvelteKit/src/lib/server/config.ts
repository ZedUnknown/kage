import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export function required(name: string): string {
	const value = process.env[name];

	if (!value) throw new Error(`Missing server configuration: ${name}`);

	return value;
}

export const verificationRequired = () => process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
