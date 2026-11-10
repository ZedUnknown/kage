<script lang="ts">
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import PanelSearch from '../components/common/PanelSearch.svelte';
	import ConnectionFilters from '../components/common/ConnectionFilters.svelte';
	import { connectionStatus, type ConnectionFilter } from '../connection-status.ts';
	import SearchHighlight from '../components/common/SearchHighlight.svelte';
	import { orderSearchResults } from '../search.ts';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import TreeView from '../components/icons/TreeView.svelte';
	import Devices from '../components/icons/Devices.svelte';
	import CaretLeft from '../components/icons/CaretLeft.svelte';
	import HardDrives from '../components/icons/HardDrives.svelte';
	import MagnifyingGlass from '../components/icons/MagnifyingGlass.svelte';
	import Search from '../components/common/Search.svelte';
	import Copy from '../components/icons/Copy.svelte';
	import DropDown from '../components/common/DropDown.svelte';
	import SearchDropDown from '../components/common/SearchDropDown.svelte';
	import DeleteAction from '../components/common/DeleteAction.svelte';
	import ConfirmationAction from '../components/common/ConfirmationAction.svelte';
	import NetworkViewport from '../components/common/NetworkViewport.svelte';
	import Check from '../components/icons/Check.svelte';

	interface Hub {
		id: string;
		hub_id: string;
		name: string;
		connection_state: string;
		broker_name: string;
		last_seen: string | null;
		credential_status: string;
		username: string;
	}

	interface Node {
		id: string;
		hub_id: string;
		mac_address: string;
		paired: boolean;
		occupancy: string;
		last_seen: string | null;
		client_id: string | null;
		pc_id: string | null;
	}

	interface Client {
		id: string;
		hub_id: string;
		node_id: string | null;
		name: string;
		pc_id: string;
		connection_state: string;
		security_state: string;
		credential_status: string;
	}

	interface Command {
		id: string;
		node_id: string | null;
		client_id: string | null;
		kind: string;
		status: string;
		created_at: string;
		report?: { reason?: string };
	}

	let {
		hubs,
		nodes,
		clients,
		commands,
		busy,
		hubId = null,
		onaction,
		onpairing
	}: {
		hubs: Hub[];
		nodes: Node[];
		clients: Client[];
		commands: Command[];
		busy: boolean;
		hubId?: string | null;
		onaction: (resource: string, body: object, errorToasterId?: string) => Promise<boolean | void>;
		onpairing: () => void;
	} = $props();

	let nodeId = $state<string | null>(null);
	let search = $state('');
	let hubSearch = $state('');
	let hubStatus = $state<ConnectionFilter>('all');
	let filteredHubs = $derived(
		hubs.filter(
			(item) => hubStatus === 'all' || connectionStatus(item.connection_state) === hubStatus
		)
	);
	let hubQuery = $derived(hubSearch.trim());
	let hubResults = $derived(orderSearchResults(filteredHubs, hubQuery, (item) => [item.name, item.hub_id, item.broker_name]));
	let inspector = $state<HTMLElement>();
	let settingsOpen = $state(false);
	const operations = [
		['force_lock', 'Lock workstation'],
		['force_logout', 'Log out workstation'],
		['cancel_force_lock', 'Cancel forced lock'],
		['cancel_force_logout', 'Cancel forced logout'],
		['cancel_auto_lock', 'Cancel automatic lock'],
		['cancel_auto_logout', 'Cancel automatic logout']
	];
	const date = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Never');
	let hub = $derived(hubs.find((item) => item.hub_id === hubId));
	let hubNodes = $derived(nodes.filter((item) => item.hub_id === hub?.id));
	let hubClients = $derived(clients.filter((item) => item.hub_id === hub?.id));
	const normalizeMac = (value: string) => value.replace(/[:.\-\s]/g, '').toLowerCase();
	let query = $derived(search.trim().toLowerCase());
	let macQuery = $derived(normalizeMac(query));
	let matchingNodes = $derived(new Set(hubNodes.filter(matchesNode).map((item) => item.id)));
	let pairedCount = $derived(hubNodes.filter((item) => item.paired).length);
	let node = $derived(hubNodes.find((item) => item.id === nodeId));
	let client = $derived(hubClients.find((item) => item.id === node?.client_id));
	let recentCommands = $derived(
		commands.filter(
			(item) => node && (item.node_id === node.id || (client && item.client_id === client.id))
		)
	);

	function matchesNode(item: Node) {
		return (
			!!query &&
			((!!macQuery &&
				/^[0-9a-f]+$/.test(macQuery) &&
				normalizeMac(item.mac_address).startsWith(macQuery)) ||
				!!item.pc_id?.toLowerCase().includes(query))
		);
	}

	function macHighlightLength(mac: string) {
		if (!macQuery || !/^[0-9a-f]+$/.test(macQuery) || !normalizeMac(mac).startsWith(macQuery)) {
			return 0;
		}

		let digits = 0;

		for (let index = 0; index < mac.length; index++) {
			if (/[0-9a-f]/i.test(mac[index])) digits++;

			if (digits === macQuery.length) return index + 1;
		}

		return 0;
	}

	async function copyMac(mac: string) {
		try {
			await navigator.clipboard.writeText(mac);
			toast.success('MAC address copied.');
		} catch {
			toast.error('Could not copy. Select the MAC address and copy it manually.');
		}
	}

	async function selectNode(id: string) {
		nodeId = id;
		await revealInspector();
	}

	async function selectHub() {
		nodeId = null;
		await revealInspector();
	}

	async function revealInspector() {
		await tick();
		if (inspector) inspector.scrollTop = 0;

		if (window.matchMedia('(max-width: 1100px)').matches) {
			inspector?.parentElement?.scrollIntoView({
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'instant'
					: 'smooth',
				block: 'start'
			});
		}
	}

	function submit(event: SubmitEvent, resource: string, extra: object) {
		event.preventDefault();
		const fields = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
		void onaction(resource, { ...fields, ...extra });
	}
</script>

{#if !hubId}
	<PanelSearch
		bind:value={hubSearch}
		label="Search hubs"
		placeholder="Search by name, hub ID, or broker"
		matches={hubResults.matches.size}
		total={filteredHubs.length}
	/>
	<ConnectionFilters items={hubs} label="Filter hubs by status" bind:value={hubStatus} />
	<div class="hub-grid">
		{#each hubResults.items as item (item.id)}
			<a
				class="hub-card"
				class:matched={hubResults.matches.has(item)}
				class:dimmed={!!hubQuery && !hubResults.matches.has(item)}
				href={resolve('/(app)/hubs/[hubid]', { hubid: item.hub_id })}
				aria-label={`${item.name}, ${item.hub_id}${hubResults.matches.has(item) ? ', search match' : ''}`}
				animate:flip={{ duration: prefersReducedMotion.current ? 0 : 320, easing: cubicOut }}
			>
				<span class="card-top">
					<span class="chip-icon" aria-hidden="true"><TreeView properties="size-5" /></span>
					<strong class="hub-name" title={item.name}><SearchHighlight text={item.name} query={hubQuery} /></strong>
					<span class="hub-state-badge">
						<span
							class="connection-dot"
							class:online={connectionStatus(item.connection_state) === 'online'}
							aria-hidden="true"
						>
							</span>
						<span class="hub-status">{item.connection_state || 'Unknown'}</span>
					</span>
				</span>
				<span class="hub-card-body">
					<span class="hub-identity">
						<span class="hub-detail hub-identifier"><span class="detail-label">Hub ID</span><code title={item.hub_id}><SearchHighlight text={item.hub_id} query={hubQuery} /></code>
						</span>
						<span class="hub-detail">
							<span class="detail-label">Status</span>
							<span class="hub-status" title={item.connection_state || 'Unknown'}>
								{item.connection_state || 'Unknown'}
							</span>
						</span>
					</span>
					<span class="hub-metrics">
						<span class="hub-metric">
							<span class="metric-icon" aria-hidden="true"><TreeView properties="size-6" /></span>
							<strong>{nodes.filter((n) => n.hub_id === item.id).length}</strong>
							<span class="metric-label">Nodes</span>
						</span>
						<span class="hub-metric">
							<span class="metric-icon" aria-hidden="true"><Devices properties="size-6" /></span>
							<strong>{clients.filter((c) => c.hub_id === item.id).length}</strong>
							<span class="metric-label">Clients</span>
						</span>
					</span>
				</span>
				<span class="hub-card-bottom">
					<span class="hub-broker">
						<span aria-hidden="true"><HardDrives properties="size-5" /></span>
						<span class="broker-name" title={item.broker_name}><span class="sr-only">Broker: </span><SearchHighlight
								text={item.broker_name}
								query={hubQuery}
							/>
						</span>
					</span>
					<span class="hub-open"><span class="sr-only">View hub</span><CaretLeft properties="size-4 rotate-180" /></span>
				</span>
			</a>
		{:else}
			<p class="empty">
				{#if hubs.length}
					No hubs are {hubStatus}.
				{:else}
					No hubs registered. Register your first hub below to get started.
				{/if}
			</p>
		{/each}
	</div>
{:else if hub}
	<div class="hub-workspace">
		<section class="network-panel" aria-label="Hub node topology">
			<div class="panel-header network-toolbar">
				<h3>
					<TreeView properties="size-4" />Network <span class="count-pill">{hubNodes.length}</span>
				</h3>
				<label class="node-search"><span class="sr-only">Search nodes</span><span class="search-icon" aria-hidden="true"><MagnifyingGlass properties="size-4" /></span><Search
						placeholder="Search…"
						aria-label="Search nodes"
						bind:value={search}
						aria-describedby="node-search-status"
					/>
				</label>
			</div>
			<div id="node-search-status" class="search-status" class:searching={!!query} role="status">
				{#if query}{matchingNodes.size === 0
						? 'No matching nodes'
						: `${matchingNodes.size} ${matchingNodes.size === 1 ? 'match' : 'matches'}`}{/if}
			</div>
			<NetworkViewport>
				<div class="network-map">
					<button
						type="button"
						class="hub-core"
						class:selected={!node}
						aria-label={`View hub ${hub.name}`}
						aria-pressed={!node}
						aria-controls="node-inspector"
						onclick={selectHub}
					>
						<span class="core-heading"><span class="core-icon" aria-hidden="true"><TreeView properties="size-5" /></span><span class="device-kind">Hub</span>
							<span class="core-status"><span
									class="status-dot"
									class:online={['online', 'connected'].includes(hub.connection_state)}
							>
									</span>{hub.connection_state}
							</span>
						</span>
						<span class="core-identity"><strong>{hub.name}</strong><code>{hub.hub_id}</code></span>
					</button>
					{#if hubNodes.length}
						<div class="network-nodes">
							{#each hubNodes as item (item.id)}
								{@const highlightLength = macHighlightLength(item.mac_address)}
								<article
									class="network-node"
									class:selected={nodeId === item.id}
									class:unpaired={!item.paired}
									class:matched={matchingNodes.has(item.id)}
									class:dimmed={!!query && !matchingNodes.has(item.id)}
									aria-label={`Node ${item.mac_address}`}
								>
									<button
										type="button"
										class="node-select"
										aria-pressed={nodeId === item.id}
										aria-controls="node-inspector"
										aria-label={`${item.pc_id || 'Chair node'}, ${item.mac_address}${matchingNodes.has(item.id) ? ', search match' : ''}`}
										onclick={() => selectNode(item.id)}
									>
										<span class="node-heading"><span class="node-symbol" aria-hidden="true"><Devices properties="size-4" /></span><span>{item.pc_id || 'Chair node'}</span>{#if nodeId === item.id}<span
													class="selected-indicator"
													aria-hidden="true"
										>
												<Check properties="size-3" />
										</span>{/if}
										</span>
										<span class="node-meta"><span class="pair-state" class:paired={item.paired}><span class="pair-dot" aria-hidden="true"></span>{item.paired
													? 'Paired'
													: 'Unpaired'}
										</span><span class="occupancy-state" class:occupied={item.occupancy === 'occupied'}>{item.occupancy || 'Unknown'}</span>
										</span>
									</button>
									<div class="node-mac mac-address">
										<code>{#if highlightLength}<mark>{item.mac_address.slice(0, highlightLength)}</mark>{item.mac_address.slice(
													highlightLength
												)}{:else}{item.mac_address}{/if}
										</code>
										<button
											type="button"
											class="icon-button copy-node-mac"
											aria-label={`Copy MAC address ${item.mac_address}`}
											title="Copy MAC address"
											onclick={() => copyMac(item.mac_address)}
										>
											<Copy properties="size-4" />
										</button>
									</div>
								</article>
							{/each}
						</div>
					{:else}
						<div class="topology-empty">
							<span class="empty-icon" aria-hidden="true"><TreeView properties="size-8" /></span>
							<h3>No nodes yet</h3>
							<button type="button" class="secondary" onclick={onpairing}>Open pairing</button>
						</div>
					{/if}
				</div>
			</NetworkViewport>
		</section>
		<section
			id="node-inspector"
			class="node-inspector"
			aria-label={node ? 'Selected node controls' : 'Hub details'}
		>
			{#if node}
				{#key `${node.id}:${client?.id || ''}`}
					<div class="panel-header inspector-header">
						<h3><Devices properties="size-4" />Node details</h3>
					</div>
					<div class="inspector-body" bind:this={inspector}>
						<div class="node-identity">
							<span class="identity-icon" aria-hidden="true"><Devices properties="size-6" /></span>
							<div>
								<h2>{node.pc_id || 'Chair node'}</h2>
								<div class="inspector-mac mac-address">
									<code>{node.mac_address}</code><button
										type="button"
										class="icon-button"
										aria-label="Copy selected node MAC address"
										title="Copy MAC address"
										onclick={() => copyMac(node.mac_address)}
									>
										<Copy properties="size-4" />
									</button>
								</div>
							</div>
						</div>
						<dl class="node-facts">
							<div>
								<dt>Pairing</dt>
								<dd class:positive={node.paired}>{node.paired ? 'Paired' : 'Unpaired'}</dd>
							</div>
							<div>
								<dt>Occupancy</dt>
								<dd>{node.occupancy || 'Unknown'}</dd>
							</div>
							<div class="last-report">
								<dt>Last sensor report</dt>
								<dd>{date(node.last_seen)}</dd>
							</div>
						</dl>
						<div class="inspector-section">
							<h3>Identify Node</h3>
							<p class="muted">
								Blink this Node's LED through its Hub. A dispatched result confirms the Hub sent the
								test packet.
							</p>
							<button
								type="button"
								class="secondary"
								disabled={busy || !node.paired || hub.credential_status !== 'admin_confirmed'}
								onclick={() => onaction('nodes', { action: 'identify', id: node.id })}
							>
								Test Node LED
							</button>
						</div>
						<div class="inspector-section">
							<h3>Workstation</h3>
							{#if client}
								<details class="workstation-details">
									<summary>Workstation details</summary>
									<div class="workstation-summary">
										<strong>{client.name}</strong><code>{client.pc_id}</code>
									</div>
									<dl class="workstation-state">
										<div>
											<dt>Connection</dt>
											<dd>{client.connection_state}</dd>
										</div>
										<div>
											<dt>Security</dt>
											<dd>{client.security_state.replaceAll('_', ' ')}</dd>
										</div>
									</dl>
								</details>
								<div class="details-actions">
									<button
										type="button"
										class="secondary"
										disabled={busy}
										onclick={() => onaction('mappings', { client_id: client.id, node_id: '' })}
									>
										Remove mapping
									</button>
								</div>
							{:else}
								<form
									class="mapping-form"
									onsubmit={(e) => submit(e, 'mappings', { node_id: node.id })}
								>
									<div class="form-field">
										<label for="hub-mapping-client">Map PC</label>
										<SearchDropDown
											id="hub-mapping-client"
											name="client_id"
											label="Map PC"
											placeholder="Select PC"
											required
											disabled={busy || !node.paired}
											items={hubClients
												.filter((available) => !available.node_id)
												.map((available) => ({
													value: available.id,
													label: `${available.name} / ${available.pc_id}`
												}))}
										/>
									</div>
									<button disabled={busy || !node.paired || !hubClients.some((c) => !c.node_id)}>Save mapping</button>
								</form>
								{#if !node.paired}<p class="muted">
										Pair this Chair Node before mapping a PC.
									</p>{:else if !hubClients.some((c) => !c.node_id)}<p class="muted">
										No available workstations. Register one under Clients.
									</p>{/if}
							{/if}
						</div>
						<div class="inspector-section">
							<h3>Commands</h3>
							{#if client && node.paired}
								<p class="muted">Target: {client.name} / {client.pc_id}</p>
								<form
									class="command-form"
									onsubmit={(e) => submit(e, 'commands', { client_id: client.id })}
								>
									<div class="form-field">
										<label for="hub-command-operation">Operation</label>
										<DropDown
											id="hub-command-operation"
											name="command"
											label="Operation"
											value="force_lock"
											required
											disabled={busy}
											items={operations.map(([value, label]) => ({ value, label }))}
										/>
									</div>
									<div class="form-field">
										<label for="hub-command-delay">Countdown (seconds)</label><input
											id="hub-command-delay"
											name="delay_seconds"
											type="number"
											min="0"
											max="3600"
											value="30"
											required
										/>
									</div>
									<button disabled={busy || client.credential_status !== 'admin_confirmed'}>{busy ? 'Sending...' : 'Queue command'}</button>
								</form>
								{#if client.credential_status !== 'admin_confirmed'}<p class="muted">
										Confirm this Client's external provisioning under Clients to enable commands.
									</p>{/if}
							{:else}<p class="muted">
									Pair this node and map a workstation to enable commands.
								</p>{/if}
						</div>
						<div class="inspector-section">
							<h3>Pairing</h3>
							<div class="details-actions">
								<DeleteAction
									label={node.paired ? 'Unpair node' : 'Delete node'}
									title={`${node.paired ? 'Unpair' : 'Delete'} ${node.mac_address}?`}
									message={node.paired
										? 'This creates an unpair request. Approve it in Pairing, then wait for hub confirmation. Confirmation removes the PC to Chair Node mapping. You can delete the saved node record after unpairing completes.'
										: 'This permanently removes the unpaired node record and its pairing requests from KAGE. It will need to pair again to rejoin the network.'}
									disabled={busy}
									onconfirm={(toasterId) =>
										onaction(
											'nodes',
											{ action: node.paired ? 'unpair' : 'delete', id: node.id },
											toasterId
										)}
								/>
								<button type="button" class="secondary" onclick={onpairing}>Manage pairing</button>
							</div>
						</div>
						<div class="inspector-section">
							<h3>Recent commands</h3>
							{#each recentCommands.slice(0, 5) as command (command.id)}<div class="command-entry">
									<strong>{command.kind.replaceAll('_', ' ')}</strong><span
										class="badge"
										title={command.kind === 'identify' && command.status === 'dispatched'
											? 'Hub sent the radio test packet. LED execution is not confirmed.'
											: command.report?.reason?.replaceAll('_', ' ')}
									>
										{command.status}
									</span><time>{date(command.created_at)}</time>
								</div>{:else}<p class="muted">No commands yet.</p>{/each}
						</div>
					</div>
				{/key}
			{:else}
				<div class="panel-header inspector-header">
					<h3><TreeView properties="size-4" />Hub details</h3>
					<span class="badge" class:online={['online', 'connected'].includes(hub.connection_state)}>{hub.connection_state}</span>
				</div>
				<div class="inspector-body" bind:this={inspector}>
					<div class="node-identity">
						<span class="identity-icon" aria-hidden="true"><TreeView properties="size-6" /></span>
						<div>
							<h2>{hub.name}</h2>
							<code class="hub-detail-id">{hub.hub_id}</code>
						</div>
					</div>
					<dl class="node-facts hub-facts">
						<div>
							<dt>Nodes</dt>
							<dd>{hubNodes.length}</dd>
						</div>
						<div>
							<dt>Paired</dt>
							<dd>{pairedCount}</dd>
						</div>
						<div class="last-report">
							<dt>Broker</dt>
							<dd>{hub.broker_name}</dd>
						</div>
						<div class="last-report">
							<dt>Last seen</dt>
							<dd>{date(hub.last_seen)}</dd>
						</div>
					</dl>
					<div class="inspector-section">
						<h3>Workstations</h3>
						<div class="hub-workstation-total">
							<Devices properties="size-5" /><strong>{hubClients.length}</strong><span>{hubClients.length === 1 ? 'workstation' : 'workstations'}
							</span>
						</div>
					</div>
					<div class="inspector-section">
						<div class="details-actions">
							<button
								type="button"
								class="secondary"
								aria-expanded={settingsOpen}
								aria-controls="hub-settings"
								onclick={() => (settingsOpen = !settingsOpen)}
							>
								{settingsOpen ? 'Hide hub settings' : 'Show hub settings'}
							</button>
						</div>
					</div>
					<section
						id="hub-settings"
						class="inspector-section hub-settings"
						hidden={!settingsOpen}
						aria-label="Hub settings"
					>
						<h3>Hub settings</h3>
						<details class="provisioning-details">
							<summary>Provisioning details</summary>
							<dl class="settings-facts">
								<div>
									<dt>Provisioning</dt>
									<dd>
										{hub.credential_status === 'admin_confirmed'
											? 'Confirmed'
											: hub.credential_status.replaceAll('_', ' ')}
									</dd>
								</div>
								<div>
									<dt>MQTT username</dt>
									<dd><code>{hub.username}</code></dd>
								</div>
							</dl>
						</details>
						<div class="settings-actions">
							<button
								type="button"
								disabled={busy || hub.credential_status === 'admin_confirmed'}
								onclick={() => onaction('hubs', { action: 'confirm', id: hub.id })}
							>
								Confirm provisioning
							</button>
							<ConfirmationAction
								label="Rotate token"
								title={`Rotate token for ${hub.name} (${hub.hub_id})?`}
								message="This replaces the token saved in KAGE and resets provisioning confirmation. Save the new token, update it on your external broker and in Hub setup, then confirm provisioning again. Disconnect old broker sessions separately."
								disabled={busy}
								onconfirm={(toasterId) =>
									onaction('hubs', { action: 'rotate', id: hub.id }, toasterId)}
							/>
							<ConfirmationAction
								label="Revoke in KAGE"
								title={`Revoke credentials for ${hub.name} (${hub.hub_id})?`}
								message="This marks the hub credentials as revoked in KAGE, blocking hub messages and pairing requests. Revoke the credentials on your external broker and disconnect existing sessions separately."
								danger
								disabled={busy}
								onconfirm={(toasterId) =>
									onaction('hubs', { action: 'revoke', id: hub.id }, toasterId)}
							/>
							<DeleteAction
								label="Delete hub"
								title={`Delete ${hub.name} (${hub.hub_id})?`}
								message={`This permanently removes the hub, its KAGE credentials and pairing requests. Delete its clients and unpair and delete its nodes first (${hubClients.length} clients and ${hubNodes.length} nodes remaining). Remove its MQTT account on the external broker and disconnect its sessions separately.`}
								disabled={busy}
								onconfirm={(toasterId) =>
									onaction('hubs', { action: 'delete', id: hub.id }, toasterId)}
							/>
						</div>
					</section>
				</div>
			{/if}
		</section>
	</div>
{:else}
	<div class="empty">This hub is no longer available.</div>
{/if}

<style>
	.sr-only {
		padding: 0;
	}
	.hub-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 360px));
		gap: 18px;
		margin-bottom: 28px;
		margin-top: 20px;
	}
	.hub-card {
		display: grid;
		grid-template-rows: 68px minmax(152px, 1fr) 48px;
		align-items: stretch;
		justify-content: stretch;
		gap: 0;
		min-width: 0;
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: 16px;
		background: linear-gradient(135deg, var(--surface), var(--background));
		color: var(--text);
		text-align: left;
		font-weight: 400;
		transition:
			opacity 180ms ease,
			box-shadow 180ms ease,
			border-color 180ms ease,
			background-color 180ms ease;
	}
	.hub-card.matched {
		background: var(--surface-selected);
		box-shadow: 0 0 0 2px var(--accent-halo);
	}
	.hub-card.matched .card-top,
	.hub-card.matched .hub-card-body,
	.hub-card.matched .hub-card-bottom {
		border-color: var(--accent-soft);
	}
	.hub-card.matched .card-top {
		box-shadow: inset 0 0 24px var(--accent-halo);
	}
	.hub-card.dimmed {
		opacity: 0.42;
	}
	.hub-card.dimmed:hover,
	.hub-card.dimmed:focus-visible {
		opacity: 1;
	}
	.hub-card:hover {
		border-color: var(--accent-border);
		box-shadow: 0 8px 24px #00000026;
	}
	.hub-card:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	.hub-card-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		gap: 18px;
		min-width: 0;
		padding: 18px 20px;
	}
	.hub-identity {
		display: grid;
		grid-template-rows: repeat(2, minmax(0, 1fr));
		min-width: 0;
	}
	.hub-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: 20px;
		font-weight: 650;
		line-height: 1.3;
		letter-spacing: -0.3px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hub-detail {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
		min-width: 0;
		font-size: 13px;
		line-height: 1.4;
	}
	.hub-detail + .hub-detail {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line-strong);
	}
	.detail-label {
		flex-shrink: 0;
		color: var(--text-secondary);
	}
	.hub-identifier code {
		max-width: 100%;
		min-width: 0;
		overflow: hidden;
		color: var(--text);
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.card-top,
	.hub-card-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		padding: 0 20px;
		color: var(--text);
	}
	.card-top {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		border-bottom: 1px solid var(--line-strong);
		background:
			linear-gradient(180deg, #ffffff04, transparent 70%),
			linear-gradient(105deg, #781e32 0%, #3b1c2a 46%, var(--surface) 88%);
		box-shadow: inset 0 1px 0 #ffffff0a;
	}
	.card-top::before {
		position: absolute;
		z-index: -1;
		inset: 0;
		/* Keep the center below the header so only the sweeping upper arcs show. */
		background: radial-gradient(
			circle at calc(100% - 72px) 98px,
			transparent 79px,
			#f4475a24 79px 80px,
			transparent 80px 99px,
			#f4475a30 99px 100px,
			transparent 100px 119px,
			#f4475a40 119px 120px,
			transparent 120px
		);
		pointer-events: none;
		content: '';
	}
	.hub-card-bottom {
		border-top: 1px solid var(--line-strong);
		background: linear-gradient(110deg, var(--surface-raised), var(--surface));
		font-size: 12px;
	}
	.chip-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border: 1px solid #ff8c9a30;
		border-radius: 8px;
		background: #ffffff08;
		color: #fff;
	}
	.hub-status {
		min-width: 0;
		overflow: hidden;
		font-size: 13px;
		font-weight: 600;
		text-transform: capitalize;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hub-state-badge {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		gap: 7px;
		max-width: 45%;
		padding: 5px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: #202029cc;
		box-shadow: inset 0 1px 4px #ffffff08;
	}
	.hub-state-badge .hub-status {
		font-size: 11px;
		font-weight: 500;
	}
	.connection-dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: 50%;
		background: currentColor;
		box-shadow:
			0 1px 1px #00000026,
			0 0 0 2px #ffffff12;
	}
	.connection-dot.online {
		background: var(--success);
	}
	.hub-metrics {
		display: grid;
		gap: 10px;
		min-width: 0;
		padding-left: 18px;
		border-left: 1px solid var(--line-strong);
	}
	.hub-metric {
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		column-gap: 10px;
		align-content: center;
		align-items: center;
		min-width: 0;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: linear-gradient(135deg, #ffffff06, #ffffff03);
	}
	.metric-icon {
		display: inline-flex;
		grid-row: span 2;
		color: var(--accent);
	}
	.hub-metric strong {
		font-size: 22px;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.6px;
		font-variant-numeric: tabular-nums;
	}
	.metric-label {
		color: var(--text-secondary);
		font-size: 11px;
		line-height: 1.3;
	}
	.hub-broker {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.hub-broker > span[aria-hidden] {
		display: inline-flex;
		flex-shrink: 0;
	}
	.broker-name {
		min-width: 0;
		overflow: hidden;
		font-size: 13px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hub-open {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.hub-card {
			transition: none;
		}
	}
	.hub-workspace {
		--panel-spacing: 20px;
		--text: #fff;
		--text-secondary: #fff;
		--muted: #fff;
		color: #fff;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(390px, 0.72fr);
		gap: 18px;
		height: clamp(560px, calc(100dvh - 180px), 880px);
		margin-bottom: 18px;
	}
	.network-panel,
	.node-inspector {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.network-panel {
		overflow: hidden;
		background: var(--background);
	}
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		gap: 12px;
		min-height: 76px;
		padding: 16px var(--panel-spacing);
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}
	.panel-header h3 {
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 0;
		font-size: 14px;
		color: var(--text-secondary);
	}
	.count-pill {
		padding: 2px 7px;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.node-search {
		position: relative;
		flex: 1;
		min-width: 0;
		max-width: 290px;
		margin-left: auto;
	}
	.search-icon {
		position: absolute;
		left: 11px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--muted);
		pointer-events: none;
	}
	.node-search :global(input) {
		padding-left: 34px;
		font-size: 12px;
	}
	.search-status {
		flex-shrink: 0;
		height: 0;
		overflow: hidden;
		padding: 0 var(--panel-spacing);
		color: #fff;
		font-size: 12px;
	}
	.search-status.searching {
		height: auto;
		padding-block: 9px;
		border-bottom: 1px solid var(--line);
		background: var(--surface-selected);
	}
	.network-map {
		width: 476px;
	}
	.hub-core {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
		width: 260px;
		margin: 0 auto;
		padding: 14px 16px;
		border: 1px solid var(--accent-border);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		text-align: left;
		box-shadow: 0 6px 20px #0003;
	}
	.hub-core:hover:not(:disabled),
	.hub-core.selected {
		border-color: var(--accent);
		background: var(--surface-selected);
		box-shadow:
			0 0 0 2px var(--accent-halo),
			0 6px 20px #0003;
	}
	.core-heading {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.device-kind {
		color: #fff;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 1px;
		text-transform: uppercase;
	}
	.core-icon,
	.node-symbol {
		display: inline-flex;
		color: #fff;
		flex-shrink: 0;
	}
	.core-identity,
	.node-identity > div {
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.core-identity strong {
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.core-identity code {
		color: var(--muted);
		font-size: 10px;
		overflow-wrap: anywhere;
	}
	.core-status {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		flex-shrink: 0;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 400;
		text-transform: capitalize;
	}
	.status-dot {
		display: block;
		width: 7px;
		height: 7px;
		background: var(--muted);
	}
	.status-dot.online {
		background: var(--success);
		box-shadow: 0 0 0 3px var(--success-surface);
	}
	.network-nodes {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 220px));
		justify-content: center;
		gap: 18px 36px;
		padding-top: 38px;
		isolation: isolate;
	}
	.network-nodes::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 54px;
		left: calc(50% - 1px);
		z-index: -1;
		width: 2px;
		background: var(--accent-border);
	}
	.network-node {
		position: relative;
		min-width: 0;
		height: 108px;
		border: 1px solid var(--accent-border);
		border-radius: 10px;
		background: var(--surface);
		box-shadow: 0 4px 14px #0003;
		transition:
			opacity 150ms ease,
			border-color 150ms ease,
			box-shadow 150ms ease;
	}
	.network-node::before {
		content: '';
		position: absolute;
		top: calc(50% - 1px);
		right: -19px;
		width: 18px;
		height: 2px;
		background: var(--accent-border);
	}
	.network-node:nth-child(even)::before {
		right: auto;
		left: -19px;
	}
	.network-node:hover,
	.network-node:focus-within {
		background: var(--surface-raised);
		border-color: var(--accent);
	}
	.network-node.selected {
		background: var(--surface-selected);
		border-color: var(--accent);
		box-shadow:
			0 0 0 2px var(--accent-halo),
			0 4px 14px #0003;
	}
	.network-node.selected::before {
		background: var(--accent);
	}
	.network-node.unpaired {
		border-style: dashed;
	}
	.network-node.matched {
		border-color: var(--accent-soft);
		background: var(--surface-selected);
		box-shadow: 0 0 0 2px var(--accent-halo);
	}
	.network-node.matched.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-halo);
	}
	.network-node.dimmed {
		opacity: 0.42;
	}
	.network-node.dimmed:hover,
	.network-node.dimmed:focus-within {
		opacity: 1;
	}
	.node-select {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: space-between;
		gap: 7px;
		width: 100%;
		height: 100%;
		padding: 12px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--text);
		font-size: 12px;
		font-weight: 400;
		text-align: left;
	}
	.node-select:hover:not(:disabled) {
		background: transparent;
	}
	.node-heading {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.node-heading > span:nth-child(2) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		font-weight: 600;
	}
	.node-mac {
		position: absolute;
		top: calc(50% - 14px);
		left: 12px;
		pointer-events: none;
	}
	.node-mac button {
		pointer-events: auto;
	}
	.mac-address {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.mac-address button {
		width: 28px;
		min-width: 28px;
		height: 28px;
		min-height: 28px;
		padding: 5px;
	}
	.network-node code {
		color: var(--text-secondary);
		font-size: 11px;
		white-space: nowrap;
	}
	.network-node mark {
		border-radius: 2px;
		background: var(--accent-border);
		color: #fff;
	}
	.node-meta {
		display: flex;
		justify-content: space-between;
		gap: 5px;
		color: var(--muted);
		font-size: 10px;
		text-transform: capitalize;
	}
	.pair-state {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.pair-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--muted);
	}
	.pair-state.paired .pair-dot {
		background: var(--success);
	}
	.occupancy-state {
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--field);
	}
	.occupancy-state.occupied {
		background: var(--success-surface);
		color: #fff;
	}
	.selected-indicator {
		display: inline-flex;
		margin-left: auto;
		color: #fff;
	}
	.topology-empty {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 50px 0 12px;
		text-align: center;
	}
	.empty-icon {
		display: inline-flex;
		color: var(--muted);
	}
	.topology-empty h3 {
		margin: 0;
		font-size: 16px;
	}
	.node-inspector {
		overflow: hidden;
		background: var(--surface);
		scroll-margin-top: 20px;
	}
	.inspector-body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--panel-spacing);
	}
	.node-identity {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.identity-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: #fff;
		background: var(--surface-raised);
	}
	.node-inspector h2 {
		margin: 0;
		font-size: 18px;
		overflow-wrap: anywhere;
	}
	.inspector-mac {
		color: var(--text-secondary);
	}
	.inspector-mac code {
		font-size: 12px;
		user-select: all;
	}
	.node-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin: var(--panel-spacing) 0 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--line);
	}
	.node-facts > div {
		display: grid;
		gap: 5px;
		padding: 12px;
		background: var(--surface-deep);
	}
	.node-facts dt,
	.settings-facts dt {
		color: var(--muted);
		font-size: 11px;
	}
	.node-facts dd,
	.settings-facts dd {
		margin: 0;
		font-size: 12px;
		overflow-wrap: anywhere;
		text-transform: capitalize;
	}
	.node-facts .positive {
		color: #fff;
	}
	.node-facts .last-report {
		grid-column: 1 / -1;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.last-report dd {
		text-align: right;
	}
	.inspector-section {
		display: grid;
		gap: 12px;
		margin-top: var(--panel-spacing);
		padding-top: var(--panel-spacing);
		border-top: 1px solid var(--line);
	}
	.inspector-section h3 {
		margin: 0;
		font-size: 13px;
	}
	.inspector-section label {
		font-size: 12px;
	}
	.inspector-section input {
		font-size: 13px;
	}
	.inspector-section form {
		gap: 12px;
	}
	.mapping-form > button {
		justify-self: start;
	}
	.command-form {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
	}
	.command-form > .form-field:first-child {
		grid-column: 1 / -1;
	}
	.command-form > button,
	.mapping-form > button,
	.details-actions > button,
	.details-actions :global(.delete-button),
	.settings-actions > button,
	.settings-actions :global(.confirmation-button),
	.settings-actions :global(.delete-button) {
		min-height: 38px;
		padding: 8px 12px;
		color: #fff;
	}
	.inspector-section .muted {
		font-size: 12px;
		margin: 0;
	}
	.workstation-summary {
		display: grid;
		gap: 4px;
	}
	.workstation-details {
		min-width: 0;
	}
	.workstation-details .workstation-state {
		margin-top: 12px;
	}
	.workstation-summary strong {
		font-size: 14px;
		font-weight: 500;
	}
	.workstation-summary code {
		color: var(--muted);
		font-size: 12px;
	}
	.workstation-state,
	.settings-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin: 0;
	}
	.workstation-state > div {
		display: grid;
		gap: 4px;
	}
	.workstation-state dt {
		color: var(--muted);
		font-size: 11px;
	}
	.workstation-state dd {
		margin: 0;
		font-size: 12px;
		text-transform: capitalize;
	}
	.details-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.command-entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 6px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	.command-entry strong {
		font-size: 12px;
		font-weight: 500;
		overflow-wrap: anywhere;
		text-transform: capitalize;
	}
	.command-entry time {
		grid-column: 1 / -1;
		color: var(--muted);
		font-size: 11px;
	}
	.hub-detail-id {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		color: var(--muted);
		font-size: 12px;
	}
	.hub-facts > div:not(.last-report) dd {
		font-size: 24px;
		font-weight: 600;
		line-height: 1.2;
	}
	.hub-workstation-total {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--muted);
		font-size: 12px;
	}
	.hub-workstation-total strong {
		color: var(--text);
		font-size: 20px;
		font-weight: 600;
	}
	.hub-settings[hidden] {
		display: none;
	}
	.provisioning-details {
		min-width: 0;
	}
	.provisioning-details .settings-facts {
		padding-top: 12px;
	}
	.settings-facts > div {
		display: grid;
		gap: 5px;
	}
	.settings-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	@media (min-width: 1600px) {
		.hub-workspace {
			grid-template-columns: minmax(0, 1fr) minmax(430px, 0.65fr);
		}
	}
	@media (max-width: 1100px) {
		.hub-workspace {
			grid-template-columns: minmax(0, 1fr);
			height: auto;
		}
		.network-panel,
		.node-inspector {
			height: 560px;
		}
	}
	@media (max-width: 600px) {
		.hub-workspace {
			--panel-spacing: 16px;
		}
		.network-toolbar {
			gap: 8px;
			flex-wrap: wrap;
		}
		.node-search {
			max-width: none;
			flex-basis: 140px;
		}
		.node-facts .last-report {
			flex-direction: column;
			gap: 5px;
		}
		.last-report dd {
			text-align: left;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.network-node {
			transition: none;
		}
	}
</style>
