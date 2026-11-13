<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { createPageActions, getWorkspace, type PageActions } from '../workspace.svelte.ts';
	import RegistrationDrawer from '../components/common/modals/RegistrationDrawer.svelte';
	import Plus from '../components/icons/Plus.svelte';
	import ClassicSidebar from '../components/icons/ClassicSidebar.svelte';
	import ArrowCounterClockwise from '../components/icons/ArrowCounterClockwise.svelte';
	import SensitiveInput from '../components/common/SensitiveInput.svelte';
	import Spinner from '../components/common/Spinner.svelte';

	let {
		title,
		description,
		registration,
		actions = createPageActions(),
		children
	}: {
		title: string;
		description: string;
		registration?: 'brokers' | 'hubs' | 'clients';
		actions?: PageActions;
		children: Snippet<[() => void]>;
	} = $props();

	const workspace = getWorkspace();

	let registrationOpen = $state(false);
	let credentialDelivery = $state<HTMLElement>();

	const delivery = $derived(workspace.deliveries[page.url.pathname]);
	const registrationLabel = $derived(
		registration === 'brokers'
			? 'Add broker'
			: registration === 'hubs'
				? 'Register hub'
				: 'Register client'
	);

	function openRegistration() {
		if (!registration) return;

		registrationOpen = true;
	}

	async function closeRegistration() {
		registrationOpen = false;
		await tick();
		if (delivery) credentialDelivery?.focus();
	}
</script>

<svelte:head><title>KAGE - {title}</title></svelte:head>
<header class="page-header">
	<div class="page-heading">
		<button
			type="button"
			class="icon-button mobile-only"
			aria-label="Open navigation"
			aria-expanded={workspace.mobileOpen}
			aria-controls="workspace-sidebar"
			onclick={workspace.openMobileMenu}
		>
			<ClassicSidebar properties="size-5" animationClass="" />
		</button>
		<h1>{title}</h1>
	</div>
	<div class="page-actions">
		<button
			type="button"
			class="secondary"
			disabled={workspace.refreshing}
			onclick={() => workspace.refresh(true)}
		>
			<span aria-hidden="true"
				>{#if workspace.refreshing}<Spinner />{:else}<ArrowCounterClockwise
						properties="size-4"
					/>{/if}</span
			>{workspace.refreshing ? 'Refreshing...' : 'Refresh'}
		</button>
		{#if registration}
			<button
				type="button"
				disabled={workspace.busy}
				aria-haspopup="dialog"
				onclick={openRegistration}
			>
				<span aria-hidden="true"><Plus properties="size-4" /></span>{registrationLabel}
			</button>
		{/if}
	</div>
	{#if description}<p class="page-description">{description}</p>{/if}
</header>
{#if delivery}
	<section
		class="credential-delivery"
		bind:this={credentialDelivery}
		tabindex="-1"
		aria-label="Save your device credentials"
	>
		<h2>Save your device credentials</h2>
		<p>This token is shown only now. Add it to your broker and configure the device.</p>
		<label>MQTT username<input readonly value={delivery.username} /></label>
		<div class="form-field">
			<label for="delivery-token">MQTT token</label><SensitiveInput
				id="delivery-token"
				type="password"
				readOnly
				value={delivery.token}
			/>
		</div>
		<button type="button" onclick={() => delete workspace.deliveries[page.url.pathname]}>
			I have saved these credentials
		</button>
	</section>
{/if}

{@render children(openRegistration)}

{#if registrationOpen && registration}
	<RegistrationDrawer
		kind={registration}
		brokers={workspace.overview.brokers}
		hubs={workspace.overview.hubs}
		busy={workspace.busy}
		oncreate={actions.action}
		onclose={closeRegistration}
	/>
{/if}

<style>
	.page-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		align-content: center;
		gap: 4px 16px;
		min-height: var(--workspace-header-height);
		padding: 4px var(--workspace-padding-inline);
		margin-inline: calc(-1 * var(--workspace-padding-inline));
		margin-bottom: 24px;
		border-bottom: 1px solid var(--line);
	}
	.page-heading h1 {
		font-size: 24px;
		letter-spacing: -0.5px;
	}
	.page-description {
		grid-column: 1;
		grid-row: 2;
		margin: 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.page-heading {
		grid-column: 1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.page-actions {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.credential-delivery {
		display: grid;
		gap: 12px;
		margin: 20px 0;
		padding: 24px;
		border: 1px solid var(--warning-border);
		border-radius: 12px;
		background: var(--warning-surface);
	}
	.credential-delivery h2 {
		margin-bottom: 8px;
		color: var(--warning);
	}
	@media (max-width: 800px) {
		.page-header {
			grid-template-columns: minmax(0, 1fr);
			padding-block: 16px;
		}
		.page-description {
			grid-row: 2;
		}
		.page-heading h1 {
			font-size: 22px;
		}
		.page-actions {
			grid-column: 1;
			grid-row: 3;
			flex-wrap: wrap;
			margin-top: 8px;
		}
	}
</style>
