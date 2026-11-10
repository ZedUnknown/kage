<script lang="ts">
	import { connectionStatus, type ConnectionFilter } from '../../connection-status.ts';

	let {
		items,
		label,
		value = $bindable<ConnectionFilter>('all')
	}: {
		items: readonly { connection_state: string }[];
		label: string;
		value?: ConnectionFilter;
	} = $props();

	let filters = $derived([
		{ value: 'all', label: 'All', count: items.length },
		{
			value: 'online',
			label: 'Online',
			count: items.filter((item) => connectionStatus(item.connection_state) === 'online').length
		},
		{
			value: 'offline',
			label: 'Offline',
			count: items.filter((item) => connectionStatus(item.connection_state) === 'offline').length
		}
	] satisfies { value: ConnectionFilter; label: string; count: number }[]);
</script>

<div class="connection-filters" role="group" aria-label={label}>
	{#each filters as filter (filter.value)}
		<button
			type="button"
			class="badge {filter.value}"
			class:selected={value === filter.value}
			aria-pressed={value === filter.value}
			onclick={() => (value = filter.value)}
		>
			{filter.label} <span>{filter.count}</span>
		</button>
	{/each}
</div>

<style>
	.connection-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: -6px 0 20px;
	}
	button.badge {
		display: inline-flex;
		gap: 4px;
		min-height: 28px;
		padding: 4px 9px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-raised);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 500;
	}
	button.online {
		background: var(--success-surface);
		border-color: var(--success-border);
		color: var(--success);
	}
	button.offline {
		background: var(--accent-dim);
		border-color: var(--accent-border);
		color: var(--accent);
	}
	button.badge:hover {
		border-color: currentColor;
		filter: brightness(1.15);
	}
	button.badge.selected {
		border-color: currentColor;
		box-shadow: 0 0 0 2px var(--accent-halo);
		font-weight: 700;
	}
	button span {
		font-variant-numeric: tabular-nums;
	}
</style>
