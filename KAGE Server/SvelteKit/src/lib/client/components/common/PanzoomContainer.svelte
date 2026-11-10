<script lang="ts">
	import panzoom, { type PanZoom, type PanZoomOptions } from 'panzoom';
	import { onMount } from 'svelte';

	const defaultOpts: PanZoomOptions = {
		bounds: true,
		boundsPadding: 0.1,
		zoomSpeed: 0.065
	};

	let containerElement: HTMLElement;
	let instance: PanZoom | undefined;

	let {
		className = '',
		options = {},

		image
	} = $props();

	onMount(() => {
		const localInstance = panzoom(containerElement, { ...defaultOpts, ...options });
		instance = localInstance;

		return () => {
			localInstance.dispose();
		};
	});
</script>

<div bind:this={containerElement} class={className}>
	{@render image()}
</div>
