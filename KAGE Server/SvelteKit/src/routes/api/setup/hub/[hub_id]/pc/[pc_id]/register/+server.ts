import { json} from '@sveltejs/kit';

export async function GET({ params }) {
    const hub_id = params.hub_id;
    const pc_id = params.pc_id;

    return json({
        "data": {
            "registered": true,
            "hub_id": hub_id,
            "pc_id": pc_id,
            "mqtt" : {
                "address": "192.168.1.23",
                "port": 8883,
                "username": "PC_DEMO",
                "password": "KAGE_PC_DEMO",
            }
        },
        "detail": {
            "code": "SUCCESS",
            "message": `PC ID ${pc_id} registered for Hub ID ${hub_id}`
        }
    });
}