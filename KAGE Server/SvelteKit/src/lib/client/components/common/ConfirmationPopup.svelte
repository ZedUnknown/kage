<script lang="ts">
	import { onMount } from 'svelte';
	import { Toaster } from 'svelte-sonner';

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
	let cancelButton: HTMLButtonElement;
	let busy = $state(false);
	const id = $props.id();

	onMount(() => {
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialog.showModal();
		cancelButton.focus();

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
	bind:this={dialog}
	aria-labelledby={`${id}-title`}
	aria-describedby={`${id}-message`}
	aria-busy={busy}
	onclose={onCloseTrigger}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<h2 id={`${id}-title`}>{title}</h2>
	<p id={`${id}-message`}>{message}</p>
	<div class="actions">
		<button
			bind:this={cancelButton}
			type="button"
			class="secondary"
			disabled={busy}
			onclick={() => dialog.close()}
		>
			Cancel
		</button>
		<button type="button" disabled={busy} onclick={confirm}>
			<span aria-hidden="true">Yes</span>{busy
				? 'Working...'
				: '"' + submitMessage + '"'}
		</button>
	</div>
	<Toaster {id} theme="dark" richColors closeButton />
</dialog>

<style>
	dialog {
		position: fixed;
		inset: 0;
		margin: auto;
		width: min(480px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		overflow: auto;
		padding: 24px;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 24px 80px #0008;
	}
	dialog::backdrop {
		background: #0009;
		backdrop-filter: blur(4px);
	}
	h2 {
		font-size: 20px;
		margin-bottom: 12px;
	}
	p {
		color: var(--text-secondary);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.actions {
		justify-content: flex-end;
		margin-top: 24px;
	}
</style>
