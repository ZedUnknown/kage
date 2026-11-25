<script lang="ts">
	import { provisioningRequest, saveProvisioningFile } from '#lib/client/provisioning.ts';
	import DialogHeader from './DialogHeader.svelte';
	import DropDown from './DropDown.svelte';

	let { hubId }: { hubId: string } = $props();
	const deviceId = $props.id();
	type FileItem = { id: string; client_id: string | null; name: string; code: string };
	let dialog: HTMLDialogElement;
	let files = $state<FileItem[]>([]);
	let selectedId = $state('');
	let selected = $derived(files.find((file) => file.id === selectedId));
	let busy = $state(false);
	let error = $state('');
	let password = $state('');
	let shared = $state<{ url: string; username: string; password: string; file_count: number }>();
	let sharedTitle = $state('');

	async function run(
		action: 'portal_list' | 'download' | 'share_hub' | 'share_device' | 'password'
	) {
		const file = selected;
		if (busy || (['download', 'share_device', 'password'].includes(action) && !file)) return;
		busy = true;
		error = '';
		if (action === 'share_hub' || action === 'share_device') shared = undefined;
		try {
			const data =
				action === 'portal_list'
					? { action, id: hubId }
					: action === 'share_hub' || action === 'share_device'
						? {
								action: 'portal_share',
								id: hubId,
								...(action === 'share_device' ? { file: file?.id } : {})
							}
						: { action, id: file?.client_id ?? hubId, kind: file?.client_id ? 'client' : 'hub' };
			const result = await provisioningRequest('/api/admin/provisioning', data);
			if (action === 'download') await saveProvisioningFile(result);
			else if (action === 'portal_list') {
				files = (await result.json()).files;
				selectedId = files[0]?.id ?? '';
			} else if (action === 'share_hub' || action === 'share_device') {
				shared = await result.json();
				sharedTitle = action === 'share_hub' ? 'Installer link' : `Device link · ${file?.code}`;
			} else password = (await result.json()).password;
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Provisioning request failed.';
		} finally {
			busy = false;
		}
	}
</script>

<button
	class="secondary"
	type="button"
	aria-haspopup="dialog"
	onclick={() => {
		dialog.showModal();
		void run('portal_list');
	}}
>
	Open provisioning portal
</button>
<dialog
	class="modal-dialog"
	bind:this={dialog}
	aria-label="Provisioning portal"
	aria-busy={busy}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
	onclose={() => {
		files = [];
		selectedId = '';
		shared = undefined;
		password = '';
		error = '';
	}}
>
	<DialogHeader
		title="Provisioning portal"
		closeLabel="Close provisioning portal"
		{busy}
		onclose={() => dialog.close()}
	/>
	<div class="portal-content">
		{#if files.length}
			<section class="installer">
				<p>
					Grant an installer access to all {files.length} setup {files.length === 1
						? 'file'
						: 'files'}.
				</p>
				<button type="button" disabled={busy} onclick={() => run('share_hub')}
					>Create installer link</button
				>
			</section>
			<section class="device">
				<div class="form-field">
					<label for={deviceId}>Device</label>
					<DropDown
						id={deviceId}
						label="Device"
						items={files.map((file) => ({ value: file.id, label: `${file.name} · ${file.code}` }))}
						bind:value={selectedId}
						disabled={busy}
						required
						onchange={() => {
							password = '';
						}}
					/>
				</div>
				<div class="portal-actions">
					<button
						type="button"
						class="secondary"
						disabled={busy}
						onclick={() => run('share_device')}>Create device link</button
					>
					<button type="button" class="secondary" disabled={busy} onclick={() => run('download')}
						>Download setup file</button
					>
					{#if selected?.client_id}
						<button type="button" class="secondary" disabled={busy} onclick={() => run('password')}
							>Show provisioning password</button
						>
					{/if}
				</div>
				{#if password}
					<p class="credentials">Force provisioning password <code>{password}</code></p>
				{/if}
			</section>
		{:else if busy}
			<p role="status">Loading setup files…</p>
		{:else if !error}
			<p>No eligible setup files for this Hub.</p>
		{/if}
		{#if shared}
			<section class="credentials" aria-label={sharedTitle}>
				<h3>{sharedTitle}</h3>
				<p>
					Expires in 30 minutes. {shared.file_count === 1
						? 'The file can be downloaded once.'
						: `Each of the ${shared.file_count} files can be downloaded once.`}
				</p>
				<dl>
					<dt>Download URL</dt>
					<dd><a href={shared.url} target="_blank" rel="noreferrer">{shared.url}</a></dd>
					<dt>Temporary username</dt>
					<dd><code>{shared.username}</code></dd>
					<dt>Temporary password</dt>
					<dd><code>{shared.password}</code></dd>
				</dl>
			</section>
		{/if}
		{#if error}<p role="alert">{error}</p>{/if}
	</div>
</dialog>

<style>
	dialog {
		--dialog-width: 760px;
		padding: clamp(16px, 4vw, 24px);
	}
	.portal-content {
		display: grid;
		gap: 16px;
		margin-top: 18px;
	}
	.installer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px 16px;
	}
	.device {
		display: grid;
		gap: 12px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.portal-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	p {
		margin: 0;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}
	.credentials {
		display: grid;
		gap: 8px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--surface-deep);
	}
	h3 {
		margin: 0;
	}
	[role='alert'] {
		color: var(--accent-soft);
	}
	dl {
		display: grid;
		gap: 4px;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
		user-select: all;
	}
	code {
		user-select: all;
	}
	@media (max-width: 480px) {
		.portal-actions > button,
		.installer > button {
			width: 100%;
		}
	}
</style>
