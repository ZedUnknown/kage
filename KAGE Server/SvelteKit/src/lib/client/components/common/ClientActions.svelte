<script lang="ts">
	import { tick } from 'svelte';
	import ConfirmationPopup from './ConfirmationPopup.svelte';

	let {
		device,
		disabled,
		onaction
	}: {
		device: { id: string; name: string; pc_id: string };
		disabled: boolean;
		onaction: (resource: string, body: object, toasterId?: string) => Promise<boolean | void>;
	} = $props();

	let open = $state(false);
	let selected = $state<'rotate' | 'revoke' | 'delete' | null>(null);
	let container: HTMLDivElement;
	let trigger: HTMLButtonElement;
	const id = $props.id();
	const labels = { rotate: 'Rotate token', revoke: 'Revoke in KAGE', delete: 'Delete client' };
	const messages = {
		rotate: 'This replaces the token saved in KAGE and resets provisioning confirmation. Save the new token, update it on your external broker and in Client setup, then confirm provisioning again. Disconnect old broker sessions separately.',
		revoke: 'This marks the client credentials as revoked in KAGE, blocking new enrollment and commands. Revoke the credentials on your external broker and disconnect existing sessions separately.',
		delete: 'This permanently removes the client, its KAGE credentials and Chair Node mapping. The node stays paired. Queued commands are cancelled. Commands already sent may still execute. Remove the MQTT account on your external broker and disconnect its sessions separately.'
	};

	async function toggle() {
		open = !open;
		if (open) {
			await tick();
			container.querySelector<HTMLButtonElement>('.client-action-options button')?.focus();
		}
	}

	function closeMenu() {
		open = false;
		trigger.focus();
	}
</script>

<svelte:window
	onclick={(event) => {
		if (open && !container.contains(event.target as Node)) open = false;
	}}
	onkeydown={(event) => {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			closeMenu();
		}
	}}
/>
<div class="client-actions" bind:this={container}>
	<button
		bind:this={trigger}
		type="button"
		class="icon-button"
		aria-label={`Actions for ${device.name} (${device.pc_id})`}
		aria-expanded={open}
		aria-controls={id}
		{disabled}
		onclick={toggle}
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle
				cx="19"
				cy="12"
				r="2"
			/>
		</svg>
	</button>
	{#if open}
		<div
			{id}
			class="client-action-options"
			role="group"
			aria-label="Client actions"
			onfocusout={(event) => {
				if (event.relatedTarget && !container.contains(event.relatedTarget as Node)) open = false;
			}}
		>
			{#each ['rotate', 'revoke', 'delete'] as operation (operation)}
				{@const kind = operation as keyof typeof labels}
				<button
					type="button"
					class:danger={kind !== 'rotate'}
					{disabled}
					onclick={() => {
						selected = kind;
						open = false;
					}}
				>
					{labels[kind]}
				</button>
			{/each}
		</div>
	{/if}
</div>
{#if selected}
	<ConfirmationPopup
		title={`${labels[selected]} for ${device.name} (${device.pc_id})?`}
		message={messages[selected]}
		submitMessage={labels[selected]}
		onSubmit={(toasterId) => onaction('clients', { action: selected, id: device.id }, toasterId)}
		onCloseTrigger={() => {
			selected = null;
			trigger.focus();
		}}
	/>
{/if}

<style>
	.client-actions {
		position: relative;
		flex-shrink: 0;
	}
	.client-action-options {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 20;
		display: grid;
		gap: 4px;
		width: 200px;
		padding: 6px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--surface-raised);
		box-shadow: 0 10px 30px #0006;
	}
	.client-action-options button {
		justify-content: flex-start;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		background: transparent;
		color: var(--text);
		font-weight: 400;
		text-align: left;
	}
	.client-action-options button:hover:not(:disabled) {
		background: var(--surface-selected);
	}
	.client-action-options button.danger {
		color: var(--accent-soft);
	}
</style>
