<script lang="ts">
	import { page } from '$app/state';
	import { provisioningRequest, saveProvisioningFile } from '#lib/client/provisioning.ts';

	type FileItem = { id: string; name: string; code: string; kind: 'hub' | 'client' };
	let portal = $state<{ name: string; files: FileItem[] }>();
	let credentials: { username: string; password: string } | undefined;
	let selected = $state('');
	let busy = $state(false);
	let error = $state('');
	let status = $state('');

	function request(data: object) {
		return provisioningRequest(`/api/provisioning/${page.params.id}`, data);
	}

	async function openPortal(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const form = new FormData(event.currentTarget as HTMLFormElement);
			const login = {
				username: String(form.get('username')),
				password: String(form.get('password'))
			};
			const opened = (await (await request({ action: 'list', ...login })).json()) as NonNullable<
				typeof portal
			>;
			const requested = page.url.searchParams.get('file');
			selected =
				opened.files.find((file) => file.id === requested)?.id ?? opened.files[0]?.id ?? '';
			credentials = login;
			portal = opened;
		} catch (failure) {
			error =
				failure instanceof Error ? failure.message : 'Could not open the provisioning portal.';
		} finally {
			busy = false;
		}
	}

	async function download(file: FileItem) {
		if (busy || !portal || !credentials) return;
		busy = true;
		error = '';
		status = '';
		try {
			await saveProvisioningFile(
				await request({ action: 'download', file: file.id, ...credentials })
			);
			portal.files = portal.files.filter((item) => item.id !== file.id);
			selected = portal.files[0]?.id ?? '';
			status = `Setup file downloaded for ${file.code}.`;
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Download failed.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>KAGE - Provisioning portal</title></svelte:head>

<main>
	<section class="panel">
		<h1>{portal ? portal.name : 'Provisioning portal'}</h1>
		{#if portal}
			<p>
				Choose a device to download its setup file. Each file can be downloaded once from this link.
			</p>
			<ul aria-label="Available setup files">
				{#each portal.files as file (file.id)}
					<li class:highlighted={selected === file.id}>
						<div>
							<strong>{file.name}</strong>
							<span>{file.kind === 'hub' ? 'Hub' : 'Windows Client'} · {file.code}</span>
						</div>
						<button
							type="button"
							class:secondary={selected !== file.id}
							aria-label={`Download setup file for ${file.code}`}
							disabled={busy}
							onclick={() => download(file)}>Download</button
						>
					</li>
				{:else}
					<li>No setup files remain on this link.</li>
				{/each}
			</ul>
			{#if status}<p role="status">{status}</p>{/if}
		{:else}
			<p>Enter the temporary credentials from your administrator.</p>
			<form onsubmit={openPortal}>
				<label
					>Temporary username <input
						name="username"
						autocomplete="username"
						maxlength="64"
						required
					/></label
				>
				<label
					>Temporary password <input
						name="password"
						type="password"
						autocomplete="current-password"
						maxlength="64"
						required
					/></label
				>
				<button disabled={busy}>{busy ? 'Opening…' : 'Open portal'}</button>
			</form>
		{/if}
		{#if error}<p role="alert">{error}</p>{/if}
	</section>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 20px;
	}
	section {
		width: min(100%, 550px);
		padding: 26px;
	}
	h1 {
		margin-top: 0;
	}
	form,
	ul {
		margin-top: 20px;
	}
	ul {
		display: grid;
		gap: 8px;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 16px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
		overflow-wrap: anywhere;
	}
	li span {
		display: block;
		color: var(--muted);
		font-size: 12px;
	}
	.highlighted {
		border-color: var(--accent-border);
		background: var(--accent-dim);
	}
</style>
