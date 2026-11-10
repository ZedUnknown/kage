<script lang="ts">
	import { onMount } from 'svelte';
	import { Toaster, toast } from 'svelte-sonner';
	import XCircle from '../../icons/XCircle.svelte';
	import SensitiveInput from '../SensitiveInput.svelte';
	import SearchDropDown from '../SearchDropDown.svelte';

	let {
		kind,
		brokers,
		hubs,
		busy,
		oncreate,
		onclose
	}: {
		kind: 'brokers' | 'hubs' | 'clients';
		brokers: { id: string; name: string }[];
		hubs: { id: string; hub_id: string }[];
		busy: boolean;
		oncreate: (
			resource: string,
			body: object,
			errorToasterId?: string
		) => Promise<boolean | undefined>;
		onclose: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	const toasterId = $props.id();
	let backdropPressed = false;
	let clientUsername = $state('');
	let deviceToken = $state('');
	const title = $derived(
		kind === 'brokers' ? 'Add broker' : kind === 'hubs' ? 'Register hub' : 'Register client'
	);
	const missingDependency = $derived(
		kind === 'hubs' && !brokers.length
			? 'Add a broker under Brokers before registering a hub.'
			: kind === 'clients' && !hubs.length
				? 'Register a hub under Hubs before registering a client.'
				: ''
	);

	onMount(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialog.showModal();
		dialog.querySelector('input')?.focus();
		const dependencyToast = missingDependency
			? toast.warning(missingDependency, { toasterId, duration: Number.POSITIVE_INFINITY })
			: undefined;

		return () => {
			if (dependencyToast !== undefined) toast.dismiss(dependencyToast);

			dialog.close();
			document.body.style.overflow = previousOverflow;
		};
	});

	function close() {
		if (!busy) dialog.close();
	}

	function outside(event: PointerEvent) {
		const bounds = dialog.getBoundingClientRect();

		return (
			event.target === dialog &&
			(event.clientX < bounds.left ||
				event.clientX > bounds.right ||
				event.clientY < bounds.top ||
				event.clientY > bounds.bottom)
		);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || missingDependency) return;

		const fields = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));

		if (kind === 'clients' && Boolean(fields.username) !== Boolean(fields.token)) {
			toast.error(
				'Provide both the MQTT username and token, or leave both blank to generate credentials.',
				{
					toasterId
				}
			);

			return;
		}

		const saved = await oncreate(
			kind,
			{
				...fields,
				action: 'create',
				...(kind === 'brokers' ? { tls: true } : {})
			},
			toasterId
		);

		if (saved) dialog.close();
	}
</script>

<dialog
	bind:this={dialog}
	class="registration-drawer"
	aria-labelledby="registration-title"
	aria-describedby="registration-description"
	{onclose}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
	onpointerdown={(event) => (backdropPressed = outside(event))}
	onpointerup={(event) => {
		if (backdropPressed && outside(event)) close();
		backdropPressed = false;
	}}
>
	<header class="drawer-header">
		<div>
			<p class="eyebrow">Workspace setup</p>
			<h2 id="registration-title">{title}</h2>
		</div>
		<button
			type="button"
			class="icon-button"
			aria-label="Close registration"
			disabled={busy}
			onclick={close}
		>
			<XCircle properties="size-5" />
		</button>
	</header>
	<form onsubmit={submit} aria-busy={busy}>
		<div class="drawer-content">
			<p id="registration-description" class="muted">
				{kind === 'brokers'
					? 'Connect your MQTT broker using its server credentials.'
					: 'Register your device, then configure its connection to your broker.'}
			</p>
			<fieldset disabled={busy}>
				{#if kind === 'brokers'}
					<label>Broker name<input name="name" required placeholder="Laboratory MQTT" /></label>
					<label>Hostname<input name="hostname" required placeholder="mqtt.example.com" /></label>
					<label>TLS port<input
							name="port"
							type="number"
							value="8883"
							min="1"
							max="65535"
							required
						/>
					</label>
					<label>Server MQTT username<input name="username" required autocomplete="off" /></label>
					<div class="form-field">
						<label for="broker-password">Server MQTT password</label><SensitiveInput
							id="broker-password"
							name="password"
							type="password"
							required
							autocomplete="new-password"
						/>
					</div>
					<label>Custom CA certificate (optional)<textarea
							name="ca_certificate"
							rows="3"
							placeholder="PEM-encoded CA certificate"
						></textarea>
					</label>
				{:else}
					<label>Display name<input name="name" required /></label>
					{#if kind === 'hubs'}
						<label>Hub ID / MQTT username<input
								name="hub_id"
								pattern="[A-Za-z0-9_-]+"
								maxlength="64"
								placeholder="HUB-01"
								required
							/>
						</label>
						<div class="form-field">
							<label for="registration-broker">Broker</label>
							<SearchDropDown
								id="registration-broker"
								name="broker_id"
								label="Broker"
								placeholder="Select broker"
								required
								disabled={busy}
								items={brokers.map((broker) => ({ value: broker.id, label: broker.name }))}
							/>
						</div>
					{:else}
						<label>Client ID<input
								name="pc_id"
								pattern="[A-Za-z0-9_-]+"
								maxlength="64"
								placeholder="PC-01"
								required
							/>
						</label>
						<div class="form-field">
							<label for="registration-hub">Hub</label>
							<SearchDropDown
								id="registration-hub"
								name="hub_id"
								label="Hub"
								placeholder="Select hub"
								required
								disabled={busy}
								items={hubs.map((hub) => ({ value: hub.id, label: hub.hub_id }))}
							/>
						</div>
						<label>Existing broker username (optional)<input
								name="username"
								bind:value={clientUsername}
								pattern="[A-Za-z0-9_-]+"
								maxlength="64"
								required={!!deviceToken}
								aria-describedby="client-credentials-help"
							/>
						</label>
						<p id="client-credentials-help" class="muted">
							Provide both the MQTT username and token, or leave both blank to generate credentials.
						</p>
					{/if}
					<div class="form-field">
						<label for="broker-token">Existing broker token (optional)</label><SensitiveInput
							id="broker-token"
							name="token"
							bind:value={deviceToken}
							type="password"
							autocomplete="new-password"
							required={kind === 'clients' && !!clientUsername}
							aria-describedby={kind === 'clients' ? 'client-credentials-help' : undefined}
							placeholder="Leave blank to generate securely"
						/>
					</div>
					<p class="muted">
						Generated credentials must be created on your external broker. Hub usernames must match
						the Hub ID. Registration here does not complete device setup.
					</p>
				{/if}
			</fieldset>
		</div>
		<footer class="drawer-footer">
			<button type="button" class="secondary" disabled={busy} onclick={close}>Cancel</button>
			<button type="submit" disabled={busy || !!missingDependency}>{busy ? 'Saving...' : title}</button>
		</footer>
	</form>
	<Toaster id={toasterId} theme="dark" position="top-right" richColors closeButton />
</dialog>

<style>
	.registration-drawer {
		position: fixed;
		inset: 0 0 0 auto;
		width: min(520px, 100%);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: 0;
		border-left: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		box-shadow: -16px 0 48px #0005;
	}
	.registration-drawer[open] {
		display: flex;
		flex-direction: column;
	}
	.registration-drawer::backdrop {
		background: #0008;
	}
	.drawer-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 24px;
		border-bottom: 1px solid var(--line);
	}
	.drawer-header .eyebrow {
		margin-bottom: 6px;
	}
	.drawer-header h2 {
		margin: 0;
		font-size: 23px;
	}
	form {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0;
		min-height: 0;
	}
	.drawer-content {
		flex: 1;
		padding: 24px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	fieldset {
		display: grid;
		gap: 18px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.drawer-footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 18px 24px max(18px, env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
	}
	@media (max-width: 800px) {
		.registration-drawer {
			width: 100%;
			border-left: 0;
		}
		.drawer-header,
		.drawer-content {
			padding: 20px 18px;
		}
		.drawer-footer {
			padding-inline: 18px;
		}
	}
</style>
