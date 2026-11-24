<script lang="ts">
	import CloseButton from './CloseButton.svelte';

	let {
		title,
		id,
		closeLabel = 'Close dialog',
		busy = false,
		onclose
	}: {
		title: string;
		id?: string;
		closeLabel?: string;
		busy?: boolean;
		onclose: () => void;
	} = $props();
</script>

<header>
	<h2 {id}>{title}</h2>
	<CloseButton aria-label={closeLabel} disabled={busy} onclick={onclose} />
</header>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
