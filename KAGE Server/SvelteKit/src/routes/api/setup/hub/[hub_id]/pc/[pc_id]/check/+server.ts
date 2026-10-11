import { json} from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db/postgres.ts';

export async function GET({ params }) {
    const hub_id = params.hub_id;
    const pc_id = params.pc_id;

    // todo: check db
    const db = await getDatabase();
    // test query to check if the database connection is working
    try {
        const test = await db.query('SELECT NOW() AS time');
        console.log('[DB] Test query result:', test.rows[0].time);
    } catch (error) {
        console.error('[DB] Test query failed:', error);
    }


    return json({
        "data": {
            "available": true
        },
        "detail": {
            "code": "SUCCESS",
            "message": `PC ID ${pc_id} is available for Hub ID ${hub_id}`
        }
    });
}