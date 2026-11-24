<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import HubWorkspace from '#lib/client/special/HubWorkspace.svelte';
	import EmptyState from '#lib/client/components/common/EmptyState.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	const { action } = actions;
</script>

<WorkspacePage
	title="Hubs"
	description="Manage hubs, connected nodes, and device configuration."
	registration="hubs"
	{actions}
>
	{#snippet children(openRegistration)}
		{#if overview.hubs.length}
			<HubWorkspace
				hubs={overview.hubs}
				nodes={overview.nodes}
				clients={overview.clients}
				commands={overview.commands}
				busy={actions.busy}
				onaction={action}
				onpairing={() => goto(resolve('/(app)/pairing'))}
			/>
		{/if}
		{#if !overview.hubs.length}
			<EmptyState
				actionLabel="Register your first hub"
				disabled={actions.busy}
				onAction={openRegistration}
			>
				<p>No hubs registered. Register a hub to get started.</p>
			</EmptyState>
		{/if}
	{/snippet}
</WorkspacePage>
