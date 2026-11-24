<script lang="ts">
	let {
		kind,
		properties = 'size-6'
	}: {
		kind: 'broker' | 'hub' | 'node' | 'client';
		properties?: string;
	} = $props();
</script>

<svg
	class={properties}
	xmlns="http://www.w3.org/2000/svg"
	width="24"
	height="24"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if kind === 'broker'}
		<rect x="3" y="3" width="18" height="7" rx="2" />
		<rect x="3" y="14" width="18" height="7" rx="2" />
		<path d="M7 6.5h4M7 17.5h4" />
		<circle cx="17" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
		<circle cx="17" cy="17.5" r="0.8" fill="currentColor" stroke="none" />
	{:else if kind === 'hub'}
		<rect x="3" y="12" width="18" height="8" rx="2" />
		<path d="M7 12V4m10 8V4M15 16h2" />
		<circle cx="7" cy="16" r="0.8" fill="currentColor" stroke="none" />
		<circle cx="11" cy="16" r="0.8" fill="currentColor" stroke="none" />
	{:else if kind === 'node'}
		<rect x="7" y="2" width="10" height="8" rx="2" />
		<path d="M6 10v5h12v-5M8 15v7m8-7v7M6 11H3v4h3m12-4h3v4h-3" />
	{:else}
		<rect x="3" y="3" width="18" height="13" rx="2" />
		<path d="M3 12h18M12 16v5m-4 0h8" />
	{/if}
</svg>

<style>
	.device-glyph {
		display: block;
		width: 24px;
		height: 24px;
	}
</style>
