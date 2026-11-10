import { pool } from './db/postgres.ts';
import type { EventActivity } from '../client/types/event-activity.ts';

export async function eventActivity(tenantId: string): Promise<EventActivity> {
	// Read completed seconds using the database clock. Never truncate busy buckets to
	// the dashboard's latest 100 records or count a partial second as a full second.
	const { rows } = await pool.query<{ second: number; events: number }>(
		`SELECT extract(epoch FROM bucket + interval '1 second')::double precision AS second,
			COALESCE(counts.events, 0)::integer AS events
		FROM generate_series(
			date_trunc('second', now()) - interval '60 seconds',
			date_trunc('second', now()) - interval '1 second',
			interval '1 second'
		) AS bucket
		LEFT JOIN (
			SELECT date_trunc('second', created_at) AS second, count(*) AS events
			FROM kage_events
			WHERE tenant_id=$1
				AND created_at >= date_trunc('second', now()) - interval '60 seconds'
				AND created_at < date_trunc('second', now())
			GROUP BY 1
		) AS counts ON counts.second=bucket
		ORDER BY bucket`,
		[tenantId]
	);

	return {
		seconds: rows.map((row) => row.second),
		counts: rows.map((row) => row.events)
	};
}
