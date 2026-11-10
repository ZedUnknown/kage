import { randomInt } from 'node:crypto';
import { pool, transaction } from './db/postgres.ts';
import { digest, token, hashPassword, verifyPassword, verificationHash } from './security.ts';
import { required, verificationRequired } from './config.ts';
import { emailAddress, text, password, InputError } from './validation.ts';

export type Account = {
	id: string;
	tenant_id: string;
	full_name: string;
	email: string;
	role: string;
	email_verified_at: Date | null;
};

export async function rateLimit(key: string, limit: number, seconds: number) {
	const { rows } = await pool.query(
		`INSERT INTO kage_rate_limits(key,attempts,expires_at)
		VALUES ($1,1,now()+$2*interval '1 second') ON CONFLICT (key) DO UPDATE SET
		attempts=CASE WHEN kage_rate_limits.expires_at < now() THEN 1 ELSE kage_rate_limits.attempts+1 END,
		expires_at=CASE WHEN kage_rate_limits.expires_at < now() THEN EXCLUDED.expires_at ELSE kage_rate_limits.expires_at END
		RETURNING attempts`,
		[digest(key), seconds]
	);

	if (rows[0].attempts > limit) throw new InputError('Too many attempts. Try again later.', 429);
}

export async function accountForSession(session: string | undefined): Promise<Account | null> {
	if (!session || session.length > 100) return null;

	const { rows } = await pool.query(
		`SELECT u.id,u.tenant_id,u.full_name,u.email,u.role,u.email_verified_at
		FROM kage_sessions s JOIN kage_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
		[digest(session)]
	);

	return rows[0] || null;
}

export async function sendVerification(value: unknown) {
	if (!verificationRequired()) throw new InputError('Email verification is currently disabled');

	const email = emailAddress(value);
	await rateLimit(`verify:${email}`, 3, 900);
	const apiKey = required('RESEND_API_KEY');
	const from = required('EMAIL_FROM');
	const code = randomInt(0, 1000000).toString().padStart(6, '0');
	const hash = verificationHash(email, code);
	await pool.query(
		`INSERT INTO kage_email_verifications(email,code_hash,expires_at) VALUES ($1,$2,now()+interval '10 minutes')
		ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=EXCLUDED.expires_at,attempts=0`,
		[email, hash]
	);

	try {
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			signal: AbortSignal.timeout(10000),
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				from,
				to: [email],
				subject: 'Your KAGE verification code',
				text: `Your KAGE verification code is ${code}. It expires in 10 minutes.`
			})
		});

		if (!response.ok) throw new Error('Delivery rejected');
	} catch {
		await pool.query('DELETE FROM kage_email_verifications WHERE email=$1 AND code_hash=$2', [
			email,
			hash
		]);
		throw new InputError('Could not deliver the email. Try again later.', 503);
	}
}

export async function register(input: Record<string, unknown>) {
	const email = emailAddress(input.email);
	const fullName = text(input.full_name, 'full name');
	const hash = await hashPassword(password(input.password));
	let verified = false;

	if (verificationRequired()) {
		const code = text(input.code, 'verification code', 6);
		await rateLimit(`code:${email}`, 5, 900);
		const result = await pool.query(
			`UPDATE kage_email_verifications SET attempts=attempts+1
			WHERE email=$1 AND expires_at>now() AND attempts<5 RETURNING code_hash`,
			[email]
		);
		verified = result.rows[0]?.code_hash === verificationHash(email, code);
		if (!verified) throw new InputError('Invalid or expired verification code');
	}

	return transaction(async (db) => {
		if (verified) {
			const consumed = await db.query(
				'DELETE FROM kage_email_verifications WHERE email=$1 AND code_hash=$2 AND expires_at>now() RETURNING email',
				[email, verificationHash(email, String(input.code))]
			);

			if (!consumed.rowCount) throw new InputError('Verification code already used');
		}

		const tenant = (
			await db.query('INSERT INTO kage_tenants(name) VALUES ($1) RETURNING id', [
				`${fullName}'s workspace`
			])
		).rows[0];
		const user = (
			await db.query(
				`INSERT INTO kage_users(tenant_id,email,full_name,password_hash,email_verified_at)
			VALUES ($1,$2,$3,$4,$5) RETURNING id`,
				[tenant.id, email, fullName, hash, verified ? new Date() : null]
			)
		).rows[0];
		await db.query('INSERT INTO kage_security_policies(tenant_id) VALUES ($1)', [tenant.id]);
		await db.query(
			"INSERT INTO kage_audit_logs(tenant_id,user_id,action) VALUES ($1,$2,'account.register')",
			[tenant.id, user.id]
		);

		return user.id as string;
	});
}

export async function login(input: Record<string, unknown>) {
	const email = emailAddress(input.email);

	if (typeof input.password !== 'string' || input.password.length > 256 || !input.password) {
		throw new InputError('Invalid email or password', 401);
	}

	const pass = input.password;
	await rateLimit(`login:${email}`, 10, 900);
	const { rows } = await pool.query('SELECT id,password_hash FROM kage_users WHERE email=$1', [
		email
	]);
	const fallback = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
	const valid = await verifyPassword(pass, rows[0]?.password_hash || fallback);

	if (!valid || !rows[0]) throw new InputError('Invalid email or password', 401);

	return rows[0].id as string;
}

export async function createSession(userId: string) {
	const session = token();
	await pool.query(
		"INSERT INTO kage_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '7 days')",
		[digest(session), userId]
	);

	return session;
}
