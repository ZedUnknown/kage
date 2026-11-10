<script lang="ts">
	import Search from './Search.svelte';
	import MagnifyingGlass from '../icons/MagnifyingGlass.svelte';

	let {
		value = $bindable(''),
		label,
		placeholder,
		matches,
		total
	}: {
		value?: string;
		label: string;
		placeholder: string;
		matches: number;
		total: number;
	} = $props();

	const id = $props.id();
</script>

<div class="panel-search" class:searching={!!value.trim()}>
	<label class="search-field">
		<span class="sr-only">{label}</span>
		<span class="search-icon" aria-hidden="true"><MagnifyingGlass properties="size-4" /></span>
		<Search bind:value {placeholder} aria-label={label} aria-describedby={id} />
	</label>
	<p {id} role="status" aria-atomic="true">
		{#if value.trim()}
			{matches === 0
				? 'No matches'
				: `${matches} ${matches === 1 ? 'match' : 'matches'} · Shown first`}
		{:else}
			{total} {total === 1 ? 'item' : 'items'}
		{/if}
	</p>
</div>

<style>
	.panel-search {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 18px;
		margin-bottom: 20px;
	}
	.search-field {
		position: relative;
		flex: 1 1 240px;
		max-width: 420px;
		min-width: 0;
	}
	.search-icon {
		position: absolute;
		top: 50%;
		left: 12px;
		display: inline-flex;
		transform: translateY(-50%);
		color: var(--muted);
		pointer-events: none;
	}
	.search-field :global(input) {
		padding-left: 36px;
	}
	p {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
	}
	.searching p {
		color: var(--accent-soft);
	}
</style>
