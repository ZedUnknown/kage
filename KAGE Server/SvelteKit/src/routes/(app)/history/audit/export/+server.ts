import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '#lib/server/db/postgres.ts';
import { failure } from '#lib/server/http.ts';

function cell(value: unknown) {
	let text = value instanceof Date ? value.toISOString() : String(value ?? '');
	// Keep spreadsheet applications from interpreting saved values as formulas.
	if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;

	return `"${text.replaceAll('"', '""')}"`;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.account) return json({ error: 'Authentication required' }, { status: 401 });

	try {
		const { rows } = await pool.query(
			'SELECT id,user_id,action,resource_id,created_at FROM kage_audit_logs WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC',
			[locals.account.tenant_id]
		);
		const columns = ['id', 'user_id', 'action', 'resource_id', 'created_at'];
		const csv = [columns.join(','), ...rows.map((row) => columns.map((key) => cell(row[key])).join(','))].join('\r\n') + '\r\n';

		return new Response('\uFEFF' + csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': 'attachment; filename="kage-administrative-audit.csv"',
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		return failure(error);
	}
};
