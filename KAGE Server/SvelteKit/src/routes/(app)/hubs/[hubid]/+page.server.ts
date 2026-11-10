import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params }) => {
	const { dashboard } = await parent();

	if (!dashboard.hubs.some((hub) => hub.hub_id === params.hubid)) {
		error(404, 'Hub not found');
	}

	return { hubId: params.hubid };
};
