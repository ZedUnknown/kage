<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Spinner from './Spinner.svelte';
	import ArrowCounterClockwise from '../icons/ArrowCounterClockwise.svelte';

	let {
		onRefresh,
		children,
		disabled = false
	}: {
		onRefresh: () => Promise<void>;
		children: Snippet;
		disabled?: boolean;
	} = $props();

	const threshold = 60;
	let container: HTMLDivElement;
	let startX = 0;
	let startY = 0;
	let pulling = false;
	let pullDistance = $state(0);
	let refreshing = $state(false);

	function reset() {
		pulling = false;
		pullDistance = 0;
	}

	function start(event: TouchEvent) {
		reset();
		if (disabled || refreshing || event.touches.length !== 1 || window.scrollY > 0) return;

		const target = event.target instanceof Element ? event.target : null;

		if (
			!target ||
			target.closest('input, textarea, select, button, a, dialog, [data-no-pull-refresh]')
		) {
			return;
		}

		for (let node: Element | null = target; node && node !== container; node = node.parentElement) {
			const style = getComputedStyle(node);

			if (
				['auto', 'scroll'].includes(style.overflowY) &&
				node.scrollHeight > node.clientHeight &&
				node.scrollTop > 0
			) {
				return;
			}
		}

		startX = event.touches[0].clientX;
		startY = event.touches[0].clientY;
		pulling = true;
	}

	function move(event: TouchEvent) {
		if (!pulling) return;

		if (disabled || event.touches.length !== 1) {
			reset();

			return;
		}

		const deltaY = event.touches[0].clientY - startY;

		if (deltaY < 0 || Math.abs(event.touches[0].clientX - startX) > deltaY) {
			reset();

			return;
		}

		pullDistance = Math.min(deltaY * 0.4, 90);
		if (pullDistance > 0 && event.cancelable) event.preventDefault();
	}

	async function end() {
		const shouldRefresh = pulling && !disabled && pullDistance >= threshold;
		pulling = false;
		if (!shouldRefresh) {
			pullDistance = 0;

			return;
		}

		refreshing = true;
		pullDistance = threshold;

		try {
			await onRefresh();
		} finally {
			refreshing = false;
			pullDistance = 0;
		}
	}

	onMount(() => {
		container.addEventListener('touchstart', start, { passive: true });
		container.addEventListener('touchmove', move, { passive: false });
		container.addEventListener('touchend', end);
		container.addEventListener('touchcancel', reset);

		return () => {
			container.removeEventListener('touchstart', start);
			container.removeEventListener('touchmove', move);
			container.removeEventListener('touchend', end);
			container.removeEventListener('touchcancel', reset);
		};
	});
</script>

<div bind:this={container}>
	<div
		class="refresh-indicator"
		class:visible={pullDistance > 0}
		style:transform="translate(-50%, {pullDistance - 48}px)"
		role="status"
	>
		{#if refreshing}<Spinner properties="size-5" />{:else}<ArrowCounterClockwise
				properties="size-5"
			/>{/if}
		<span class="sr-only">{refreshing ? 'Refreshing' : pullDistance >= threshold ? 'Release to refresh' : ''}</span>
	</div>
	{@render children()}
</div>

<style>
	.refresh-indicator {
		position: fixed;
		top: 0;
		left: 50%;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: 0 2px 8px #0004;
		pointer-events: none;
		visibility: hidden;
	}
	.refresh-indicator.visible {
		visibility: visible;
	}
</style>
