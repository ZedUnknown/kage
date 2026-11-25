<script lang="ts">
	import { page } from '$app/state';
	import { provisioningRequest, saveProvisioningFile } from '#lib/client/provisioning.ts';

	let busy = $state(false);
	let downloaded = $state(false);
	let error = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || downloaded) return;
		busy = true;
		error = '';
		try {
			const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
			await saveProvisioningFile(
				await provisioningRequest(`/api/device-setup/${page.params.id}`, data)
			);
			downloaded = true;
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Download failed.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>KAGE - Device setup download</title></svelte:head>
<main>
	<section class="panel">
		<h1>Download your KAGE setup file</h1>
		{#if downloaded}
			<p role="status">Setup file downloaded. Open it in your Hub or Windows Client setup.</p>
		{:else}
			<p>Enter the temporary credentials from your administrator. This link can be used once.</p>
			<form onsubmit={submit}>
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
				<button disabled={busy}>{busy ? 'Downloading…' : 'Download setup file'}</button>
				{#if error}<p role="alert">{error}</p>{/if}
			</form>
		{/if}
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
		width: min(100%, 460px);
		padding: 26px;
	}
	h1 {
		margin-top: 0;
	}
	form {
		margin-top: 20px;
	}
</style>
