<script lang="ts">
	import CaretLeft from '../icons/CaretLeft.svelte';
	let {
		title = 'Go back',
		description = '',
		separate = false,
		onClick,
		__class__arrow = 'size-4',
		__class__arrow_container = '',
		__class__title = '',
		__class__description = '',
		__class__content = '',
		__class__button = 'link-button',
		__class__container = ''
	}: {
		title?: string;
		description?: string;
		separate?: boolean;
		onClick?: () => void;
		__class__arrow?: string;
		__class__arrow_container?: string;
		__class__title?: string;
		__class__description?: string;
		__class__content?: string;
		__class__button?: string;
		__class__container?: string;
	} = $props();
</script>

<div class="go-back {__class__container}">
	<button
		type="button"
		class={__class__button}
		aria-label={title}
		onclick={() => (onClick ? onClick() : history.back())}
	>
		<span class={__class__arrow_container} aria-hidden="true"
			><CaretLeft properties={__class__arrow} /></span
		>
		{#if !separate}
			<span class={__class__content}
				><span class={__class__title}>{title}</span>{#if description}<small
						class={__class__description}>{description}</small
					>{/if}</span
			>
		{/if}
	</button>
	{#if separate}<div class={__class__content}>
			<span class={__class__title}>{title}</span>{#if description}<small
					class={__class__description}>{description}</small
				>{/if}
		</div>{/if}
</div>

<style>
	.go-back {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	small {
		display: block;
		color: var(--muted);
	}
</style>
