<script lang="ts">
	import { resolve } from '$app/paths';
	let { compact = false }: { compact?: boolean } = $props();
</script>

<a href={resolve('/(app)')} class="brand" class:compact aria-label="KAGE Workspace Systems home">
	<img src="/assets/kage.svg" alt="" width="40" height="40" />
	<div class="brand-wordmark">KAGE<span>Workspace systems</span></div>
</a>
