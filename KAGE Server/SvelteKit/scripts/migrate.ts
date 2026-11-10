import { readFile, readdir } from 'node:fs/promises';
import { pool, transaction } from '../src/lib/server/db/postgres.ts';

// Recognize the original filenames so existing databases do not repeat these changes.
const previousNames: Record<string, string[]> = {
	'001_create_tables.sql': ['001_initial.sql', '001_init.sql'],
	'002_track_clients_and_commands.sql': ['002_client_lifecycle.sql'],
	'003_recheck_broker_permissions.sql': ['003_broker_topic_test.sql'],
	'004_add_policy_settings.sql': ['004_policy_preferences.sql'],
	'005_add_offline_policy_toggle.sql': ['005_offline_policy_enabled.sql'],
	'006_enable_automatic_policy_by_default.sql': ['006_automatic_policy_default.sql'],
	'007_add_node_identification_status.sql': ['007_node_identify.sql']
};

try {
	await transaction(async (db) => {
		await db.query("SELECT pg_advisory_xact_lock(hashtext('kage-migrations'))");
		await db.query(
			'CREATE TABLE IF NOT EXISTS public.kage_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
		);
		for (const name of (await readdir(new URL('../db_migrations/', import.meta.url))).sort()) {
			if (!name.endsWith('.sql')) continue;

			if (
				(
					await db.query(
						'SELECT 1 FROM public.kage_schema_migrations WHERE name = ANY($1::text[])',
						[[name, ...(previousNames[name] ?? [])]]
					)
				).rowCount
			) {
				continue;
			}

			await db.query(await readFile(new URL(`../db_migrations/${name}`, import.meta.url), 'utf8'));
			await db.query('INSERT INTO public.kage_schema_migrations(name) VALUES ($1)', [name]);
			console.log(`Applied ${name}`);
		}
	});
} catch (error) {
	console.error('Database error code:', (error as { code?: string }).code || 'unavailable');
	console.error('Migration failed. Transaction rolled back. Check database access and schema compatibility.');
	process.exitCode = 1;
} finally {
	await pool.end();
}
