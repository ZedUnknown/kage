<script lang="ts">
	import { onMount } from 'svelte';

	const id = $props.id();
	let { onFirstRevealComplete }: { onFirstRevealComplete?: () => void } = $props();
	let ring: SVGUseElement;

	onMount(() => {
		if (!onFirstRevealComplete) return;

		const animation = ring.getAnimations()[0];
		const timing = animation?.effect?.getComputedTiming();
		if (!animation || typeof timing?.duration !== 'number') {
			onFirstRevealComplete();
			return;
		}

		// The ring first reaches a complete circle at 43% of its first cycle.
		const revealTime = (timing.delay ?? 0) + timing.duration * 0.43;
		const elapsed = Number(animation.currentTime ?? 0);
		const timer = window.setTimeout(onFirstRevealComplete, Math.max(0, revealTime - elapsed));
		return () => window.clearTimeout(timer);
	});
</script>

<svg
	class="logo"
	viewBox="0 0 512.039 512"
	role="img"
	aria-label="Arasaka loading"
	style:--distortion-filter={`url(#${id}-signal-distortion)`}
>
	<defs>
		<!-- Original central tree path, unchanged. -->
		<path
			id="{id}-arasaka-tree"
			d="M 335.731 196.129 C 312.857 219.004 308.916 253.585 323.83 280.555 L 275.686 328.699 L 275.686 228.547 C 305.284 220.008 326.96 192.768 326.96 160.427 C 326.96 121.248 295.199 89.487 256.019 89.487 C 216.84 89.487 185.079 121.248 185.079 160.427 C 185.079 192.768 206.755 220.008 236.391 228.547 L 236.391 328.699 L 188.247 280.555 C 203.123 253.585 199.182 219.004 176.308 196.129 C 148.604 168.426 103.706 168.426 76.002 196.129 C 48.298 223.833 48.298 268.77 76.002 296.474 C 98.876 319.348 133.458 323.289 160.389 308.375 L 236.391 384.377 L 236.391 455.858 L 275.686 455.858 L 275.686 384.377 L 351.65 308.375 C 378.62 323.289 413.201 319.348 436.075 296.474 C 463.779 268.77 463.779 223.833 436.075 196.129 C 408.371 168.426 363.435 168.426 335.731 196.129 Z"
		/>
		<!-- Original circle has outer radius 256.019 and inner radius 222.017. -->
		<circle
			id="{id}-arasaka-ring"
			cx="256.0195"
			cy="256"
			r="239.0195"
			pathLength="100"
			transform="rotate(-90 256.0195 256)"
		/>

		<!-- Monochrome geometric distortion, no additional colors. -->
		<filter
			id="{id}-signal-distortion"
			x="-10%"
			y="-10%"
			width="120%"
			height="120%"
			color-interpolation-filters="sRGB"
		>
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.018 0.13"
				numOctaves="1"
				seed="11"
				result="noise"
			/>
			<feDisplacementMap
				in="SourceGraphic"
				in2="noise"
				scale="19"
				xChannelSelector="R"
				yChannelSelector="G"
			/>
		</filter>
	</defs>

	<g class="mark--main">
		<use href="#{id}-arasaka-tree" class="tree tree--intro" />
		<use
			bind:this={ring}
			href="#{id}-arasaka-ring"
			class="ring"
		/>
	</g>
	<g class="tear tear--upper" aria-hidden="true">
		<use href="#{id}-arasaka-tree" class="tree" />
		<use href="#{id}-arasaka-ring" class="ring" />
	</g>
	<g class="tear tear--lower" aria-hidden="true">
		<use href="#{id}-arasaka-tree" class="tree" />
		<use href="#{id}-arasaka-ring" class="ring" />
	</g>
</svg>

<style>
	.logo {
		display: block;
		width: min(35vmin, 236px);
		aspect-ratio: 1;
		overflow: visible;
		color: #f4f2f0;
	}
	.tree {
		fill: currentColor;
	}

	/* Only the initial tree growth plays once. Afterwards it stays on-screen. */
	.tree--intro {
		clip-path: inset(100% 0 0 0);
		animation: tree-grow 950ms cubic-bezier(0.18, 0.72, 0.24, 1) forwards;
	}
	@keyframes tree-grow {
		from {
			clip-path: inset(100% 0 0 0);
		}
		to {
			clip-path: inset(0 0 0 0);
		}
	}

	/* Single uninterrupted stroke, clockwise from North.
     Eased drawing + eased erasing; no resets between quadrants. */
	.ring {
		fill: none;
		stroke: currentColor;
		stroke-width: 34.002;
		stroke-linecap: butt;
		stroke-dasharray: 100 100;
		stroke-dashoffset: 100;
		animation: ring-cycle 5s linear 950ms infinite;
	}
	@keyframes ring-cycle {
		0% {
			stroke-dashoffset: 100;
		}
		10% {
			stroke-dashoffset: 100;
			animation-timing-function: cubic-bezier(0.82, 0, 0.1, 1);
		}
		43% {
			stroke-dashoffset: 0;
		}
		71% {
			stroke-dashoffset: 0;
			animation-timing-function: cubic-bezier(0.82, 0, 0.1, 1);
		}
		95%,
		100% {
			stroke-dashoffset: -100;
		}
	}

	/* A genuine shape distortion: briefly displace the original vector paths
     with horizontal-band noise. There are NO colored copies or glows. */
	.mark--main {
		animation: signal-break 5s steps(1, end) 950ms infinite;
	}
	@keyframes signal-break {
		0%,
		51%,
		52.1%,
		53.5%,
		54.7%,
		56.2%,
		57.4%,
		59.2%,
		61.5%,
		100% {
			filter: none;
			transform: translateX(0);
		}
		51.4% {
			filter: var(--distortion-filter);
			transform: translateX(-1.5px);
		}
		53.9% {
			filter: var(--distortion-filter);
			transform: translateX(2px);
		}
		56.6% {
			filter: var(--distortion-filter);
			transform: translateX(-2px);
		}
		59.6% {
			filter: var(--distortion-filter);
			transform: translateX(1px);
		}
	}

	/* Very thin slices of the SAME WHITE LOGO jump sideways momentarily.
     This creates a broken-signal/tearing look rather than RGB separation. */
	.tear {
		opacity: 0;
		pointer-events: none;
	}
	.tear--upper {
		animation: upper-tear 5s steps(1, end) 950ms infinite;
	}
	.tear--lower {
		animation: lower-tear 5s steps(1, end) 950ms infinite;
	}
	@keyframes upper-tear {
		0%,
		51%,
		52.1%,
		53.5%,
		54.8%,
		57%,
		58.1%,
		60%,
		100% {
			opacity: 0;
			transform: translateX(0);
			clip-path: inset(0 0 0 0);
		}
		51.4% {
			opacity: 1;
			transform: translateX(10px);
			clip-path: inset(22% 0 70% 0);
		}
		53.9% {
			opacity: 1;
			transform: translateX(-9px);
			clip-path: inset(43% 0 50% 0);
		}
		57.4% {
			opacity: 1;
			transform: translateX(7px);
			clip-path: inset(15% 0 77% 0);
		}
		58.5% {
			opacity: 1;
			transform: translateX(-11px);
			clip-path: inset(38% 0 56% 0);
		}
	}
	@keyframes lower-tear {
		0%,
		51.6%,
		52.8%,
		54%,
		55.2%,
		57.8%,
		59%,
		60.2%,
		100% {
			opacity: 0;
			transform: translateX(0);
			clip-path: inset(0 0 0 0);
		}
		52% {
			opacity: 1;
			transform: translateX(-8px);
			clip-path: inset(64% 0 30% 0);
		}
		54.4% {
			opacity: 1;
			transform: translateX(11px);
			clip-path: inset(55% 0 37% 0);
		}
		58.2% {
			opacity: 1;
			transform: translateX(-9px);
			clip-path: inset(75% 0 18% 0);
		}
		59.4% {
			opacity: 1;
			transform: translateX(9px);
			clip-path: inset(48% 0 46% 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tree--intro,
		.ring,
		.mark--main,
		.tear {
			animation: none !important;
		}
		.tree--intro {
			clip-path: none;
		}
		.ring {
			stroke-dashoffset: 0;
		}
		.tear {
			opacity: 0;
		}
	}
</style>
