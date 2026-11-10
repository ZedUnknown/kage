<script lang="ts">
	import ConfirmationPopup from './ConfirmationPopup.svelte';
	import Trash from '../icons/Trash.svelte';
	let {
		label = 'Delete',
		title,
		message,
		disabled = false,
		onconfirm
	}: {
		label?: string;
		title: string;
		message: string;
		disabled?: boolean;
		onconfirm: (toasterId: string) => Promise<boolean | void>;
	} = $props();
	let open = $state(false);
</script>

<button
	type="button"
	class="delete-button"
	class:icon-only={!label}
	{disabled}
	aria-label={label || title}
	title={label || title}
	aria-haspopup="dialog"
	onclick={() => (open = true)}
>
	<span aria-hidden="true"><Trash properties="size-4" /></span>{label}
</button>
{#if open}
	<ConfirmationPopup
		{title}
		{message}
		submitMessage={label || 'Delete'}
		onSubmit={onconfirm}
		onCloseTrigger={() => (open = false)}
	/>
{/if}

<style>
	button.delete-button {
		min-height: 36px;
		padding: 8px 12px;
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
		border-color: var(--accent-border);
		color: var(--accent-soft);
	}
	button.delete-button.icon-only {
		width: 36px;
		padding: 8px;
	}
	button.delete-button:hover:not(:disabled) {
		background: var(--action-hover);
		border-color: var(--accent);
		color: #fff;
		box-shadow: 0 0 0 3px var(--accent-halo);
	}
	button.delete-button:active:not(:disabled) {
		background: var(--action);
		box-shadow: none;
	}
</style>
