<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		actionLabel,
		disabled = false,
		onAction
	}: {
		children: Snippet;
		actionLabel?: string;
		disabled?: boolean;
		onAction?: () => void;
	} = $props();
</script>

<div class="empty empty-state">
	{@render children()}
	{#if actionLabel && onAction}
		<button type="button" {disabled} aria-haspopup="dialog" onclick={onAction}>
			{actionLabel}
		</button>
	{/if}
</div>
