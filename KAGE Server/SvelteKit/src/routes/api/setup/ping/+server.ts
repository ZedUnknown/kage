import { json} from '@sveltejs/kit';

export async function GET() {
    return json({
        "data": {
            "key": "KAGELOCK"
        },
        "detail": {
            "code": "SUCCESS",
            "message": "KAGELOCK Server is running"
        }
    });
}