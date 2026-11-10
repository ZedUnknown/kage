<script lang="ts">
	let {
		show = $bindable(),
		src,
		alt
	} = $props();

	import { onDestroy } from 'svelte';
	import PanzoomContainer from '$lib/components/common/PanzoomContainer.svelte';
	import { browser } from '$app/environment';
	import Plus from '../icons/Plus.svelte';
	import DownloadSimple from '../icons/DownloadSimple.svelte';


	let previewElement = $state(null as HTMLDivElement | null);

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			console.log('Escape');
			show = false;
		}
	};

	$effect(() => {
		if (!browser) return;

		if (show && previewElement) {
			document.body.appendChild(previewElement);
			window.addEventListener('keydown', handleKeyDown);
			document.body.style.overflow = 'hidden';
		} else if (previewElement) {
			window.removeEventListener('keydown', handleKeyDown);
			document.body.removeChild(previewElement);
			document.body.style.overflow = 'unset';
		}
	})

	onDestroy(() => {
		if (!browser) return;

		window.removeEventListener('keydown', handleKeyDown);
		show = false;

		if (previewElement && previewElement.parentNode === document.body) {
			document.body.removeChild(previewElement);
		}
		// NOTE: Resetting overflow can unlock scrolling too soon if modals are stacked.
		// Use a shared scroll lock if stacked modals are added.
		document.body.style.overflow = 'unset';
	});
</script>

{#if show}

	<div
		bind:this={previewElement}
		class="fixed top-0 right-0 left-0 bottom-0 text-white w-full min-h-screen h-screen flex justify-center z-9999999 overflow-hidden overscroll-contain"
	>

		<div class="absolute top-0 right-0 left-0 bottom-0 bg-black/85 backdrop-blur-xs z-10"></div>

		<div class="z-20">
			<div class="absolute left-0 top-0 w-full select-none z-50">
				<div class="flex justify-between p-5">

					<div class="flex gap-2 items-center">
						<button
							class="p-2 cursor-pointer hover:bg-white/10 rounded-full transition-all duration-200 z-999"
							onpointerdown={(e) => {
								e.stopImmediatePropagation();
								e.preventDefault();
								show = false;
							}}
							onclick={(e) => {
								show = false;
							}}
						>
							<Plus properties="size-6 rotate-45" />
						</button>

						<div class="text-md text-gray-300 font-bold">
							{alt}
						</div>
					</div>

					<div class="flex gap-2 items-center">
						<button
							class="p-2 cursor-pointer hover:bg-white/10 rounded-full transition-all duration-200 z-999"
							aria-label="download"
							onclick={() => {
								const link = document.createElement('a');
								link.href = src;
								link.download = alt || ""
								document.body.append(link)
								link.click()
								document.removeChild(link)
							}}
						>
							<DownloadSimple properties="size-6" />
						</button>
					</div>

				</div>


			</div>


			{#snippet image()}
				<img {src} {alt} class=" mx-auto h-full object-scale-down select-none" draggable="false" />
			{/snippet}

			<PanzoomContainer {image} className="flex h-full max-h-full justify-center items-center z-10 cursor-zoom-in" />
		</div>

	</div>
{/if}
