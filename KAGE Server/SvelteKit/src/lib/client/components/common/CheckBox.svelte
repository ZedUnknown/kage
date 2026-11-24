<script lang="ts">
	import type { Snippet } from 'svelte';
	import Check from '../icons/Check.svelte';

	let {
		checked = $bindable(false),
		disabled = false,
		name,
		onchange,
		children
	}: {
		checked?: boolean;
		disabled?: boolean;
		name?: string;
		onchange?: (checked: boolean) => void;
		children?: Snippet;
	} = $props();
</script>

<label class="checkbox">
	<input
		bind:checked
		type="checkbox"
		class="sr-only"
		{name}
		{disabled}
		onchange={(event) => onchange?.(event.currentTarget.checked)}
	/>
	<span class="check-mark" aria-hidden="true">
		{#if checked}<Check properties="size-3" />{/if}
	</span>
	{@render children?.()}
</label>

<style>
	.checkbox {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.checkbox:has(input:disabled) {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.check-mark {
		display: inline-grid;
		flex: 0 0 18px;
		width: 18px;
		height: 18px;
		place-items: center;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: var(--field);
		color: #fff;
	}
	.checkbox:hover input:not(:disabled):not(:checked) + .check-mark {
		border-color: var(--muted);
	}
	input:checked + .check-mark {
		border-color: var(--accent);
		background: var(--action);
	}
	input:focus-visible + .check-mark {
		outline: 2px solid var(--accent-soft);
		outline-offset: 3px;
	}
</style>
