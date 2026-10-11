<script lang="ts">
	import './layout.css';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/assets/kage.ico"/>
</svelte:head>

{@render children()}
