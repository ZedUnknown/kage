<script lang="ts">
	let { properties = 'size-4', animationClass = '', collapsed = false } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	class={properties}
	width="24"
	height="24"
	fill="none"
	viewBox="0 0 24 24"
	aria-hidden="true"
	focusable="false"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
>
	<path
		d="M21.25 6.72v10.56a2.97 2.97 0 0 1-2.97 2.97H5.72a2.97 2.97 0 0 1-2.97-2.97V6.72a2.97 2.97 0 0 1 2.97-2.97h12.56a2.97 2.97 0 0 1 2.97 2.97"
	></path>
	<path d="M6.25 7.25v9.5" class={['divider', animationClass]} class:collapsed></path>
</svg>

<style>
	.divider {
		transform: translateX(0);
		transition: transform var(--sidebar-duration, 260ms) var(--sidebar-easing, ease);
	}
	.divider.collapsed {
		transform: translateX(11.5px);
	}
	@media (prefers-reduced-motion: reduce) {
		.divider {
			transition: none;
		}
	}
</style>
