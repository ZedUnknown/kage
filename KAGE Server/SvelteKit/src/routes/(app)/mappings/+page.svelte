<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import SearchDropDown from '#lib/client/components/common/SearchDropDown.svelte';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	const { submit } = actions;
</script>

<WorkspacePage
	title="Mappings"
	description="Map PCs to Chair Nodes. Each PC and Chair Node can have only one mapping."
	{actions}
>
	{#each overview.clients as client (client.id)}<section class="panel">
			<h2>{client.name} - {client.pc_id}</h2>
			<form class="form-grid" onsubmit={(e) => submit(e, 'mappings', { client_id: client.id })}>
				<div class="form-field">
					<label for={`mapped-node-${client.id}`}>Chair Node</label>
					<SearchDropDown
						id={`mapped-node-${client.id}`}
						name="node_id"
						label="Chair Node"
						placeholder="Unmapped"
						value={client.node_id || ''}
						disabled={actions.busy}
						items={overview.nodes
							.filter(
								(node) =>
									node.paired &&
									node.hub_id === client.hub_id &&
									(!node.client_id || node.client_id === client.id)
							)
							.map((node) => ({ value: node.id, label: node.mac_address }))}
					/>
				</div>
				<div><button disabled={actions.busy}>Save mapping</button></div>
			</form>
		</section>{:else}<p class="empty">
			Register a PC under Clients before mapping Chair Nodes.
		</p>{/each}
</WorkspacePage>
