<script lang="ts">
	import { resolve } from '$app/paths';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<a href={resolve('/(app)')} class="brand" class:compact aria-label="KAGE Workspace Systems home">
	<img src="/assets/kage.svg" alt="" width="40" height="40" />
	<div class="brand-wordmark">KAGE<span>Workspace systems</span></div>
</a>

<style>
	@font-face {
		font-family: 'Arame Mono';
		src: url('/assets/fonts/arame-mono-Bold.ttf') format('truetype');
		font-weight: 700;
		font-style: normal;
		font-display: swap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 11px;
		color: var(--text);
		line-height: 1.15;
		flex-shrink: 0;
		transition: gap var(--sidebar-duration) var(--sidebar-easing);
	}
	.brand img {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
	}
	.brand-wordmark {
		min-width: 0;
		max-width: 150px;
		overflow: hidden;
		white-space: nowrap;
		opacity: 1;
		transition:
			max-width var(--sidebar-duration) var(--sidebar-easing),
			opacity 150ms ease;
		font-size: 23px;
		letter-spacing: -0.8px;
		font-weight: 750;
	}
	.brand-wordmark span {
		display: block;
		margin-top: 4px;
		color: var(--muted);
		font-size: 10px;
		letter-spacing: 0;
		font-weight: 400;
	}
	/* The sidebar ancestor belongs to the app layout. */
	:global(.sidebar) .brand-wordmark {
		font-family: 'Arame Mono', var(--font-tech);
		font-weight: 700;
		letter-spacing: 0;
	}
	:global(.sidebar) .brand-wordmark span {
		font-family: var(--font-body);
	}
	.brand.compact {
		gap: 0;
	}
	.brand.compact .brand-wordmark {
		max-width: 0;
		opacity: 0;
	}
</style>
