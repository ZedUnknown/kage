import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { dashboard } from '#lib/server/devices.ts';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	if (!locals.account) redirect(303, '/auth');

	depends('app:workspace');

	return { account: locals.account, dashboard: await dashboard(locals.account) };
};
