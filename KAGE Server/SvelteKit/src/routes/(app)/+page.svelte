<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import EventActivityChart from '#lib/client/components/EventActivityChart.svelte';
	import { getWorkspace } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';
	import { resolve } from '$app/paths';
	import HardDrives from '#lib/client/components/icons/HardDrives.svelte';
	import Handshake from '#lib/client/components/icons/Handshake.svelte';
	import ListChecks from '#lib/client/components/icons/ListChecks.svelte';
	import ShieldCheck from '#lib/client/components/icons/ShieldCheck.svelte';
	import Target from '#lib/client/components/icons/Target.svelte';
	import ArrowUp from '#lib/client/components/icons/ArrowUp.svelte';
	import ClockCounterClockwise from '#lib/client/components/icons/ClockCounterClockwise.svelte';

	const workspace = getWorkspace();
	const overview = $derived(workspace.overview);
	const pairedNodes = $derived(overview.nodes.filter((node) => node.paired));
	const metrics = $derived([
		{
			kind: 'broker',
			label: 'Brokers',
			count: overview.brokers.length,
			active: overview.brokers.filter((broker) => broker.connection_state === 'connected').length,
			activeLabel: 'connected',
			inactiveLabel: 'not connected',
			href: '/(app)/brokers'
		},
		{
			kind: 'hub',
			label: 'Hubs',
			count: overview.hubs.length,
			active: overview.hubs.filter((hub) => hub.connection_state === 'online').length,
			activeLabel: 'online',
			inactiveLabel: 'offline / unknown',
			href: '/(app)/hubs'
		},
		{
			kind: 'node',
			label: 'Nodes',
			count: overview.nodes.length,
			active: pairedNodes.length,
			activeLabel: 'paired',
			inactiveLabel: 'unpaired',
			href: '/(app)/hubs'
		},
		{
			kind: 'client',
			label: 'Clients',
			count: overview.clients.length,
			active: overview.clients.filter((client) => client.connection_state === 'online').length,
			activeLabel: 'online',
			inactiveLabel: 'offline / unknown',
			href: '/(app)/clients'
		}
	] as const);
	const reviews = $derived([
		{
			label: 'Pending pairing requests',
			detail: 'Review discovered nodes',
			count: overview.pairing.filter((request) => request.status === 'pending').length,
			icon: Handshake,
			href: '/(app)/pairing'
		},
		{
			label: 'Unmapped Chair Nodes',
			detail: 'Link nodes to workstations',
			count: pairedNodes.filter((node) => !node.client_id).length,
			icon: ListChecks,
			href: '/(app)/mappings'
		},
		{
			label: 'Brokers to check',
			detail: 'Enabled brokers without a connection',
			count: overview.brokers.filter(
				(broker) => broker.enabled && broker.connection_state !== 'connected'
			).length,
			icon: HardDrives,
			href: '/(app)/brokers'
		}
	] as const);
	const attentionCount = $derived(reviews.reduce((sum, item) => sum + item.count, 0));

	const activePolicies = $derived.by(() => {
		const policy = overview.policies?.[0];

		if (!policy) return [];

		return [
			{
				id: 'automatic',
				enabled: policy.enabled === true,
				label: 'Automatic security',
				detail:
					(policy.action === 'auto_logout' ? 'Logout' : 'Lock') +
					' - ' +
					(policy.delay_seconds ?? 60) +
					' s countdown'
			},
			{
				id: 'extension',
				enabled: policy.allow_extension === true,
				label: 'Countdown extensions',
				detail: (policy.extension_duration_seconds ?? 300) + ' s - max ' + (policy.maximum_extensions ?? 1)
			},
			{
				id: 'recovery',
				enabled: policy.offline_enabled !== false && policy.allow_recovery_code === true,
				label: 'Recovery code',
				detail: 'Allowed for offline recovery'
			},
			{
				id: 'activity',
				enabled: policy.inactivity_monitoring_enabled === true,
				label: 'Inactivity monitoring',
				detail: (policy.inactivity_timeout_seconds ?? 300) + ' s idle - ' + (policy.confirmation_timeout_seconds ?? 30) + ' s confirmation'
			}
		].filter((item) => item.enabled);
	});
	const queuedActions = $derived(overview.queued_actions ?? []);
	const queuedTotal = $derived(queuedActions[0]?.total_count ?? 0);

	function actionTarget(command: (typeof queuedActions)[number]) {
		if (command.client_id) {
			return (
				overview.clients.find((client) => client.id === command.client_id)?.name ?? 'Client operation'
			);
		}
		if (command.node_id) {
			return (
				overview.nodes.find((node) => node.id === command.node_id)?.mac_address ?? 'Node operation'
			);
		}

		return (
			overview.brokers.find((broker) => broker.id === command.broker_id)?.name ?? 'Hub operation'
		);
	}

	function statusTone(status: string) {
		if (status === 'executed') return 'success';
		if (['failed', 'rejected', 'expired'].includes(status)) return 'danger';
		if (
			['queued', 'dispatching', 'published', 'received', 'executing', 'unconfirmed'].includes(status)
		) {
			return 'pending';
		}

		return 'neutral';
	}
</script>

{#snippet deviceIcon(kind: 'broker' | 'hub' | 'node' | 'client')}
	<svg
		class="device-glyph"
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		{#if kind === 'broker'}
			<rect x="3" y="3" width="18" height="7" rx="2" />
			<rect x="3" y="14" width="18" height="7" rx="2" />
			<path d="M7 6.5h4M7 17.5h4" />
			<circle cx="17" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
			<circle cx="17" cy="17.5" r="0.8" fill="currentColor" stroke="none" />
		{:else if kind === 'hub'}
			<rect x="3" y="12" width="18" height="8" rx="2" />
			<path d="M7 12V4m10 8V4M15 16h2" />
			<circle cx="7" cy="16" r="0.8" fill="currentColor" stroke="none" />
			<circle cx="11" cy="16" r="0.8" fill="currentColor" stroke="none" />
		{:else if kind === 'node'}
			<rect x="7" y="2" width="10" height="8" rx="2" />
			<path d="M6 10v5h12v-5M8 15v7m8-7v7M6 11H3v4h3m12-4h3v4h-3" />
		{:else}
			<rect x="3" y="3" width="18" height="13" rx="2" />
			<path d="M3 12h18M12 16v5m-4 0h8" />
		{/if}
	</svg>
{/snippet}

<WorkspacePage
	title="Dashboard"
	description="Monitor device connections, event activity, and pending configuration."
>
	<div class="dashboard">
		<div class="metric-grid">
			{#each metrics as metric (metric.label)}
				{@const state =
					metric.count === 0 ? 'empty' : metric.active === metric.count ? 'healthy' : 'attention'}
				<a class="metric-card" href={resolve(metric.href)} data-state={state}>
					<div class="metric-heading">
						<strong class="metric-value">{metric.count}</strong>
						<h3>{metric.label}</h3>
					</div>
					<span class="metric-icon">{@render deviceIcon(metric.kind)}</span>
					<div class="metric-breakdown">
						<span class="metric-active"><span class="status-dot" aria-hidden="true"></span><b>{metric.active}</b>
							{metric.activeLabel}
						</span>
						<span>{metric.count - metric.active} {metric.inactiveLabel}</span>
					</div>
				</a>
			{/each}
		</div>

		<div class="dashboard-grid">
			<EventActivityChart />
			<section class="dashboard-panel activity-panel" aria-labelledby="activity-title">
				<div class="panel-heading">
					<h2 id="activity-title">Events</h2>
					<span class="live-badge" class:interrupted={workspace.disconnected} role="status"><span class="live-dot" aria-hidden="true"></span>{workspace.disconnected
							? 'Reconnecting'
							: 'Live'}
					</span>
				</div>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable event region needs keyboard focus.) -->
				<div class="activity-body" role="region" aria-label="Recent events" tabindex="0">
					{#if overview.commands.length}
						<ol class="command-list">
							{#each overview.commands.slice(0, 5) as command (command.id)}
								<li class="command-row">
									<span class="command-icon" aria-hidden="true"><Target properties="size-5" /></span>
									<div class="command-info">
										<strong>{command.kind.replaceAll('_', ' ')}</strong><span>{overview.clients.find((client) => client.id === command.client_id)?.name ||
												'Device operation'}
										</span><time datetime={new Date(command.created_at).toISOString()}>{date(command.created_at)}</time>
									</div>
									<span class="command-status" data-tone={statusTone(command.status)}><span class="status-dot" aria-hidden="true"></span>{command.status.replaceAll(
											'_',
											' '
										)}
									</span>
								</li>
							{/each}
						</ol>
					{:else}
						<div class="activity-empty">
							<span class="empty-icon" aria-hidden="true"><Target properties="size-7" /></span>
							<h3>No events yet</h3>
							<p>Workstation command activity appears here.</p>
						</div>
					{/if}
				</div>
				<a class="activity-footer" href={resolve('/(app)/history/events')}><span aria-hidden="true"><ClockCounterClockwise properties="size-4" /></span>Event
					history<span class="footer-arrow" aria-hidden="true"><ArrowUp properties="size-4" /></span>
				</a>
			</section>

			<div class="operations-widgets">
				<section class="dashboard-panel operation-panel" aria-labelledby="active-policies-title">
					<div class="panel-heading">
						<h2 id="active-policies-title">Active policies</h2>
						<span class="review-total" class:has-policies={activePolicies.length > 0}>
							{activePolicies.length}<span class="sr-only"> enabled policy settings</span>
						</span>
					</div>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (The policy summary needs keyboard scrolling.) -->
					<div
						class="operation-body"
						role="region"
						aria-label="Enabled policy settings"
						tabindex="0"
					>
						{#if activePolicies.length}
							<ul class="operation-list">
								{#each activePolicies as policy (policy.id)}
									<li class="operation-row">
										<span class="operation-icon" aria-hidden="true"><ShieldCheck properties="size-5" /></span>
										<div class="operation-copy">
											<strong>{policy.label}</strong>
											<small>{policy.detail}</small>
										</div>
									</li>
								{/each}
							</ul>
						{:else}
							<div class="operation-empty">
								<span aria-hidden="true"><ShieldCheck properties="size-6" /></span>
								<strong>No enabled policy settings</strong>
								<p>Enable policy settings from Policies.</p>
							</div>
						{/if}
					</div>
					<a class="activity-footer" href={resolve('/(app)/policies')}>
						Policy settings<span class="footer-arrow" aria-hidden="true"><ArrowUp properties="size-4" /></span>
					</a>
				</section>
				<section class="dashboard-panel operation-panel" aria-labelledby="queued-actions-title">
					<div class="panel-heading">
						<h2 id="queued-actions-title">Queued actions</h2>
						<span class="review-total" class:has-items={queuedTotal > 0}>
							{queuedTotal}<span class="sr-only"> actions awaiting dispatch</span>
						</span>
					</div>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (The queued-action region needs keyboard scrolling.) -->
					<div
						class="operation-body"
						role="region"
						aria-label="Actions awaiting dispatch"
						tabindex="0"
					>
						{#if queuedActions.length}
							<ol class="operation-list">
								{#each queuedActions as command (command.id)}
									<li class="operation-row">
										<span class="operation-icon" aria-hidden="true"><ListChecks properties="size-5" /></span>
										<div class="operation-copy">
											<strong class="operation-kind">{command.kind.replaceAll('_', ' ')}</strong>
											<small>{actionTarget(command)}</small>
											<time datetime={new Date(command.expires_at).toISOString()}>Expires {date(command.expires_at)}</time>
										</div>
									</li>
								{/each}
							</ol>
						{:else}
							<div class="operation-empty">
								<span aria-hidden="true"><ListChecks properties="size-6" /></span>
								<strong>No queued actions</strong>
								<p>No commands are currently queued.</p>
							</div>
						{/if}
					</div>
					<a class="activity-footer" href={resolve('/(app)/commands')}>
						{queuedTotal > queuedActions.length ? 'Showing oldest 5 - Commands' : 'Commands'}<span
							class="footer-arrow"
							aria-hidden="true"
						>
							<ArrowUp properties="size-4" />
						</span>
					</a>
				</section>
			</div>

			<aside class="overview-aside">
				<section class="dashboard-panel review-panel" aria-labelledby="review-title">
					<div class="panel-heading">
						<div>
							<h2 id="review-title">Needs attention</h2>
						</div>
						<span class="review-total" class:has-items={attentionCount > 0}>{attentionCount}<span class="sr-only"> items to review</span></span>
					</div>
					<div class="review-list">
						{#each reviews as item (item.label)}<a class="review-row" href={resolve(item.href)}><span class="review-icon" aria-hidden="true"><item.icon properties="size-5" /></span><span class="review-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span class="review-count" class:has-items={item.count > 0}>{item.count}</span></a>{/each}
					</div>
				</section>
			</aside>
		</div>
	</div>
</WorkspacePage>

<style>
	.dashboard {
		--dashboard-panel-height: 280px;
		display: grid;
		gap: 20px;
	}
	.status-dot {
		flex-shrink: 0;
	}
	.metric-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	.metric-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		column-gap: 9px;
		min-width: 0;
		padding: 10px 20px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		transition: border-color 180ms ease;
	}
	.metric-card:hover {
		border-color: var(--line-strong);
	}
	.metric-heading {
		display: flex;
		align-items: center;
		min-height: 40px;
		gap: 9px;
	}
	.metric-heading h3 {
		margin: 0;
		font-weight: 500;
		color: var(--text-secondary);
	}
	.metric-heading h3,
	.metric-value {
		font-size: 20px;
		line-height: 1.2;
	}
	.metric-icon {
		display: inline-flex;
		grid-column: 2;
		grid-row: 1 / 3;
		align-self: center;
		align-items: center;
		justify-content: center;
		width: 50px;
		height: 50px;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, #fff 20%, transparent);
		border-radius: 9px;
		background: color-mix(in srgb, #fff 2%, var(--surface));
		color: #fff;
	}
	.device-glyph {
		display: block;
		width: 24px;
		height: 24px;
	}
	.metric-value {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.metric-breakdown {
		display: flex;
		grid-column: 1;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		margin-top: 14px;
		color: var(--muted);
		font-size: 11px;
	}
	.metric-active {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--text-secondary);
	}
	.metric-active .status-dot {
		color: var(--text);
	}
	.metric-card[data-state='healthy'] .status-dot {
		color: var(--success);
	}
	.metric-card[data-state='attention'] .status-dot {
		color: var(--warning);
	}
	.metric-active b {
		font-weight: 600;
	}
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		flex-shrink: 0;
		padding: 3px 8px;
		border: 1px solid var(--success-border);
		border-radius: 999px;
		background: var(--success-surface);
		color: var(--success);
		font-size: 10px;
		font-weight: 500;
		line-height: 1.4;
	}
	.live-dot {
		width: 5px;
		height: 5px;
		flex-shrink: 0;
		border-radius: 50%;
		background: currentColor;
	}
	.live-badge.interrupted {
		border-color: var(--warning-border);
		background: var(--warning-surface);
		color: var(--warning);
	}
	.dashboard-grid {
		display: grid;
		grid-template-columns: minmax(0, 65fr) minmax(0, 35fr);
		align-items: start;
		gap: 20px;
	}
	.dashboard-panel {
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		overflow: hidden;
	}
	.activity-panel,
	.review-panel,
	.operation-panel {
		display: flex;
		flex-direction: column;
		height: var(--dashboard-panel-height);
	}
	.panel-heading,
	.activity-footer {
		flex-shrink: 0;
	}
	.activity-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.activity-body:focus-visible {
		outline: 1px solid var(--line-strong);
		outline-offset: -1px;
	}
	.review-panel .review-list {
		display: grid;
		grid-template-rows: repeat(3, 1fr);
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.panel-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 18px 20px;
	}
	.panel-heading h2 {
		margin: 0;
		font-size: 14px;
	}
	.command-list,
	.operation-list {
		margin: 0;
		padding: 0 20px;
		list-style: none;
	}
	.command-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 15px 0;
		border-top: 1px solid var(--line);
	}
	.command-icon,
	.operation-empty > span,
	.operation-icon {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--muted);
	}
	.command-info {
		display: grid;
		min-width: 0;
		gap: 3px;
	}
	.command-info strong {
		font-size: 13px;
		font-weight: 500;
		text-transform: capitalize;
		overflow-wrap: anywhere;
	}
	.command-info > span {
		font-size: 12px;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}
	.command-info time {
		color: var(--muted);
		font-size: 11px;
	}
	.command-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
		padding: 5px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 10px;
		text-transform: capitalize;
		white-space: nowrap;
	}
	.command-status[data-tone='success'] {
		color: var(--success);
		background: var(--success-surface);
		border-color: var(--success-border);
	}
	.command-status[data-tone='danger'] {
		color: var(--accent-soft);
		background: var(--accent-dim);
		border-color: var(--accent-border);
	}
	.command-status[data-tone='pending'] {
		color: var(--warning);
		background: var(--warning-surface);
		border-color: var(--warning-border);
	}
	.command-status .status-dot {
		width: 4px;
		height: 4px;
	}
	.activity-empty {
		flex: 1;
		justify-content: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 32px 20px;
		border-top: 1px solid var(--line);
		text-align: center;
	}
	.empty-icon {
		display: inline-flex;
		margin-bottom: 12px;
		color: var(--muted);
	}
	.activity-empty h3 {
		margin: 0 0 6px;
		font-size: 14px;
		font-weight: 500;
	}
	.activity-empty p {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
	}
	.activity-footer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 13px 20px;
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 11px;
	}
	.activity-footer:hover {
		color: var(--text);
		background: var(--surface-raised);
	}
	.footer-arrow {
		display: inline-flex;
		margin-left: auto;
	}
	.footer-arrow :global(svg) {
		transform: rotate(90deg);
	}
	.operations-widgets {
		display: grid;
		grid-column: 1;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		min-width: 0;
	}
	.operation-panel .panel-heading {
		gap: 8px;
	}
	.operation-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: auto;
		border-top: 1px solid var(--line);
	}
	.operation-body:focus-visible {
		outline: 1px solid var(--line-strong);
		outline-offset: -1px;
	}
	.operation-empty {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 20px;
		text-align: center;
	}
	.operation-empty strong {
		font-size: 13px;
		font-weight: 500;
	}
	.operation-empty p {
		max-width: 240px;
		margin: 0;
		color: var(--muted);
		font-size: 12px;
	}
	.operation-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 0;
	}
	.operation-row + .operation-row {
		border-top: 1px solid var(--line);
	}
	.operation-icon {
		margin-top: 2px;
	}
	.operation-copy {
		display: grid;
		min-width: 0;
		gap: 3px;
		overflow-wrap: anywhere;
	}
	.operation-copy strong {
		font-size: 12px;
		font-weight: 500;
	}
	.operation-kind {
		text-transform: capitalize;
	}
	.operation-copy small,
	.operation-copy time {
		color: var(--muted);
		font-size: 11px;
	}
	.has-policies {
		color: var(--success);
		border-color: var(--success-border);
		background: var(--success-surface);
	}
	.overview-aside {
		grid-column: 2;
		min-width: 0;
	}
	.review-total,
	.review-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 25px;
		height: 25px;
		padding: 0 7px;
		border: 1px solid var(--line);
		border-radius: 6px;
		color: var(--muted);
		background: var(--surface-raised);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.has-items {
		color: var(--warning);
		border-color: var(--warning-border);
		background: var(--warning-surface);
	}
	.review-list {
		padding: 0 20px 4px;
	}
	.review-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0 -10px;
		padding: 13px 9px;
		border: 1px solid transparent;
		border-top: 1px solid var(--line);
		border-radius: 8px;
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease;
	}
	.review-row:is(:hover, :focus-visible) {
		background: var(--surface-raised);
		color: var(--text);
		border-color: var(--line);
	}
	.review-row:is(:hover, :focus-visible) .review-copy strong,
	.review-row:is(:hover, :focus-visible) .review-copy small,
	.review-row:is(:hover, :focus-visible) .review-icon {
		color: var(--text);
	}
	.review-copy strong,
	.review-copy small,
	.review-icon,
	.review-count {
		transition:
			color 180ms ease,
			border-color 180ms ease,
			background-color 180ms ease;
	}
	.review-icon {
		display: inline-flex;
		color: var(--muted);
		flex-shrink: 0;
	}
	.review-copy {
		min-width: 0;
		flex: 1;
	}
	.review-copy strong {
		display: block;
		font-weight: 500;
		font-size: 12px;
	}
	.review-copy small {
		display: block;
		margin-top: 3px;
		font-size: 11px;
	}
	@media (max-width: 1200px) {
		.metric-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 1000px) {
		.overview-aside {
			grid-column: auto;
		}
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 600px) {
		.operations-widgets {
			grid-template-columns: 1fr;
		}
		.dashboard,
		.dashboard-grid {
			gap: 16px;
		}
		.metric-grid {
			gap: 10px;
		}
		.metric-card {
			padding: 12px;
			column-gap: 6px;
		}
		.metric-heading {
			min-height: 36px;
			gap: 6px;
		}
		.metric-icon {
			width: 36px;
			height: 36px;
		}
		.metric-heading h3,
		.metric-value {
			font-size: 24px;
		}
		.metric-breakdown {
			flex-direction: column;
			align-items: flex-start;
			margin-top: 10px;
		}
		.panel-heading {
			padding: 16px;
		}
		.command-list {
			padding: 0 16px;
		}
		.command-row {
			gap: 10px;
		}
		.command-icon {
			display: none;
		}
		.command-status {
			padding: 4px 7px;
		}
		.activity-footer {
			padding: 13px 16px;
		}
		.review-list {
			padding: 0 16px 4px;
		}
	}
	@media (max-width: 480px) {
		.metric-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
