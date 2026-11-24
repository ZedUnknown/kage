<script lang="ts">
	import { tick } from 'svelte';
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import Search from '#lib/client/components/common/Search.svelte';
	import DropDown from '#lib/client/components/common/DropDown.svelte';
	import SearchDropDown from '#lib/client/components/common/SearchDropDown.svelte';
	import StatusDot from '#lib/client/components/common/StatusDot.svelte';
	import SearchHighlight from '#lib/client/components/common/SearchHighlight.svelte';
	import MappingDesk from '#lib/client/components/common/MappingDesk.svelte';
	import Spinner from '#lib/client/components/common/Spinner.svelte';
	import { connectionStatus } from '#lib/client/connection-status.ts';

	const workspace = getWorkspace();
	const overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	let searchSelection = $state('');
	let hubId = $state('');
	let statusFilter = $state<'all' | 'mapped' | 'unmapped' | 'unknown'>('all');
	let selectedId = $state('');
	let nodeQuery = $state('');
	let saving = $state(false);
	let feedback = $state('');
	let failed = $state(false);

	function mappingStatus(client: (typeof overview.clients)[number]) {
		if (!client.node_id) return 'unmapped' as const;

		const node = overview.nodes.find((item) => item.id === client.node_id);

		return node && ['occupied', 'empty'].includes(node.occupancy)
			? ('mapped' as const)
			: ('unknown' as const);
	}

	const baseClients = $derived(
		overview.clients.filter((client) => {
			return (
				(!hubId || client.hub_id === hubId) &&
				(!searchSelection || client.id === searchSelection)
			);
		})
	);
	const statusCounts = $derived({
		all: baseClients.length,
		linked: baseClients.filter((client) => !!client.node_id).length,
		mapped: baseClients.filter((client) => mappingStatus(client) === 'mapped').length,
		unmapped: baseClients.filter((client) => mappingStatus(client) === 'unmapped').length,
		unknown: baseClients.filter((client) => mappingStatus(client) === 'unknown').length
	});
	const clients = $derived(
		baseClients
			.filter((client) => statusFilter === 'all' || mappingStatus(client) === statusFilter)
			.toSorted((a, b) => a.pc_id.localeCompare(b.pc_id, undefined, { numeric: true }))
	);
	const selected = $derived(clients.find((client) => client.id === selectedId) ?? clients[0]);
	const currentNode = $derived(overview.nodes.find((node) => node.id === selected?.node_id));
	const groups = $derived(
		overview.hubs
			.map((hub) => ({
				...hub,
				desks: clients.filter((client) => client.hub_id === hub.id)
			}))
			.filter((hub) => hub.desks.length)
	);
	const hubNodes = $derived(
		overview.nodes.filter((node) => node.paired && node.hub_id === selected?.hub_id)
	);
	const visibleNodes = $derived(
		hubNodes.filter((node) =>
			[node.mac_address, node.pc_id].some((value) =>
				String(value ?? '')
					.toLowerCase()
					.includes(nodeQuery.trim().toLowerCase())
			)
		)
	);
	const searchItems = $derived(
		overview.clients.map((client) => {
			const node = overview.nodes.find((item) => item.id === client.node_id);

			return {
				value: client.id,
				label: `${client.name} / ${client.pc_id}`,
				searchText: `${client.name} ${client.pc_id} ${client.hub_code} ${client.hub_id} ${node?.mac_address ?? ''}`
			};
		})
	);
	const linkedCount = $derived(statusCounts.linked);

	function chooseSearchResult(clientId: string) {
		searchSelection = clientId;

		if (!clientId) {
			selectedId = '';

			return;
		}

		const client = overview.clients.find((item) => item.id === clientId);
		if (!client) return;

		hubId = client.hub_id;
		statusFilter = 'all';
		nodeQuery = '';
		feedback = '';
		selectedId = client.id;
	}

	async function chooseDesk(id: string) {
		selectedId = id;
		nodeQuery = '';
		feedback = '';
		await tick();
		if (window.matchMedia('(max-width: 760px)').matches) {
			document.getElementById('assignment-panel')?.scrollIntoView({
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'instant'
					: 'smooth',
				block: 'start'
			});
		}
	}

	async function mapNode(nodeId: string | null) {
		if (!selected || actions.busy || saving || (selected.node_id ?? null) === nodeId) return;
		const client = selected;
		saving = true;
		feedback = '';
		try {
			const saved = await actions.action('mappings', { client_id: client.id, node_id: nodeId });
			failed = !saved;
			feedback = saved
				? nodeId
					? `Assigned ${client.pc_id}.`
					: `Removed assignment from ${client.pc_id}.`
				: 'Could not save the assignment. Try again.';
		} finally {
			saving = false;
		}
	}

	function reading(occupancy: string) {
		return occupancy === 'occupied'
			? 'Occupied'
			: occupancy === 'empty'
				? 'Unoccupied'
				: 'No recent reading';
	}
</script>

<WorkspacePage title="Mappings" description="Assign Chair Nodes to workstations." {actions}>
	{#if overview.clients.length}
		<section class="mapping-toolbar" aria-label="Workstation filters">
			<div class="toolbar-primary">
				<div class="search-field">
					<SearchDropDown
						id="mapping-workstation-search"
						label="Search workstations"
						placeholder="PC, Hub, or Chair Node"
						bind:value={searchSelection}
						onchange={chooseSearchResult}
						items={searchItems}
					/>
				</div>
				<div class="hub-filter">
					<DropDown
						label="Filter by Hub"
						placeholder="All Hubs"
						bind:value={hubId}
						searchable
						onchange={() => {
							searchSelection = '';
							selectedId = '';
						}}
						items={overview.hubs.map((hub) => ({
							value: hub.id,
							label: hub.name + ' · ' + hub.hub_id
						}))}
					/>
				</div>
			</div>
			<div class="toolbar-secondary">
				<div class="filter-group">
					<div class="plan-legend" role="group" aria-label="Filter by assignment status">
						<button
							type="button"
							class="legend-filter"
							class:active={statusFilter === 'all'}
							aria-pressed={statusFilter === 'all'}
							onclick={() => (statusFilter = 'all')}
						>
							All <span class="filter-count">{statusCounts.all}</span>
						</button>
						<button
							type="button"
							class="legend-filter mapped"
							class:active={statusFilter === 'mapped'}
							aria-pressed={statusFilter === 'mapped'}
							onclick={() => (statusFilter = 'mapped')}
						>
							<StatusDot />Mapped <span class="filter-count">{statusCounts.mapped}</span>
						</button>
						<button
							type="button"
							class="legend-filter unmapped"
							class:active={statusFilter === 'unmapped'}
							aria-pressed={statusFilter === 'unmapped'}
							onclick={() => (statusFilter = 'unmapped')}
						>
							<StatusDot />Unmapped <span class="filter-count">{statusCounts.unmapped}</span>
						</button>
						<button
							type="button"
							class="legend-filter unknown"
							class:active={statusFilter === 'unknown'}
							aria-pressed={statusFilter === 'unknown'}
							onclick={() => (statusFilter = 'unknown')}
						>
							<StatusDot />No reading <span class="filter-count">{statusCounts.unknown}</span>
						</button>
					</div>
				</div>
			</div>
		</section>

		<div class="mapping-layout">
			<section class="seating-plan" aria-label="Workstation layout">
				<header class="plan-header">
					<h2>Workstations</h2>
					<span class="plan-summary" aria-label={`${linkedCount} of ${statusCounts.all} workstations linked`}>
						<strong>{linkedCount}</strong> / {statusCounts.all} linked
					</span>
				</header>
				<div class="room-groups">
					{#each groups as group (group.id)}
						<section class="hub-room" aria-label={group.name + ' workstations'}>
							<header class="room-header">
								<div class="hub-heading">
									<h3>{group.name}</h3>
									<code>{group.hub_id}</code>
								</div>
								<span class="desk-count">{group.desks.length} {group.desks.length === 1 ? 'PC' : 'PCs'}</span>
							</header>
							<div class="desk-grid">
								{#each group.desks as client (client.id)}
									{@const node = overview.nodes.find((item) => item.id === client.node_id)}
									<MappingDesk
										name={client.name}
										pcId={client.pc_id}
										nodeMac={node?.mac_address}
										mapped={!!client.node_id}
										stale={!!client.node_id &&
											!['occupied', 'empty'].includes(node?.occupancy ?? '')}
										selected={selected?.id === client.id}
										disabled={saving}
										onclick={() => chooseDesk(client.id)}
									/>
								{/each}
							</div>
						</section>
					{:else}
						<div class="layout-empty">
							<h3>No workstations found</h3>
							<p>Try changing the search or filters.</p>
						</div>
					{/each}
				</div>
			</section>

			<aside
				id="assignment-panel"
				class="assignment-panel"
				aria-label="Workstation assignment"
				aria-busy={saving}
			>
				{#if selected}
					<header class="assignment-heading">
						<h2>Assignment</h2>
						<span class="client-connection" data-state={connectionStatus(selected.connection_state)}>
							<StatusDot />{connectionStatus(selected.connection_state)}
						</span>
					</header>

					<div class="selected-workstation">
						<div class="selected-workstation-top">
							<code>{selected.pc_id}</code>
							<span>{selected.hub_code}</span>
						</div>
						<h3>{selected.name}</h3>
					</div>

					<section class="current-assignment" aria-label="Current Chair Node">
						<div class="current-heading">
							<h3>Current node</h3>
							{#if selected.node_id}
								<span class="node-reading" data-state={currentNode?.occupancy ?? 'unknown'}>
									<StatusDot />{reading(currentNode?.occupancy ?? 'unknown')}
								</span>
							{:else}
								<span class="current-state">Unassigned</span>
							{/if}
						</div>
						{#if selected.node_id}
							<div class="current-node">
								<div class="current-node-details">
									<code>{currentNode?.mac_address ?? 'Node unavailable'}</code>
								</div>
							</div>
						{:else}
							<p class="unassigned-message">No Chair Node assigned.</p>
						{/if}
					</section>

					<div class="node-heading">
						<h3>Chair Nodes</h3>
						<span class="node-count">{hubNodes.length}</span>
					</div>
					{#if hubNodes.length}
						<div class="node-search">
							<Search
								bind:value={nodeQuery}
								aria-label="Search Chair Nodes"
								placeholder="Search by MAC address or PC"
							/>
						</div>
						<div class="node-options" role="group" aria-label="Chair Nodes on the selected Hub">
							{#each visibleNodes as node (node.id)}
								{@const assigned = selected.node_id === node.id}
								{@const owner = overview.clients.find((client) => client.node_id === node.id)}
								{@const taken =
									(!!node.client_id && node.client_id !== selected.id) ||
									(!!owner && owner.id !== selected.id)}
								<button
									type="button"
									class="node-option"
									class:assigned
									class:taken
									aria-pressed={assigned}
									disabled={actions.busy || saving || taken}
									title={taken
										? `Assigned to ${owner?.pc_id ?? node.pc_id ?? 'another PC'}`
										: `Assign ${node.mac_address} to ${selected.pc_id}`}
									onclick={() => mapNode(node.id)}
								>
									<span class="node-option-text">
										<code><SearchHighlight text={node.mac_address} query={nodeQuery} /></code>
									</span>
									<span class="node-option-state" data-state={taken ? 'taken' : assigned ? 'assigned' : node.occupancy ?? 'unknown'}>
										<span class="node-option-dot"><StatusDot /></span>
										{taken ? `Assigned to ${owner?.pc_id ?? node.pc_id ?? 'another PC'}` : assigned ? 'Current' : reading(node.occupancy)}
									</span>
								</button>
							{:else}
								<p class="node-empty">No Chair Nodes match this search.</p>
							{/each}
						</div>
					{:else}
						<p class="node-empty node-empty-panel">No paired Chair Nodes on this Hub.</p>
					{/if}

					{#if selected.node_id}
						<button
							type="button"
							class="secondary remove-mapping"
							disabled={actions.busy || saving}
							onclick={() => mapNode(null)}
						>
							Remove assignment
						</button>
					{/if}
				{:else}
					<div class="assignment-empty">
						<h2>Assignment</h2>
						<p>{clients.length ? 'Select a workstation.' : 'No workstations match these filters.'}</p>
					</div>
				{/if}
				<div class="mapping-feedback" class:failed role="status" aria-live="polite">
					{#if saving}<Spinner />Saving…{:else}{feedback}{/if}
				</div>
			</aside>
		</div>
	{:else}
		<div class="empty">
			<h2>No workstations yet</h2>
			<p>Register a PC under Clients to start mapping Chair Nodes.</p>
		</div>
	{/if}
</WorkspacePage>

<style>
	.mapping-toolbar {
		display: grid;
		gap: 14px;
		margin-bottom: 16px;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--surface);
	}
	.toolbar-primary {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(180px, 250px);
		align-items: end;
		gap: 12px;
	}
	.search-field,
	.hub-filter {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.search-field :global(.dropdown input),
	.node-search :global(input) {
		min-height: 38px;
		border-color: var(--line);
		border-radius: 10px;
		background: var(--surface-deep);
		font-size: 13px;
	}
	.hub-filter :global(.dropdown input) {
		border-radius: 10px;
	}
	.toolbar-secondary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px 16px;
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}
	.filter-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		min-width: 0;
	}
	.plan-legend {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
	}
	button.legend-filter {
		--status-dot-size: 6px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 5px 10px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 12px;
		white-space: nowrap;
	}
	button.legend-filter:hover:not(:disabled) {
		background: var(--surface-raised);
	}
	button.legend-filter.active {
		border-color: var(--line-strong);
		background: var(--surface-raised);
		color: var(--text);
	}
	button.legend-filter.mapped {
		--status-dot-color: var(--success);
	}
	button.legend-filter.unmapped {
		--status-dot-color: var(--muted);
	}
	button.legend-filter.unknown {
		--status-dot-color: var(--warning);
	}
	.filter-count {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.mapping-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
		align-items: start;
		gap: 16px;
		min-width: 0;
	}
	.seating-plan,
	.assignment-panel {
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--surface);
	}
	.seating-plan {
		overflow: hidden;
	}
	.plan-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 15px 16px;
		border-bottom: 1px solid var(--line);
	}
	.plan-header h2,
	.assignment-heading h2 {
		margin: 0;
		color: var(--text);
		font-size: 16px;
		font-weight: 600;
	}
	.plan-summary {
		color: var(--muted);
		font-size: 12px;
		white-space: nowrap;
	}
	.plan-summary strong {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.room-groups {
		display: grid;
		gap: 12px;
		padding: 14px;
		background: var(--surface-deep);
	}
	.hub-room {
		min-width: 0;
		padding: 13px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
	}
	.room-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 11px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--line);
	}
	.hub-heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
	}
	.hub-heading h3 {
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
	}
	.hub-heading code {
		color: var(--muted);
		font-size: 11px;
	}
	.desk-count,
	.node-count {
		color: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.desk-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), min(100%, 250px)));
		align-items: stretch;
		gap: 10px;
	}
	.assignment-panel {
		position: sticky;
		top: 18px;
		padding: 16px;
	}
	.assignment-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--line);
	}
	.client-connection {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: 12px;
		text-transform: capitalize;
		--status-dot-size: 6px;
	}
	.client-connection[data-state='online'] {
		color: var(--success);
		--status-dot-color: var(--success);
	}
	.client-connection[data-state='offline'] {
		color: var(--warning);
		--status-dot-color: var(--warning);
	}
	.selected-workstation {
		display: grid;
		gap: 5px;
		margin: 14px 0;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface-deep);
	}
	.selected-workstation-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.selected-workstation-top code {
		color: var(--text);
		font-size: 15px;
		font-weight: 600;
	}
	.selected-workstation-top span {
		color: var(--muted);
		font-size: 12px;
	}
	.selected-workstation h3 {
		color: var(--text-secondary);
		font-size: 13px;
		font-weight: 500;
	}
	.current-assignment {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface-deep);
	}
	.current-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.current-heading h3,
	.node-heading h3 {
		color: var(--text);
		font-size: 13px;
		font-weight: 600;
	}
	.current-state {
		color: var(--muted);
		font-size: 11px;
	}
	.current-node-details {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.current-node-details > code {
		overflow: hidden;
		color: var(--text);
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.node-reading {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: 12px;
		--status-dot-size: 6px;
	}
	.node-reading[data-state='occupied'],
	.node-reading[data-state='empty'] {
		color: var(--success);
		--status-dot-color: var(--success);
	}
	.node-reading[data-state='unknown'] {
		color: var(--warning);
		--status-dot-color: var(--warning);
	}
	.unassigned-message,
	.node-empty {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.node-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 18px 0 9px;
	}
	.node-search {
		margin-bottom: 8px;
	}
	.node-search :global(input) {
		padding-block: 7px;
	}
	.node-options {
		display: grid;
		gap: 6px;
		max-height: 360px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	button.node-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		min-width: 0;
		min-height: 48px;
		padding: 10px 11px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface-deep);
		color: var(--text-secondary);
		text-align: left;
		font-weight: 400;
	}
	button.node-option:hover:not(:disabled):not(.assigned) {
		border-color: var(--line-strong);
		background: var(--surface-raised);
	}
	button.node-option.assigned {
		border-color: var(--accent);
		background: var(--surface-raised);
	}
	button.node-option.taken:disabled {
		opacity: 0.65;
	}
	.node-option-text {
		min-width: 0;
	}
	.node-option-text code {
		display: block;
		overflow: hidden;
		color: var(--text);
		font-size: 11px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.node-option-state {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		line-height: 1;
		flex: none;
		max-width: 48%;
		overflow: hidden;
		color: var(--muted);
		font-size: 11px;
		text-overflow: ellipsis;
		white-space: nowrap;
		--status-dot-size: 5px;
	}
	.node-option-dot {
		display: inline-flex;
		align-items: center;
		flex: none;
		line-height: 0;
	}
	.node-option-dot :global(.status-dot) {
		display: block;
	}
	.node-option-state[data-state='occupied'],
	.node-option-state[data-state='empty'] {
		color: var(--success);
		--status-dot-color: var(--success);
	}
	.node-option-state[data-state='unknown'] {
		color: var(--warning);
		--status-dot-color: var(--warning);
	}
	.node-option-state[data-state='assigned'] {
		color: var(--accent);
		--status-dot-color: var(--accent);
	}
	.remove-mapping {
		width: 100%;
		margin-top: 12px;
	}
	.mapping-feedback {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		color: var(--success);
		font-size: 12px;
	}
	.mapping-feedback:empty {
		display: none;
	}
	.mapping-feedback.failed {
		color: var(--warning);
	}
	.assignment-empty {
		display: grid;
		gap: 8px;
		padding: 8px 0;
	}
	.assignment-empty h2 {
		margin: 0;
		font-size: 16px;
	}
	.assignment-empty p {
		color: var(--muted);
		font-size: 12px;
	}
	.layout-empty {
		padding: 36px 16px;
		text-align: center;
	}
	.layout-empty h3 {
		color: var(--text);
		font-size: 14px;
	}
	.layout-empty p {
		margin: 6px 0 14px;
		color: var(--muted);
		font-size: 12px;
	}
	@media (max-width: 1050px) {
		.mapping-layout {
			grid-template-columns: minmax(0, 1fr) 300px;
			gap: 13px;
		}
	}
	@media (max-width: 900px) {
		.mapping-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.assignment-panel {
			position: static;
		}
	}
	@media (max-width: 760px) {
		.toolbar-primary {
			grid-template-columns: minmax(0, 1fr);
		}
		.mapping-toolbar {
			padding: 13px;
		}
		.toolbar-secondary {
			align-items: flex-start;
		}
		.filter-group {
			align-items: flex-start;
			flex-direction: column;
			gap: 6px;
		}
		.plan-header {
			padding: 13px 14px;
		}
		.room-groups {
			padding: 12px;
		}
		.hub-room {
			padding: 11px;
		}
		.desk-grid {
			grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), min(100%, 270px)));
		}
	}
	@media (max-width: 480px) {
		.toolbar-secondary {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
