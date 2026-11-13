<script lang="ts">
	import { onMount } from 'svelte';
	const id = $props.id();
	let { onComplete }: { onComplete: () => void } = $props();

	onMount(() => {
		const timer = window.setTimeout(onComplete, 2050);
		return () => window.clearTimeout(timer);
	});
</script>

<div class="intro-shell">
	<svg
		class="intro-logo"
		viewBox="0 0 512.039 512"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Arasaka logo"
		style:--intro-distortion={`url(#${id}-intro-distortion)`}
	>
		<defs>
			<filter
				id="{id}-intro-distortion"
				x="-10%"
				y="-10%"
				width="120%"
				height="120%"
				color-interpolation-filters="sRGB"
			>
				<feTurbulence
					type="fractalNoise"
					baseFrequency="0.014 0.15"
					numOctaves="1"
					seed="7"
					result="noise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="15"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
		</defs>
		<g class="main-mark">
			<path
				id="{id}-ring"
				class="ring"
				fill-rule="evenodd"
				d="M 256.058 0 C 114.679 0 0 114.602 0 256.019 C 0 397.398 114.679 512 256.058 512 C 397.398 512 512.039 397.398 512.039 256.019 C 512.039 114.602 397.398 0 256.058 0 Z M 256.058 477.998 C 133.419 477.998 34.002 378.581 34.002 256.019 C 34.002 133.38 133.419 34.002 256.058 34.002 C 378.62 34.002 478.075 133.38 478.075 256.019 C 478.075 378.581 378.62 477.998 256.058 477.998 Z"
			/>
			<path
				id="{id}-symbol"
				class="symbol"
				d="M 335.731 196.129 C 312.857 219.004 308.916 253.585 323.83 280.555 L 275.686 328.699 L 275.686 228.547 C 305.284 220.008 326.96 192.768 326.96 160.427 C 326.96 121.248 295.199 89.487 256.019 89.487 C 216.84 89.487 185.079 121.248 185.079 160.427 C 185.079 192.768 206.755 220.008 236.391 228.547 L 236.391 328.699 L 188.247 280.555 C 203.123 253.585 199.182 219.004 176.308 196.129 C 148.604 168.426 103.706 168.426 76.002 196.129 C 48.298 223.833 48.298 268.77 76.002 296.474 C 98.876 319.348 133.458 323.289 160.389 308.375 L 236.391 384.377 L 236.391 455.858 L 275.686 455.858 L 275.686 384.377 L 351.65 308.375 C 378.62 323.289 413.201 319.348 436.075 296.474 C 463.779 268.77 463.779 223.833 436.075 196.129 C 408.371 168.426 363.435 168.426 335.731 196.129 Z"
			/>
		</g>
		<g class="tear" aria-hidden="true">
			<use href="#{id}-ring" />
			<use href="#{id}-symbol" />
		</g>
		<path
			class="ring-trace"
			pathLength="1"
			d="M 256.058 0 C 114.679 0 0 114.602 0 256.019 C 0 397.398 114.679 512 256.058 512 C 397.398 512 512.039 397.398 512.039 256.019 C 512.039 114.602 397.398 0 256.058 0 Z M 256.058 477.998 C 133.419 477.998 34.002 378.581 34.002 256.019 C 34.002 133.38 133.419 34.002 256.058 34.002 C 378.62 34.002 478.075 133.38 478.075 256.019 C 478.075 378.581 378.62 477.998 256.058 477.998 Z"
		/>
	</svg>
</div>

<style>
	.intro-shell {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		background: #09090d;
	}
	.intro-logo {
		width: clamp(120px, 28vmin, 240px);
		height: auto;
		overflow: visible;
		color: #f4f2f0;
	}
	.ring,
	.symbol {
		fill: currentColor;
		transform-origin: 256px 256px;
	}
	.ring {
		opacity: 0;
		animation: ring-appear 1.1s cubic-bezier(0.16, 0.8, 0.25, 1) 0.14s forwards;
	}
	.symbol {
		opacity: 0;
		clip-path: inset(100% 0 0 0);
		animation: symbol-reveal 0.9s cubic-bezier(0.18, 0.82, 0.2, 1) 0.65s forwards;
	}
	.main-mark {
		animation: crt-break 0.5s steps(1, end) 1.52s both;
	}
	.tear {
		fill: currentColor;
		opacity: 0;
		pointer-events: none;
		animation: crt-tear 0.5s steps(1, end) 1.52s both;
	}
	.ring-trace {
		fill: none;
		stroke: currentColor;
		stroke-width: 3.5;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation:
			trace 1.18s ease-in-out forwards,
			trace-fade 0.4s ease 1.13s forwards;
	}
	@keyframes trace {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes trace-fade {
		to {
			opacity: 0;
		}
	}
	@keyframes ring-appear {
		0% {
			opacity: 0;
			transform: scale(0.965);
		}
		75% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}
	@keyframes symbol-reveal {
		0% {
			opacity: 0;
			clip-path: inset(100% 0 0 0);
			transform: translateY(10px);
		}
		100% {
			opacity: 1;
			clip-path: inset(0 0 0 0);
			transform: translateY(0);
		}
	}
	@keyframes crt-break {
		0%,
		18%,
		35%,
		55%,
		78%,
		100% {
			filter: none;
			transform: translateX(0);
		}
		10% {
			filter: var(--intro-distortion);
			transform: translateX(-2px);
		}
		27% {
			filter: var(--intro-distortion);
			transform: translateX(2px);
		}
		63% {
			filter: var(--intro-distortion);
			transform: translateX(-1px);
		}
	}
	@keyframes crt-tear {
		0%,
		12%,
		25%,
		42%,
		60%,
		80%,
		100% {
			opacity: 0;
			transform: translateX(0);
			clip-path: inset(0 0 0 0);
		}
		14% {
			opacity: 0.85;
			transform: translateX(8px);
			clip-path: inset(30% 0 63% 0);
		}
		46% {
			opacity: 0.85;
			transform: translateX(-7px);
			clip-path: inset(63% 0 31% 0);
		}
		70% {
			opacity: 0.85;
			transform: translateX(6px);
			clip-path: inset(43% 0 51% 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ring,
		.symbol,
		.main-mark {
			animation: none;
			opacity: 1;
			transform: none;
			clip-path: none;
			filter: none;
		}
		.ring-trace {
			display: none;
		}
		.tear {
			display: none;
		}
	}
</style>
