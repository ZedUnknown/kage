<script lang="ts">
	import { tick } from 'svelte';
	import { provisioningRequest, saveProvisioningFile } from '#lib/client/provisioning.ts';
	import CheckBox from './CheckBox.svelte';
	import DialogHeader from './DialogHeader.svelte';
	import DropDown from './DropDown.svelte';
	import DownloadSimple from '../icons/DownloadSimple.svelte';
	import Gear from '../icons/Gear.svelte';

	let { brokerId, brokerName }: { brokerId: string; brokerName: string } = $props();
	let dialog: HTMLDialogElement;
	let mappingDialog: HTMLDialogElement;
	let busy = $state(false);
	let error = $state('');
	let includeServer = $state(false);

	const formats = {
		authentication: {
			name: 'Authentication',
			description: 'MQTT logins for pending devices.',
			downloadLabel: 'Export authentication',
			fields: ['username', 'password']
		},
		authorization: {
			name: 'Topics',
			description: 'Permissions for the server and all non-revoked devices.',
			downloadLabel: 'Export topics',
			fields: ['username', 'topic', 'action', 'access']
		}
	};
	type Format = keyof typeof formats;
	let mappingKind = $state<Format>('authentication');
	let mappingTitle = $derived(`${formats[mappingKind].name} CSV columns`);
	let mappingFields = $derived(
		formats[mappingKind].fields.map((field) => ({ value: field, label: field }))
	);
	let columns = $state({
		authentication: formats.authentication.fields.map((field) => ({ field, header: field })),
		authorization: formats.authorization.fields.map((field) => ({ field, header: field }))
	});

	async function openMapping(kind: Format) {
		mappingKind = kind;
		await tick();
		mappingDialog.showModal();
	}

	function moveColumn(index: number, field: string) {
		const current = columns[mappingKind];
		const previousIndex = current.findIndex((column) => column.field === field);
		if (previousIndex < 0 || previousIndex === index) return;
		[current[index], current[previousIndex]] = [current[previousIndex], current[index]];
	}

	async function download(kind: Format) {
		busy = true;
		error = '';
		try {
			await saveProvisioningFile(
				await provisioningRequest('/api/admin/provisioning', {
					id: brokerId,
					action: `export_${kind}`,
					columns: columns[kind],
					include_server: includeServer
				})
			);
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Export failed.';
		} finally {
			busy = false;
		}
	}
</script>

<button
	class="secondary export-trigger"
	type="button"
	aria-label="Export credentials"
	aria-haspopup="dialog"
	onclick={() => dialog.showModal()}
>
	<span class="export-label-full">Export credentials</span>
	<span class="export-label-short" aria-hidden="true">Export</span>
</button>
<dialog
	class="modal-dialog"
	bind:this={dialog}
	aria-label={`Export broker credentials for ${brokerName}`}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	<DialogHeader title="Export broker credentials" onclose={() => dialog.close()} {busy} />
	<p class="export-broker-name">{brokerName}</p>
	<p class="dialog-description">
		Import these files into Authentication and Authorization in EMQX.
	</p>
	{#each Object.entries(formats) as [type, format] (type)}
		{@const kind = type as Format}
		<section class="export-format" aria-label={format.name}>
			<div class="format-heading">
				<div>
					<h3>{format.name}</h3>
					<p>{format.description}</p>
				</div>
				<button
					type="button"
					class="map-trigger"
					aria-haspopup="dialog"
					aria-label={`Map ${format.name.toLowerCase()} CSV columns`}
					disabled={busy}
					onclick={() => openMapping(kind)}
				>
					<span aria-hidden="true"><Gear properties="size-4" /></span>
					Map CSV columns
				</button>
			</div>
			{#if kind === 'authentication'}
				<CheckBox bind:checked={includeServer} disabled={busy}>
					<span>Include the server login in authentication</span>
				</CheckBox>
			{/if}
			<button
				type="button"
				class="secondary export-download"
				disabled={busy}
				onclick={() => download(kind)}
			>
				<span aria-hidden="true"><DownloadSimple properties="size-4" /></span>
				{format.downloadLabel}
			</button>
		</section>
	{/each}
	{#if error}<p class="export-error" role="alert">{error}</p>{/if}
</dialog>

<dialog class="modal-dialog mapping-dialog" bind:this={mappingDialog} aria-label={mappingTitle}>
	<DialogHeader title={mappingTitle} onclose={() => mappingDialog.close()} />
	<div class="mapping-columns">
		<span aria-hidden="true">Data field</span>
		<span aria-hidden="true">CSV header</span>
		{#each columns[mappingKind] as column, index (index)}
			<DropDown
				label={`Data field for column ${index + 1}`}
				items={mappingFields}
				value={column.field}
				onchange={(field) => moveColumn(index, field)}
				controlled
				required
			/>
			<input
				type="text"
				aria-label={`CSV header for column ${index + 1}`}
				bind:value={column.header}
				maxlength="64"
			/>
		{/each}
	</div>
</dialog>

<style>
	.export-trigger {
		margin-inline-start: auto;
	}
	dialog {
		--dialog-width: 560px;
		max-height: 88dvh;
		border-radius: 12px;
	}
	.format-heading h3 {
		margin: 0;
	}
	.export-broker-name {
		margin: 8px 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.dialog-description,
	.format-heading p {
		margin: 0;
		color: var(--muted);
	}
	.export-format {
		display: grid;
		justify-items: start;
		gap: 14px;
		margin-top: 20px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.format-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px 16px;
		flex-wrap: wrap;
		width: 100%;
	}
	.format-heading p {
		font-size: 13px;
	}
	.map-trigger {
		min-height: 28px;
		gap: 6px;
		padding: 4px 6px;
		background: transparent;
		color: var(--text-secondary);
		font-size: 12px;
	}
	.map-trigger:hover:not(:disabled) {
		background: var(--surface-raised);
		color: var(--text);
	}
	.export-download {
		justify-self: end;
	}
	.export-error {
		margin-top: 12px;
		color: var(--accent-soft);
	}
	.mapping-dialog {
		--dialog-width: 460px;
	}
	.mapping-columns {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 12px;
		margin-top: 16px;
	}
	.mapping-columns > span {
		color: var(--muted);
		font-size: 12px;
	}
	.mapping-columns > input {
		border-color: transparent;
		background: var(--surface-raised);
	}
	.mapping-columns > input:focus {
		border-color: var(--accent);
	}
</style>
