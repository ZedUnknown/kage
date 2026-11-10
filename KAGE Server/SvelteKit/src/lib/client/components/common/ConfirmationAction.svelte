<script lang="ts">
	import ConfirmationPopup from './ConfirmationPopup.svelte';

	let {
		label,
		title,
		message,
		danger = false,
		disabled = false,
		onconfirm
	}: {
		label: string;
		title: string;
		message: string;
		danger?: boolean;
		disabled?: boolean;
		onconfirm: (toasterId: string) => Promise<boolean | void>;
	} = $props();

	let open = $state(false);
</script>

<button
	type="button"
	class="confirmation-button secondary"
	class:danger
	{disabled}
	aria-haspopup="dialog"
	onclick={() => (open = true)}
>
	{label}
</button>
{#if open}
	<ConfirmationPopup
		{title}
		{message}
		submitMessage={label}
		onSubmit={onconfirm}
		onCloseTrigger={() => (open = false)}
	/>
{/if}
