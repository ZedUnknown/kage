<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import X from '../icons/X.svelte';

	let {
		class: className = '',
		'aria-label': label = 'Close dialog',
		button = $bindable(),
		...attributes
	}: Omit<HTMLButtonAttributes, 'children' | 'type'> & { button?: HTMLButtonElement } = $props();
</script>

<button
	bind:this={button}
	type="button"
	class="icon-button close-button {className}"
	aria-label={label}
	{...attributes}
>
	<X properties="size-[18px]" />
</button>

<style>
	.close-button {
		flex-shrink: 0;
	}
	button.close-button:hover:not(:disabled) {
		background: var(--accent-dim);
		color: var(--accent-hover);
	}
</style>
