<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import MinusCircle from '../icons/MinusCircle.svelte';
	import PlusCircle from '../icons/PlusCircle.svelte';
	import CornersOut from '../icons/CornersOut.svelte';
	import { fitNetwork, zoomNetwork, minNetworkScale, maxNetworkScale, type NetworkView } from '../../network-viewport.ts';

	let { children }: { children: Snippet } = $props();

	let viewport: HTMLDivElement;
	let content: HTMLDivElement;
	let view = $state<NetworkView>({ x: 0, y: 0, scale: 1 });
	let dragging = $state(false);
	let adjusted = false;
	let suppressClick = false;
	const pointers = new Map<number, { x: number; y: number }>();
	let origin = { x: 0, y: 0 };
	let pinch: { x: number; y: number; distance: number } | undefined;

	function fit() {
		if (!viewport || !content) return;

		view = fitNetwork(
			viewport.clientWidth,
			viewport.clientHeight,
			content.offsetWidth,
			content.offsetHeight
		);
		adjusted = false;
	}

	function zoom(scale: number, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
		view = zoomNetwork(view, scale, x, y);
		adjusted = true;
	}

	function resetZoom() {
		if (!viewport || !content) return;

		view = {
			x: (viewport.clientWidth - content.offsetWidth) / 2,
			y: (viewport.clientHeight - content.offsetHeight) / 2,
			scale: 1
		};
		adjusted = true;
	}

	function wheel(event: WheelEvent) {
		event.preventDefault();
		if (!event.deltaY) return;

		const bounds = viewport.getBoundingClientRect();
		const delta =
			event.deltaY *
			(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);

		zoom(
			view.scale * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.003),
			event.clientX - bounds.left,
			event.clientY - bounds.top
		);
	}

	function gesture() {
		const [a, b] = [...pointers.values()];

		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y) };
	}

	function pointerDown(event: PointerEvent) {
		if (event.button !== 0 || pointers.size >= 2) return;

		if (!pointers.size) {
			suppressClick = false;
			origin = { x: event.clientX, y: event.clientY };
		}

		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			pinch = gesture();
			suppressClick = true;
			for (const id of pointers.keys()) viewport.setPointerCapture(id);
		}
	}

	function pointerMove(event: PointerEvent) {
		const previous = pointers.get(event.pointerId);

		if (!previous) return;

		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2 && pinch) {
			const next = gesture();
			const bounds = viewport.getBoundingClientRect();
			zoom(
				(view.scale * next.distance) / Math.max(1, pinch.distance),
				pinch.x - bounds.left,
				pinch.y - bounds.top
			);
			view = { ...view, x: view.x + next.x - pinch.x, y: view.y + next.y - pinch.y };
			pinch = next;

			return;
		}

		if (!dragging && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 5) return;

		const start = dragging ? previous : origin;
		dragging = true;
		suppressClick = true;
		adjusted = true;
		viewport.setPointerCapture(event.pointerId);
		view = { ...view, x: view.x + event.clientX - start.x, y: view.y + event.clientY - start.y };
	}

	function pointerEnd(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;

		pointers.delete(event.pointerId);
		if (viewport.hasPointerCapture(event.pointerId)) {
			viewport.releasePointerCapture(event.pointerId);
		}

		pinch = undefined;
		dragging = false;
		const remaining = pointers.values().next().value;

		if (remaining) origin = remaining;
	}

	function keyDown(event: KeyboardEvent) {
		if (event.target !== viewport) return;

		const panKeys: Record<string, [number, number]> = {
			ArrowLeft: [40, 0],
			ArrowRight: [-40, 0],
			ArrowUp: [0, 40],
			ArrowDown: [0, -40]
		};

		if (panKeys[event.key]) {
			event.preventDefault();
			const [x, y] = panKeys[event.key];
			view = { ...view, x: view.x + x, y: view.y + y };
			adjusted = true;
		} else if (['+', '=', '-', '0', 'Home'].includes(event.key)) {
			event.preventDefault();
			if (event.key === 'Home') fit();
			else if (event.key === '0') resetZoom();
			else {
				zoom(view.scale * (event.key === '-' ? 1 / 1.2 : 1.2));
			}
		}
	}

	onMount(() => {
		viewport.addEventListener('wheel', wheel, { passive: false });
		const observer = new ResizeObserver(() => {
			if (!adjusted) fit();
		});
		observer.observe(viewport);
		observer.observe(content);
		fit();

		return () => {
			observer.disconnect();
			viewport.removeEventListener('wheel', wheel);
		};
	});
</script>

<svelte:window
	onpointerup={pointerEnd}
	onpointercancel={pointerEnd}
	onblur={() => {
		pointers.clear();
		dragging = false;
		pinch = undefined;
	}}
/>
<div class="network-viewport" data-no-pull-refresh>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The map needs focus for keyboard panning and zooming. Device controls use native buttons.) -->
	<div
		bind:this={viewport}
		class="viewport"
		class:dragging
		role="region"
		aria-label="Interactive hub network"
		aria-describedby="network-navigation-help"
		tabindex="0"
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerEnd}
		onpointercancel={pointerEnd}
		onlostpointercapture={pointerEnd}
		onkeydown={keyDown}
		onclickcapture={(event) => {
			if (suppressClick && event.detail > 0) {
				event.preventDefault();
				event.stopPropagation();
			}
		}}
	>
		<div
			bind:this={content}
			class="network-content"
			style:transform={`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}
		>
			{@render children()}
		</div>
	</div>
	<div class="navigation-bar">
		<span class="navigation-hint" aria-hidden="true">Drag to pan - Scroll to zoom</span>
		<div class="zoom-controls" role="group" aria-label="Network view controls">
			<button
				type="button"
				class="icon-button"
				aria-label="Zoom out"
				title="Zoom out (−)"
				disabled={view.scale <= minNetworkScale}
				onclick={() => zoom(view.scale / 1.2)}
			>
				<MinusCircle properties="size-4" />
			</button>
			<button
				type="button"
				class="zoom-level"
				aria-label="Reset zoom to 100%"
				title="Reset zoom (0)"
				onclick={resetZoom}
			>
				{Math.round(view.scale * 100)}%
			</button>
			<button
				type="button"
				class="icon-button"
				aria-label="Zoom in"
				title="Zoom in (+)"
				disabled={view.scale >= maxNetworkScale}
				onclick={() => zoom(view.scale * 1.2)}
			>
				<PlusCircle properties="size-4" />
			</button>
			<span class="control-divider" aria-hidden="true"></span>
			<button
				type="button"
				class="icon-button"
				aria-label="Fit network to view"
				title="Fit to view (Home)"
				onclick={fit}
			>
				<CornersOut properties="size-4" />
			</button>
		</div>
	</div>
	<span id="network-navigation-help" class="sr-only">Drag to pan, scroll or pinch to zoom. Use arrow keys to pan, plus and minus to zoom, 0 to reset
		zoom, and Home to fit the network.
	</span>
</div>

<style>
	.network-viewport {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--background);
	}
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		touch-action: none;
		overscroll-behavior: contain;
		cursor: grab;
		background-image: radial-gradient(var(--line) 0.8px, transparent 0.8px);
		background-size: 18px 18px;
		user-select: none;
	}
	.viewport:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -3px;
	}
	.viewport.dragging,
	.viewport.dragging :global(*) {
		cursor: grabbing;
	}
	.network-content {
		width: max-content;
		transform-origin: 0 0;
	}
	.navigation-bar {
		position: absolute;
		right: 12px;
		bottom: 12px;
		left: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		pointer-events: none;
	}
	.navigation-hint {
		color: var(--muted);
		font-size: 10px;
		padding: 4px 7px;
		border-radius: 4px;
		background: var(--background);
	}
	.zoom-controls {
		display: flex;
		align-items: center;
		padding: 3px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--surface);
		box-shadow: 0 4px 16px #0005;
		pointer-events: auto;
	}
	.zoom-controls button {
		width: 30px;
		min-width: 30px;
		height: 30px;
		min-height: 30px;
		padding: 6px;
		border-radius: 6px;
	}
	.zoom-controls .zoom-level {
		width: 48px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.zoom-controls .zoom-level:hover {
		background: var(--surface-raised);
		color: var(--text);
	}
	.control-divider {
		height: 16px;
		width: 1px;
		margin-inline: 3px;
		background: var(--line);
	}
	@media (max-width: 600px) {
		.navigation-hint {
			display: none;
		}
		.navigation-bar {
			left: auto;
		}
	}
</style>
