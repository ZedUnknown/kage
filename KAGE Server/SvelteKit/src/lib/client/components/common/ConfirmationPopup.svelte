<script lang="ts">
	import { onMount } from 'svelte';
	import { Toaster } from 'svelte-sonner';
	import DialogHeader from './DialogHeader.svelte';

	let {
		title,
		message,
		submitMessage,
		onSubmit,
		onCloseTrigger
	}: {
		title: string;
		message: string;
		submitMessage: string;
		onSubmit: (toasterId: string) => Promise<boolean | void>;
		onCloseTrigger: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let busy = $state(false);
	const id = $props.id();

	onMount(() => {
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialog.showModal();

		return () => {
			dialog.close();
			document.body.style.overflow = overflow;
		};
	});

	async function confirm() {
		if (busy) return;

		busy = true;

		try {
			if ((await onSubmit(id)) !== false) dialog.close();
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	class="modal-dialog"
	bind:this={dialog}
	aria-labelledby={`${id}-title`}
	aria-describedby={`${id}-message`}
	aria-busy={busy}
	onclose={onCloseTrigger}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<DialogHeader {title} id={`${id}-title`} {busy} onclose={() => dialog.close()} />
	<p id={`${id}-message`}>{message}</p>
	<div class="actions">
		<button type="button" disabled={busy} onclick={confirm}>
			<span aria-hidden="true">Yes</span>{busy ? 'Working...' : '"' + submitMessage + '"'}
		</button>
	</div>
	<Toaster {id} theme="dark" richColors closeButton />
</dialog>

<style>
	dialog {
		--dialog-width: 480px;
	}
	p {
		margin-top: 12px;
		color: var(--text-secondary);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.actions {
		justify-content: flex-end;
		margin-top: 24px;
	}
</style>
