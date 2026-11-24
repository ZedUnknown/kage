<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';
	import SensitiveInput from '#lib/client/components/common/SensitiveInput.svelte';
	import Switch from '#lib/client/components/common/Switch.svelte';
	import BrokerHelp from '#lib/client/components/common/BrokerHelp.svelte';
	import DeleteAction from '#lib/client/components/common/DeleteAction.svelte';
	import Copy from '#lib/client/components/icons/Copy.svelte';
	import DownloadSimple from '#lib/client/components/icons/DownloadSimple.svelte';
	import BrokerExport from '#lib/client/components/common/BrokerExport.svelte';
	import HardDrives from '#lib/client/components/icons/HardDrives.svelte';
	import InformationSummary from '#lib/client/components/common/InformationSummary.svelte';
	import CloseButton from '#lib/client/components/common/CloseButton.svelte';
	import Gear from '#lib/client/components/icons/Gear.svelte';
	import Info from '#lib/client/components/icons/Info.svelte';
	import EmptyState from '#lib/client/components/common/EmptyState.svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	const { action } = actions;
	let testingBroker = $state<string | null>(null);
	const brokerControlsBusy = $derived(workspace.busy || workspace.refreshing || testingBroker !== null);
	let testingKind = $state<'test_connection' | 'test_acl'>('test_connection');
	let editingBroker = $state<string | null>(null);
	const statusLabels: Record<string, string> = {
		connected: 'Connected',
		pending: 'Pending',
		disconnected: 'Disconnected',
		unknown: 'Unknown',
		disabled: 'Disabled'
	};

	function statusLabel(state: string) {
		return statusLabels[state] || 'Unknown';
	}

	async function editCredentials(id: string) {
		editingBroker = editingBroker === id ? null : id;
		await tick();
		if (editingBroker === id) document.getElementById(`broker-username-${id}`)?.focus();
	}

	async function closeCredentials(id: string) {
		editingBroker = null;
		await tick();
		document.getElementById(`broker-credentials-button-${id}`)?.focus();
	}

	async function saveCredentials(event: SubmitEvent, id: string) {
		event.preventDefault();
		const fields = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));

		if (await action('brokers', { ...fields, action: 'credentials', id })) {
			await closeCredentials(id);
		}
	}

	async function copyAddress(address: string) {
		try {
			await navigator.clipboard.writeText(address);
			toast.success('Broker address copied.');
		} catch {
			toast.error('Could not copy the address. Select and copy it manually.');
		}
	}

	async function testBroker(id: string, kind: 'test_connection' | 'test_acl') {
		if (brokerControlsBusy) return;

		testingBroker = id;
		testingKind = kind;

		try {
			const passed = await action('brokers', { action: kind, id });
			// Failed retests also clear the server's previous successful result.
			await workspace.refresh();
			if (passed && kind === 'test_connection') {
				for (let attempt = 0; attempt < 4; attempt++) {
					const broker = workspace.overview.brokers.find((item) => item.id === id);

					if (!broker?.enabled || broker.connection_state === 'connected') break;

					await new Promise((resolve) => setTimeout(resolve, 1000));
					await workspace.refresh();
				}
			}
		} finally {
			testingBroker = null;
		}
	}
</script>

<WorkspacePage
	title="Brokers"
	description="Connect your MQTT broker and export credentials for bulk import."
	registration="brokers"
	{actions}
>
	{#snippet children(openRegistration)}
		<div class="broker-grid">
		{#each overview.brokers as broker (broker.id)}
			{@const status = broker.enabled ? broker.connection_state : 'disabled'}
			{@const hasDevice = [...overview.hubs, ...overview.clients].some(
				(device) => device.broker_id === broker.id && device.credential_status !== 'revoked'
			)}
			<section
				class="panel broker-card"
				class:broker-disabled={!broker.enabled}
				aria-label={broker.name}
			>
				<header class="broker-header">
					<div class="broker-heading">
						<span class="broker-icon" data-state={status} role="img" aria-label={`Broker status: ${statusLabel(status)}`} title={statusLabel(status)}>
							<HardDrives properties="size-7" />
						</span>
						<h2 class="broker-title" title={broker.name}>{broker.name}</h2>
					</div>
					<div class="broker-toggle">
						<Switch
							checked={broker.enabled}
							disabled={brokerControlsBusy}
							controlled
							label={`${broker.enabled ? 'Disable' : 'Enable'} ${broker.name}`}
							onchange={async () => {
								if (brokerControlsBusy) return;

								if (await action('brokers', { action: 'toggle', id: broker.id })) {
									if (editingBroker === broker.id) editingBroker = null;
								}
							}}
						/>
					</div>
				</header>
				<div class="broker-content">
					<details class="connection-details">
						<InformationSummary label="MQTT Connection Information" />
						<div class="connection-information">
							<dl>
								<div class="connection-row">
									<dt>Address:</dt>
									<dd class="address-value">
										<span>{broker.hostname}</span>
										<button
											type="button"
											class="icon-button copy-address"
											aria-label={`Copy address for ${broker.name}`}
											title="Copy address"
											disabled={!broker.enabled}
											onclick={() => copyAddress(broker.hostname)}
										>
											<Copy properties="size-4" />
										</button>
									</dd>
								</div>
								<div class="connection-row">
									<dt>Port:</dt>
									<dd>{broker.port}</dd>
								</div>
								<div class="connection-row">
									<dt>TLS/SSL:</dt>
									<dd>{broker.tls ? 'Enabled' : 'Development only'}</dd>
								</div>
								<div class="connection-row">
									<dt>CA Certificate:</dt>
									<dd>
										{#if broker.ca_certificate}
											<a
												class="certificate-download"
												href={`data:application/x-pem-file;charset=utf-8,${encodeURIComponent(broker.ca_certificate)}`}
												download={`${broker.id}-ca.pem`}
												aria-label={`Download CA certificate for ${broker.name}`}
												title="Download CA certificate"
											>
												<DownloadSimple properties="size-4" />
											</a>
											<span class="certificate-expiry">{broker.ca_certificate_expires_at
													? `Expires: ${broker.ca_certificate_expires_at.slice(0, 10)}`
													: 'Expiration unavailable'}
											</span>
										{:else}
											System trust store
										{/if}
									</dd>
								</div>
								<div class="connection-row">
									<dt>Last connected:</dt>
									<dd>{date(broker.last_seen)}</dd>
								</div>
								<div class="connection-row">
									<dt>Device permissions:</dt>
									<dd>{broker.acl_confirmed ? 'Passed' : 'Required before device traffic'}</dd>
								</div>
							</dl>
							<div class="actions credential-actions">
								<button
									id={`broker-credentials-button-${broker.id}`}
									type="button"
									class="secondary"
									disabled={actions.busy || testingBroker !== null || !broker.enabled}
									aria-expanded={editingBroker === broker.id}
									aria-controls={`broker-credentials-${broker.id}`}
									onclick={() => editCredentials(broker.id)}
								>
									<span aria-hidden="true"><Gear properties="size-4" /></span>Change server credentials
								</button>
								<DeleteAction
									label=""
									title={`Delete ${broker.name}?`}
									message={`This permanently removes the broker connection and its command history from KAGE. Events and audit history are kept. Delete its hubs first (${overview.hubs.filter((hub) => hub.broker_id === broker.id).length} remaining). Your external MQTT broker is unaffected.`}
									disabled={actions.busy || testingBroker !== null}
									onconfirm={(toasterId) =>
										action('brokers', { action: 'delete', id: broker.id }, toasterId)}
								/>
							</div>
							<div id={`broker-credentials-${broker.id}`}>
								{#if editingBroker === broker.id && broker.enabled}
									<form
										class="credential-editor"
										aria-labelledby={`broker-credentials-title-${broker.id}`}
										onsubmit={(event) => saveCredentials(event, broker.id)}
									>
										<header class="credential-editor-header">
											<h3 id={`broker-credentials-title-${broker.id}`}>Server credentials</h3>
											<CloseButton
												aria-label="Close server credentials editor"
												disabled={actions.busy}
												onclick={() => closeCredentials(broker.id)}
											/>
										</header>
										<div class="credential-fields">
											<label>Username<input
													id={`broker-username-${broker.id}`}
													name="username"
													autocomplete="username"
													value={broker.username || ''}
													disabled={actions.busy}
													required
												/>
											</label>
											<div class="form-field">
												<label for={`broker-password-${broker.id}`}>New password</label>
												<SensitiveInput
													id={`broker-password-${broker.id}`}
													name="password"
													type="password"
													autocomplete="new-password"
													disabled={actions.busy}
													required
												/>
											</div>
										</div>
										<div class="actions editor-actions">
											<button type="submit" disabled={actions.busy || !broker.enabled}>{actions.busy ? 'Saving...' : 'Save credentials'}</button>
										</div>
									</form>
								{/if}
							</div>
						</div>
					</details>
				</div>
				<footer class="broker-footer">
					<div class="actions broker-controls" class:has-export={workspace.account.role === 'admin'}>
						<button
							type="button"
							disabled={brokerControlsBusy || !broker.enabled}
							aria-label={testingBroker === broker.id && testingKind === 'test_connection' ? 'Testing connection' : 'Test connection'}
							title="Check the broker connection using saved server credentials. No Hub or Client needed."
							onclick={() => testBroker(broker.id, 'test_connection')}
						>
							<span class="broker-action-label">{testingBroker === broker.id && testingKind === 'test_connection'
								? 'Testing connection...'
								: 'Test connection'}</span>
							<span class="broker-action-short" aria-hidden="true">{testingBroker === broker.id && testingKind === 'test_connection' ? 'Testing…' : 'Connection'}</span>
						</button>
						<button
							type="button"
							class="secondary"
							disabled={brokerControlsBusy || !broker.enabled || !hasDevice}
							aria-label={testingBroker === broker.id && testingKind === 'test_acl' ? 'Testing permissions' : 'Test device permissions'}
							title={hasDevice
								? 'Test device topic delivery and access restrictions. Physical devices can be offline.'
								: 'Register a Hub or Client and provision its broker credentials to test device permissions.'}
							onclick={() => testBroker(broker.id, 'test_acl')}
						>
							<span class="broker-action-label">{testingBroker === broker.id && testingKind === 'test_acl'
								? 'Testing permissions...'
								: 'Test device permissions'}</span>
							<span class="broker-action-short" aria-hidden="true">{testingBroker === broker.id && testingKind === 'test_acl' ? 'Testing…' : 'Permissions'}</span>
						</button>
						{#if workspace.account.role === 'admin'}
							<div class="broker-export"><BrokerExport brokerId={broker.id} brokerName={broker.name} /></div>
						{/if}
					</div>
					{#if broker.enabled && !broker.acl_confirmed}
						<p class="broker-notice permission-notice">
							<Info properties="notice-icon size-4" />
							<span>{hasDevice ? 'Test permissions' : 'No devices'}</span>
						</p>
					{:else if broker.enabled && status === 'connected'}
						<!-- <p class="broker-notice permission-notice broker-ready">
							<span class="notice-icon" aria-hidden="true"><Check properties="size-4" /></span>
							<span>Broker ready</span>
						</p> -->
					{:else}
						<p class="broker-notice permission-notice">
							<Info properties="notice-icon size-4" />
							<span>Broker not ready</span>
						</p>
					{/if}
				</footer>
			</section>{:else}
				<EmptyState
					actionLabel="Add your first broker"
					disabled={actions.busy}
					onAction={openRegistration}
				>
					<p class="broker-notice">
						<Info properties="notice-icon size-4" />
						Add a broker to connect your Hubs and Clients.
					</p>
				</EmptyState>
			{/each}
		</div>
	{/snippet}
</WorkspacePage>
<BrokerHelp />

<style>
	.broker-grid {
		display: grid;
		--broker-grid-gap: 16px;
		--broker-card-width: max(345px, calc((100% - 2 * var(--broker-grid-gap)) / 3));
		grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--broker-card-width)), 1fr));
		align-items: start;
		gap: var(--broker-grid-gap);
	}
	:global(.broker-grid > .empty-state) {
		grid-column: 1 / -1;
	}
	.broker-card {
		container-type: inline-size;
		min-width: 0;
		margin: 0;
		padding: 18px;
	}
	.broker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}
	.broker-heading {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.broker-icon {
		position: relative;
		--broker-dot: var(--muted);
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
	.broker-title {
		min-width: 0;
		margin: 0;
		font-size: 17px;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.broker-icon[data-state='pending'] { --broker-dot: var(--warning); }
	.broker-icon[data-state='connected'] { --broker-dot: var(--success); }
	.broker-icon[data-state='disconnected'] { --broker-dot: var(--accent-soft); }
	.broker-icon::before,
	.broker-icon::after {
		content: '';
		position: absolute;
		inset-block-start: 0px;
		inset-inline-start: 0px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		pointer-events: none;
	}
	.broker-icon::before {
		border: 1px solid var(--broker-dot);
		opacity: 0;
	}
	.broker-icon::after {
		background: var(--broker-dot);
	}
	@media (prefers-reduced-motion: no-preference) {
		.broker-icon::before {
			animation: broker-status-pulse 1.8s ease-out infinite;
		}
	}
	@keyframes broker-status-pulse {
		0% { opacity: 0.9; transform: scale(1); }
		25% { opacity: 0.65; }
		55%, 100% { opacity: 0; transform: scale(1.8); }
	}
	.broker-notice {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: color-mix(in srgb, var(--warning) 98%, var(--text-secondary));
		font-size: 13px;
		line-height: 1.45;
	}
	.permission-notice {
		flex-shrink: 0;
		margin: 0;
		font-size: 11px;
		white-space: nowrap;
	}
	:global(.notice-icon) {
		flex-shrink: 0;
	}
	.connection-details {
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-deep);
	}
	.connection-information {
		margin: 0 16px;
		padding: 16px 0;
		border-top: 1px solid var(--line);
	}
	.credential-actions {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.credential-actions > :global(.delete-button) {
		margin-inline-start: auto;
	}
	dl {
		display: grid;
		gap: 14px;
		margin: 0;
		font-size: 13px;
	}
	.connection-row {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 8px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
		max-width: 100%;
		margin: 0;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.address-value {
		flex-wrap: nowrap;
	}
	.address-value span {
		min-width: 0;
		user-select: all;
	}
	.copy-address,
	.certificate-download {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		min-height: 28px;
		padding: 6px;
		border-radius: 6px;
		color: var(--text-secondary);
	}
	.certificate-download:hover {
		background: var(--surface-raised);
		color: var(--text);
	}
	.certificate-expiry {
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--surface-raised);
		color: var(--text-secondary);
		font-size: 12px;
	}
	.broker-disabled {
		background: var(--surface-deep);
	}
	.broker-disabled .connection-information > dl {
		opacity: 0.45;
		filter: grayscale(1);
	}
	.broker-toggle {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 8px;
		color: var(--text-secondary);
		font-size: 12px;
	}
	.broker-footer {
		display: grid;
		justify-items: start;
		gap: 10px;
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.broker-footer > .permission-notice {
		width: 100%;
		padding-top: 11px;
	}
	.broker-controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		width: 100%;
		margin: 0;
	}
	.broker-controls.has-export {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);
	}
	.broker-controls > button,
	.broker-export :global(.export-trigger) {
		padding: 7px;
		font-size: 12px;
		white-space: nowrap;
	}
	.broker-action-short,
	.broker-export :global(.export-label-short) {
		display: none;
	}
	.broker-export {
		min-width: 0;
	}
	.broker-export :global(.export-trigger) {
		width: 100%;
		height: 100%;
	}
	.credential-editor {
		gap: 16px;
		margin-top: 16px;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-deep);
	}
	.credential-editor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.credential-editor h3 {
		margin: 0;
	}
	.credential-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		gap: 16px;
	}
	.editor-actions {
		justify-content: flex-end;
		margin: 0;
	}
	@container (max-width: 385px) {
		.broker-action-label,
		.broker-export :global(.export-label-full) {
			display: none;
		}
		.broker-controls > button > .broker-action-short,
		.broker-export :global(.export-label-short) {
			display: inline;
		}
	}
	@media (max-width: 480px) {
		.broker-card {
			padding: 16px;
		}
	}
</style>
