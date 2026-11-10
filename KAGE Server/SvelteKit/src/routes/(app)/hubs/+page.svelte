<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import HubWorkspace from '#lib/client/special/HubWorkspace.svelte';
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
			<div class="empty empty-state">
				<p>No hubs registered. Register a hub to get started.</p>
				<button
					type="button"
					disabled={actions.busy}
					aria-haspopup="dialog"
					onclick={openRegistration}
				>
					Register your first hub
				</button>
			</div>
		{/if}
	{/snippet}
</WorkspacePage>
