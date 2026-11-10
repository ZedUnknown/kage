<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import PanelSearch from '#lib/client/components/common/PanelSearch.svelte';
	import ConnectionFilters from '#lib/client/components/common/ConnectionFilters.svelte';
	import { connectionStatus, type ConnectionFilter } from '#lib/client/connection-status.ts';
	import SearchHighlight from '#lib/client/components/common/SearchHighlight.svelte';
	import { orderSearchResults } from '#lib/client/search.ts';
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';
	import ClientActions from '#lib/client/components/common/ClientActions.svelte';
	import Devices from '#lib/client/components/icons/Devices.svelte';
	import Info from '#lib/client/components/icons/Info.svelte';
	import CaretDown from '#lib/client/components/icons/CaretDown.svelte';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	let status = $state<ConnectionFilter>('all');
	let filteredClients = $derived(
		overview.clients.filter((device) => status === 'all' || connectionStatus(device.connection_state) === status)
	);
	let search = $state('');
	let query = $derived(search.trim());
	let results = $derived(orderSearchResults(filteredClients, query, (device) => [device.name, device.pc_id, device.hub_code, device.username]));
	const actions = createPageActions(workspace);
	const { action } = actions;
	let testingClient = $state<string | null>(null);

	const label = (value: string) => {
		const text = (value || 'unknown').replaceAll('_', ' ');

		return text.charAt(0).toUpperCase() + text.slice(1);
	};

	async function testConnection(id: string) {
		testingClient = id;

		try {
			await action('clients', { action: 'test_connection', id });
		} finally {
			testingClient = null;
		}
	}
</script>

<WorkspacePage
	title="Clients"
	description="Register workstations and manage their connections, credentials, and security state."
	registration="clients"
	{actions}
>
	{#snippet children(openRegistration)}
		<PanelSearch
			bind:value={search}
			label="Search clients"
			placeholder="Search by name, client ID, hub, or username"
			matches={results.matches.size}
			total={filteredClients.length}
		/>
		<ConnectionFilters
			items={overview.clients}
			label="Filter clients by status"
			bind:value={status}
		/>
		{#each results.items as device (device.id)}
			{@const confirmed = device.credential_status === 'admin_confirmed'}
			<section
				class="panel client-card"
				class:matched={results.matches.has(device)}
				class:dimmed={!!query && !results.matches.has(device)}
				aria-label={`${device.name}${results.matches.has(device) ? ', search match' : ''}`}
				animate:flip={{ duration: prefersReducedMotion.current ? 0 : 320, easing: cubicOut }}
			>
				<header class="client-header">
					<div class="client-heading">
						<span class="client-icon" aria-hidden="true"><Devices properties="size-6" /></span>
						<div class="client-title">
							<h2><SearchHighlight text={device.name} {query} /></h2>
							<div class="client-identity">
								<span
									class="client-status"
									data-state={device.connection_state}
									role="status"
									aria-label={`Client status: ${label(device.connection_state)}`}
								>
									<span class="status-dot" aria-hidden="true"></span>{label(device.connection_state)}
								</span>
							</div>
						</div>
					</div>
					<ClientActions {device} disabled={actions.busy} onaction={action} />
				</header>
				<details class="client-details">
					<summary>
						<span class="information-label"><Info properties="size-4" />Client Information</span><span class="information-chevron" aria-hidden="true"><CaretDown properties="size-4" /></span>
					</summary>
					<div class="client-information">
						<dl>
							<div>
								<dt>Client ID</dt>
								<dd><code><SearchHighlight text={device.pc_id} {query} /></code></dd>
							</div>
							<div>
								<dt>Hub</dt>
								<dd><code><SearchHighlight text={device.hub_code} {query} /></code></dd>
							</div>
							<div>
								<dt>Security state</dt>
								<dd>{label(device.security_state)}</dd>
							</div>
							<div>
								<dt>Last activity</dt>
								<dd>{date(device.last_seen)}</dd>
							</div>
							<div>
								<dt>Credentials</dt>
								<dd>{confirmed ? 'Provisioned' : label(device.credential_status)}</dd>
							</div>
							<div>
								<dt>MQTT username</dt>
								<dd><code><SearchHighlight text={device.username} {query} /></code></dd>
							</div>
							<div>
								<dt>Broker authorization</dt>
								<dd>{confirmed ? 'Administrator confirmed' : 'Not confirmed'}</dd>
							</div>
						</dl>
					</div>
				</details>
				<footer class="client-footer">
					<button
						type="button"
						disabled={actions.busy || !confirmed}
						title={confirmed
							? 'Send a test message and wait for a reply from the running KAGE Client.'
							: 'Confirm external provisioning before testing the client connection.'}
						onclick={() => testConnection(device.id)}
					>
						{testingClient === device.id
							? 'Testing connection...'
							: 'Test client connection'}
					</button>
					{#if !confirmed}
						<button
							type="button"
							class="secondary"
							disabled={actions.busy}
							onclick={() => action('clients', { action: 'confirm', id: device.id })}
						>
							Confirm external provisioning
						</button>
						<!-- {:else}
						<span class="provisioning-confirmed">Provisioning confirmed</span> -->
					{/if}
				</footer>
			</section>
		{:else}
			<div class="empty empty-state">
				{#if overview.clients.length}
					<p>No clients are {status}.</p>
				{:else}
					<p>No clients registered. Register a client to connect your workstation.</p>
					<button
						type="button"
						disabled={actions.busy}
						aria-haspopup="dialog"
						onclick={openRegistration}
					>
						Register your first client
					</button>
				{/if}
			</div>
		{/each}
	{/snippet}
</WorkspacePage>

<style>
	.client-card {
		padding: 22px;
		transition:
			opacity 180ms ease,
			border-color 180ms ease,
			background-color 180ms ease,
			box-shadow 180ms ease;
	}
	.client-card.matched {
		border-color: var(--accent-soft);
		background: var(--surface-selected);
		box-shadow: 0 0 0 2px var(--accent-halo);
	}
	.client-card.dimmed {
		opacity: 0.42;
	}
	.client-card.dimmed:hover,
	.client-card.dimmed:focus-within {
		opacity: 1;
	}
	.client-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 20px;
	}
	.client-heading {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.client-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface-raised);
		color: var(--text-secondary);
	}
	.client-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 14px;
		min-width: 0;
	}
	.client-title h2 {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.client-identity {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.client-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 9px;
		border: 1px solid var(--warning-border);
		border-radius: 999px;
		background: var(--warning-surface);
		color: var(--warning);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}
	.client-status[data-state='online'] {
		border-color: var(--success-border);
		background: var(--success-surface);
		color: var(--success);
	}
	.client-status[data-state='offline'] {
		border-color: var(--accent-border);
		background: var(--accent-dim);
		color: var(--accent-soft);
	}
	.client-details {
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-deep);
	}
	.client-details summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 0;
		padding: 14px 16px;
		list-style: none;
	}
	.client-details summary::-webkit-details-marker {
		display: none;
	}
	.information-label {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.information-chevron {
		display: inline-flex;
		flex-shrink: 0;
		transition: transform 180ms ease;
	}
	.client-details[open] .information-chevron {
		transform: rotate(180deg);
	}
	.client-information {
		margin: 0 16px;
		padding: 16px 0;
		border-top: 1px solid var(--line);
	}
	dl {
		display: grid;
		gap: 14px;
		margin: 0;
		font-size: 13px;
	}
	dl > div {
		display: grid;
		grid-template-columns: 150px minmax(0, 1fr);
		align-items: baseline;
		gap: 8px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.client-footer {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 20px;
	}
	@media (max-width: 600px) {
		.client-card {
			padding: 16px;
		}
		dl > div {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
		.client-footer > button {
			width: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.information-chevron {
			transition: none;
		}
	}
</style>
