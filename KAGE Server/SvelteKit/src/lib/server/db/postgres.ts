import pg from 'pg';
import '../config.ts';

export const pool = new pg.Pool({
	host: process.env.DATABASE_HOST,
	port: Number(process.env.DATABASE_PORT || 5432),
	database: process.env.DATABASE_NAME,
	user: process.env.DATABASE_USER,
	password: process.env.DATABASE_PASSWORD,
	max: 12,
	connectionTimeoutMillis: 5000,
	options: '-c search_path=public -c statement_timeout=10000'
});

pool.on('error', () => console.error('[DB] Connection failure'));

export async function transaction<T>(work: (db: pg.PoolClient) => Promise<T>): Promise<T> {
	const db = await pool.connect();

	try {
		await db.query('BEGIN');
		const result = await work(db);
		await db.query('COMMIT');

		return result;
	} catch (error) {
		await db.query('ROLLBACK');
		throw error;
	} finally {
		db.release();
	}
}

export async function getDatabase() {
	return pool;
}
