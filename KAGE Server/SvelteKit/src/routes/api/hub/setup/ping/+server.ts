import { json } from '@sveltejs/kit';

export function GET() {
	return json(
		{
			error: 'This legacy HTTP device endpoint is retired. Devices use MQTT. See the server protocol documentation.'
		},
		{ status: 410 }
	);
}

export const POST = GET;
