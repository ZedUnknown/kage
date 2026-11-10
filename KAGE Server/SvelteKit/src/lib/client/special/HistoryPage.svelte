<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import WorkspacePage from './WorkspacePage.svelte';
	import DownloadSimple from '../components/icons/DownloadSimple.svelte';

	let { type, children }: { type: 'events' | 'audit'; children: Snippet } = $props();

	const title = $derived(type === 'events' ? 'Device events' : 'Administrative audit');
	const description = $derived(
		type === 'events'
			? 'Review device activity and command execution history.'
			: 'Review account changes and administrative actions.'
	);
</script>

<div class="history-page">
	<WorkspacePage {title} {description}>
		<nav class="history-tabs" aria-label="History">
			<a
				href={resolve('/(app)/history/events')}
				aria-current={type === 'events' ? 'page' : undefined}
			>
				Device events
			</a>
			<a href={resolve('/(app)/history/audit')} aria-current={type === 'audit' ? 'page' : undefined}>Administrative audit</a>
		</nav>
		<section class="panel history-panel" aria-label={title}>
			<div class="history-heading">
				<p class="muted">Latest 100 records, newest first.</p>
				{#if type === 'audit'}
					<a
						class="button secondary"
						href={resolve('/(app)/history/audit/export')}
						download="kage-administrative-audit.csv"
						aria-label="Export all administrative audit records as CSV"
					>
						<span aria-hidden="true"><DownloadSimple properties="size-4" /></span>Export CSV
					</a>
				{/if}
			</div>
			<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- The Svelte compiler warns about focusable scroll regions, while the ESLint compiler does not. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable region needs keyboard focus for scrolling.) -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable region needs keyboard focus for scrolling.) -->
			<div
				class="history-scroll"
				role="region"
				aria-label={`${title} records`}
				tabindex="0"
				data-no-pull-refresh
			>
				{@render children()}
			</div>
		</section>
	</WorkspacePage>
</div>

<style>
	.history-page {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - var(--workspace-padding-bottom));
		min-height: 0;
	}
	.history-page :global(.page-header) {
		flex-shrink: 0;
	}
	.history-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		flex-shrink: 0;
		margin-bottom: 20px;
	}
	.history-tabs a {
		padding: 9px 14px;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--text-secondary);
		font-size: 13px;
	}
	.history-tabs a:hover {
		background: var(--surface-raised);
	}
	.history-tabs a[aria-current='page'] {
		border-color: var(--accent-border);
		background: var(--action);
		color: var(--text);
	}
	.history-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		margin: 0;
		overflow: hidden;
	}
	.history-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		flex-shrink: 0;
		padding-bottom: 16px;
	}
	.history-heading p {
		margin: 0;
	}
	.history-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}
	.history-scroll:focus-visible {
		outline: 2px solid var(--accent-soft);
		outline-offset: -2px;
	}
	.history-scroll :global(ol) {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	/* Event and audit pages supply these rows through the children snippet. */
	.history-scroll :global(.history-row) {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr;
		gap: 16px;
		padding: 15px 0;
		border-top: 1px solid var(--line);
		color: var(--text-secondary);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	@media (max-width: 800px) {
		.history-scroll :global(.history-row) {
			grid-template-columns: 1fr;
			gap: 8px;
		}
	}
</style>
