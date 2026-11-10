<script lang="ts">
	import './layout.css';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/assets/kage.ico" />
</svelte:head>

{@render children()}
<Toaster theme="dark" position="top-right" richColors closeButton />
