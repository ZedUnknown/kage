<script lang="ts">
	import StatusDot from './StatusDot.svelte';
	import Monitor from '../icons/Monitor.svelte';
	import Link from '../icons/Link.svelte';

	let {
		name,
		pcId,
		nodeMac,
		mapped,
		stale,
		selected,
		disabled = false,
		onclick
	}: {
		name: string;
		pcId: string;
		nodeMac?: string;
		mapped: boolean;
		stale: boolean;
		selected: boolean;
		disabled?: boolean;
		onclick: () => void;
	} = $props();
</script>

<button
	type="button"
	class="mapping-desk"
	class:selected
	{disabled}
	aria-pressed={selected}
	aria-controls="assignment-panel"
	aria-label={`${pcId}, ${name}, ${mapped ? (nodeMac ?? 'assigned node unavailable') : 'unmapped'}${stale ? ', no recent node reading' : ''}`}
	{onclick}
>
	<span class="desk-visual">
		<span class="desk-icon" aria-hidden="true"><Monitor properties="size-6" /></span>
		<span class="desk-status" data-state={stale ? 'stale' : mapped ? 'mapped' : 'unmapped'}>
			<StatusDot />
			{stale ? 'NO SIGNAL' : mapped ? 'MAPPED' : 'UNMAPPED'}
		</span>
		<span class="desk-identity">
			<span class="desk-topline">
				<strong class="desk-name" title={name}>{name}</strong>
			</span>
			<span class="desk-id-row">
				<span class="desk-id-label">ID:</span>
				<span class="desk-id" title={pcId}>{pcId}</span>
			</span>
		</span>
	</span>

	<span class="desk-content">
		<span class="desk-assignment">
			<span class="assignment-icon" aria-hidden="true">
				<Link properties="size-[18px]" />
			</span>
			<span class="assignment-copy">
				<span class="assignment-label">CHAIR NODE</span>
				{#if mapped}
					<code title={nodeMac ?? 'Node unavailable'}>{nodeMac ?? 'Node unavailable'}</code>
				{:else}
					<code class="empty-assignment">No node linked</code>
				{/if}
			</span>
		</span>
	</span>
</button>

<style>
	button.mapping-desk {
		--status-dot-size: 6px;
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
		align-items: stretch;
		justify-items: stretch;
		min-width: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text-secondary);
		text-align: left;
		font-weight: 400;
		overflow: hidden;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	button.mapping-desk:hover:not(:disabled):not(.selected) {
		border-color: var(--action);
		box-shadow: 0 3px 10px #0002;
	}

	button.mapping-desk.selected {
		border-color: var(--action);
		box-shadow: none;
	}

	button.mapping-desk:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	button.mapping-desk:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	.desk-visual {
		position: relative;
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		grid-template-rows: 40px;
		align-items: center;
		column-gap: 11px;
		min-width: 0;
		padding: 10px 12px 9px;
		border-bottom: 1px solid var(--line);
		background: var(--surface-deep);
		color: var(--muted);
		transition:
			/* background 140ms ease, */
			color 140ms ease;
	}

	.desk-icon {
		grid-column: 1;
		grid-row: 1;
		align-self: center;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--surface);
		color: inherit;
	}

	.mapping-desk.selected .desk-visual {
		border-bottom-color: var(--line-strong);
		background:
			linear-gradient(180deg, #ffffff04, transparent 70%),
			linear-gradient(105deg, #781e32 0%, #3b1c2a 46%, var(--surface) 88%);
		color: var(--color-white);
	}

	.mapping-desk.selected .desk-icon {
		border-color: #ffffff38;
		background: #ffffff14;
	}

	.mapping-desk:hover:not(:disabled):not(.selected) .desk-visual {
		color: var(--accent);
	}

	.desk-content {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 10px;
	}

	.desk-identity {
		grid-column: 2;
		grid-row: 1;
		display: grid;
		justify-items: start;
		gap: 4px;
		max-width: calc(100% - 78px);
		min-width: 0;
		padding: 0;
	}

	.desk-topline {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		min-width: 0;
	}

	.desk-name {
		display: block;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		color: var(--text);
		font-family: var(--font-tech);
		font-size: 16px;
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.25;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.desk-status {
		--status-dot-size: 6px;
		--status-dot-shadow: 0 1px 1px #00000026, 0 0 0 2px #ffffff12;
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		gap: 5px;
		max-width: 100%;
		padding: 5px 7px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--surface);
		box-shadow: inset 0 1px 4px #ffffff08;
		color: var(--muted);
		font-size: 9px;
		font-weight: 500;
		line-height: 1;
		white-space: nowrap;
	}

	.desk-status[data-state='mapped'] {
		--status-dot-color: var(--success);
	}

	.desk-status[data-state='stale'] {
		--status-dot-color: var(--warning);
	}

	.desk-id-row {
		display: flex;
		align-items: baseline;
		justify-self: start;
		gap: 5px;
		max-width: 100%;
		min-width: 0;
		padding: 3px 8px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-deep);
		font-size: 10px;
		line-height: 1.3;
	}

	.desk-id-label {
		flex: none;
		color: var(--muted);
		font-weight: 500;
	}

	.desk-id {
		min-width: 0;
		overflow: hidden;
		color: var(--text);
		font-family: var(--font-tech);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.desk-assignment {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		margin-top: auto;
		padding: 6px 8px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--surface-deep);
	}

	.assignment-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 26px;
		min-height: 28px;
		padding-right: 7px;
		border-right: 1px solid var(--line);
		color: var(--muted);
		transition: color 140ms ease;
	}

	.mapping-desk.selected .assignment-icon {
		color: var(--accent);
	}

	.assignment-copy {
		display: grid;
		gap: 3px;
		flex: 1;
		min-width: 0;
	}

	.assignment-label {
		color: var(--muted);
		font-size: 8px;
		font-weight: 650;
		letter-spacing: 0.07em;
		line-height: 1.2;
	}

	.assignment-copy code {
		display: block;
		max-width: 100%;
		color: var(--text);
		font-family: var(--font-tech);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		line-height: 1.35;
		white-space: nowrap;
	}

	.assignment-copy code.empty-assignment {
		color: var(--muted);
		font-family: var(--font-body);
		font-size: 10px;
	}

	@media (max-width: 420px) {
		button.mapping-desk {
			min-height: 172px;
		}

		.desk-content {
			padding: 8px 9px 9px;
		}

		.desk-name {
			font-size: 15px;
		}

		.desk-assignment {
			gap: 6px;
			padding: 5px 6px;
		}

		.assignment-copy code {
			font-size: 9px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button.mapping-desk,
		.desk-visual,
		.assignment-icon {
			transition: none;
		}
	}
</style>
