<script lang="ts">
	import CaretDown from '../icons/CaretDown.svelte';
	import Info from '../icons/Info.svelte';

	let { label }: { label: string } = $props();
</script>

<summary>
	<span class="label"><span aria-hidden="true"><Info properties="size-4" /></span>{label}</span>
	<span class="chevron" aria-hidden="true"><CaretDown properties="size-4" /></span>
</summary>

<style>
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 0;
		padding: 14px 16px;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.label {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.label > span,
	.chevron {
		display: inline-flex;
		flex-shrink: 0;
	}
	.chevron {
		transition: transform 180ms ease;
	}
	:global(details[open]) > summary .chevron {
		transform: rotate(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
