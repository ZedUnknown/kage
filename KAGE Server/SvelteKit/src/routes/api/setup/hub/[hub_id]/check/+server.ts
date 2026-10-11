import { json} from '@sveltejs/kit';
import { getDatabase } from '#lib/server/db/postgres.ts';

export async function GET({ params }) {
    const hub_id = params.hub_id;

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
            "available": true,
            "available_pcs": ["pc1", "pc2", "pc3", "pc4", "pc5", "pc6", "pc7", "pc8", "pc9", "pc10"],
        },
        "detail": {
            "code": "SUCCESS",
            "message": `Hub ${hub_id} is available`
        }
    });
}