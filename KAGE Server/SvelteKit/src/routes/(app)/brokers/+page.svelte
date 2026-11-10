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
	import HardDrives from '#lib/client/components/icons/HardDrives.svelte';
	import Info from '#lib/client/components/icons/Info.svelte';
	import Gear from '#lib/client/components/icons/Gear.svelte';
	import CaretDown from '#lib/client/components/icons/CaretDown.svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	const { action } = actions;
	let testingBroker = $state<string | null>(null);
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
	description="Connect a customer-owned broker. KAGE does not create MQTT accounts on it."
	registration="brokers"
	{actions}
>
	{#snippet children(openRegistration)}
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
						<span class="broker-icon" aria-hidden="true"><HardDrives properties="size-6" /></span>
						<div class="broker-title">
							<h2>{broker.name}</h2>
							<span
								class="broker-status"
								data-state={status}
								role="status"
								aria-label={`Broker status: ${statusLabel(status)}`}
								title={status === 'pending'
									? 'Waiting for the broker connection. Device permissions are checked separately.'
									: statusLabel(status)}
							>
								<span class="status-dot" aria-hidden="true"></span>{statusLabel(status)}
							</span>
							{#if broker.enabled && !broker.acl_confirmed}
								<span class="permission-notice">Device permissions required</span>
							{/if}
						</div>
					</div>
					<div class="broker-toggle">
						<Switch
							checked={broker.enabled}
							disabled={actions.busy || testingBroker !== null}
							controlled
							label={`${broker.enabled ? 'Disable' : 'Enable'} ${broker.name}`}
							onchange={async () => {
								if (await action('brokers', { action: 'toggle', id: broker.id })) {
									if (editingBroker === broker.id) editingBroker = null;
								}
							}}
						/>
						<span>{broker.enabled ? 'Enabled' : 'Disabled'}</span>
					</div>
				</header>
				<div class="broker-content" inert={!broker.enabled}>
					<details class="connection-details">
						<summary><span class="information-label"><Info properties="size-4" />MQTT Connection Information</span><span class="information-chevron" aria-hidden="true"><CaretDown properties="size-4" /></span>
						</summary>
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
						</div>
					</details>
					<div id={`broker-credentials-${broker.id}`}>
						{#if editingBroker === broker.id}
							<form
								class="credential-editor"
								aria-labelledby={`broker-credentials-title-${broker.id}`}
								onsubmit={(event) => saveCredentials(event, broker.id)}
							>
								<h3 id={`broker-credentials-title-${broker.id}`}>Server credentials</h3>
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
									<button
										type="button"
										class="secondary"
										disabled={actions.busy}
										onclick={() => closeCredentials(broker.id)}
									>
										Cancel
									</button>
									<button type="submit" disabled={actions.busy || !broker.enabled}>{actions.busy ? 'Saving...' : 'Save credentials'}</button>
								</div>
							</form>
						{/if}
					</div>
				</div>
				<footer class="broker-footer">
					<div class="actions broker-controls">
						<button
							type="button"
							disabled={actions.busy || testingBroker !== null || !broker.enabled}
							title="Check the broker connection using saved server credentials. No Hub or Client needed."
							onclick={() => testBroker(broker.id, 'test_connection')}
						>
							{testingBroker === broker.id && testingKind === 'test_connection'
								? 'Testing connection...'
								: 'Test connection'}
						</button>
						<button
							type="button"
							class="secondary"
							disabled={actions.busy || testingBroker !== null || !broker.enabled || !hasDevice}
							title={hasDevice
								? 'Test device topic delivery and access restrictions. Physical devices can be offline.'
								: 'Register a Hub or Client and provision its broker credentials to test device permissions.'}
							onclick={() => testBroker(broker.id, 'test_acl')}
						>
							{testingBroker === broker.id && testingKind === 'test_acl'
								? 'Testing permissions...'
								: 'Test device permissions'}
						</button>
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
					</div>
					<div class="broker-delete">
						<DeleteAction
							label=""
							title={`Delete ${broker.name}?`}
							message={`This permanently removes the broker connection and its command history from KAGE. Events and audit history are kept. Delete its hubs first (${overview.hubs.filter((hub) => hub.broker_id === broker.id).length} remaining). Your external MQTT broker is unaffected.`}
							disabled={actions.busy || testingBroker !== null}
							onconfirm={(toasterId) =>
								action('brokers', { action: 'delete', id: broker.id }, toasterId)}
						/>
					</div>
				</footer>
			</section>{:else}<div class="empty empty-state">
				<p>No brokers yet. Connect your MQTT broker to get started.</p>
				<button
					type="button"
					disabled={actions.busy}
					aria-haspopup="dialog"
					onclick={openRegistration}
				>
					Add your first broker
				</button>
			</div>{/each}
	{/snippet}
</WorkspacePage>
<BrokerHelp />

<style>
	.broker-card {
		padding: 22px;
	}
	.broker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 20px;
	}
	.broker-heading {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.broker-icon {
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
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 18px;
		min-width: 0;
	}
	.broker-title h2 {
		max-width: 100%;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.broker-status {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		gap: 6px;
		padding: 4px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--surface-raised);
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}
	.permission-notice {
		color: var(--warning);
		font-size: 11px;
	}
	.broker-status[data-state='pending'] {
		border-color: var(--warning-border);
		background: var(--warning-surface);
		color: var(--warning);
	}
	.broker-status[data-state='connected'] {
		border-color: var(--success-border);
		background: var(--success-surface);
		color: var(--success);
	}
	.broker-status[data-state='disconnected'] {
		border-color: var(--accent-border);
		background: var(--accent-dim);
		color: var(--accent-soft);
	}
	.connection-details {
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-deep);
	}
	.connection-details summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 0;
		padding: 14px 16px;
		list-style: none;
	}
	.connection-details summary::-webkit-details-marker {
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
	.connection-details[open] .information-chevron {
		transform: rotate(180deg);
	}
	.connection-information {
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
	.broker-disabled .broker-content {
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
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.broker-controls {
		flex: 1;
		margin: 0;
	}
	.broker-delete {
		flex-shrink: 0;
		align-self: flex-end;
		margin-left: auto;
	}
	.credential-editor {
		gap: 16px;
		margin-top: 16px;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-deep);
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
	@media (max-width: 480px) {
		.broker-card {
			padding: 16px;
		}
		.broker-header {
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 14px;
		}
		.broker-title {
			flex-direction: column;
			align-items: flex-start;
		}
		.broker-toggle {
			margin-left: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.information-chevron {
			transition: none;
		}
	}
</style>
