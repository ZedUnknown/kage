import pg from 'pg';

import {
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_NAME,
    DATABASE_USER,
    DATABASE_PASSWORD
} from '$app/env/private';

const { Pool } = pg;

export const pool = new Pool({
    host: DATABASE_HOST,
    port: Number(DATABASE_PORT),
    database: DATABASE_NAME,
    user: DATABASE_USER,
    password: DATABASE_PASSWORD
});

pool.on('connect', () => {
    console.log('[DB] PostgreSQL client connected');
});

pool.on('error', (error) => {
    console.error('[DB] PostgreSQL pool error:', error);
});

export async function getDatabase() {
    return pool;
}