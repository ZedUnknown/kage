<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import HubWorkspace from '#lib/client/special/HubWorkspace.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const workspace = getWorkspace();
	const actions = createPageActions(workspace);
	let overview = $derived(workspace.overview);
	let hub = $derived(overview.hubs.find((item) => item.hub_id === data.hubId));
</script>

<WorkspacePage
	title={hub?.name || 'Hub'}
	description="View connected nodes, inspect device status, and manage this hub."
	{actions}
>
	{#snippet children()}
		{#key data.hubId}
			<HubWorkspace
				hubId={data.hubId}
				hubs={overview.hubs}
				nodes={overview.nodes}
				clients={overview.clients}
				commands={overview.commands}
				busy={actions.busy}
				onaction={actions.action}
				onpairing={() => goto(resolve('/(app)/pairing'))}
			/>
		{/key}
	{/snippet}
</WorkspacePage>
