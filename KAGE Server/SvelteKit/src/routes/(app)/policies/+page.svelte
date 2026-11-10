<script lang="ts">
	import { untrack } from 'svelte';
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import PolicyCard from '#lib/client/special/PolicyCard.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import DropDown from '#lib/client/components/common/DropDown.svelte';

	const workspace = getWorkspace();
	const policy = $derived(workspace.overview.policies[0] ?? {});
	const actions = createPageActions(workspace);
	// Keep the initial card order when saving or refreshing their contents.
	const initialOrder = untrack(() => {
		const saved = workspace.overview.policies[0] ?? {};
		const enabled = {
			automatic: saved.enabled !== false,
			extension: saved.allow_extension === true,
			offline: saved.offline_enabled === true,
			activity: saved.inactivity_monitoring_enabled === true
		};

		return (['automatic', 'extension', 'offline', 'activity'] as const).slice().sort((a, b) => Number(enabled[b]) - Number(enabled[a]));
	});
	const numeric = (value: unknown, fallback: number): number | undefined => Number(value ?? fallback);
	const fields = $derived({
		automatic: {
			action: String(policy.action ?? 'auto_lock'),
			delay_seconds: numeric(policy.delay_seconds, 60)
		},
		extension: {
			extension_duration_seconds: numeric(policy.extension_duration_seconds, 300),
			maximum_extensions: numeric(policy.maximum_extensions, 1)
		},
		offline: {
			client_disconnect_timeout_seconds: numeric(policy.client_disconnect_timeout_seconds, 60),
			offline_action: String(policy.offline_action ?? 'lock'),
			allow_recovery_code: policy.allow_recovery_code === true
		},
		activity: {
			inactivity_timeout_seconds: numeric(policy.inactivity_timeout_seconds, 300),
			confirmation_timeout_seconds: numeric(policy.confirmation_timeout_seconds, 30)
		}
	});
	const toggle = (section: string, value: boolean) =>
		actions.action('policies', { action: 'toggle', policy: section, value });
</script>

{#snippet automaticCard()}
	<PolicyCard
		id="automatic-policy"
		title="Automatic security policy"
		description="Choose the action and countdown for an unoccupied chair."
		fields={fields.automatic}
		enabled={policy.enabled !== false}
		busy={actions.busy}
		onsave={(values) => actions.action('policies', { ...values, policy: 'automatic' })}
		ontoggle={(value) => toggle('automatic', value)}
	>
		{#snippet children(draft, locked)}
			<div class="form-field">
				<label for="policy-action">Preferred action</label>
				<DropDown
					id="policy-action"
					name="action"
					label="Preferred action"
					bind:value={draft.action}
					required
					disabled={locked}
					items={[
						{ value: 'auto_lock', label: 'Automatic lock' },
						{ value: 'auto_logout', label: 'Automatic logout' }
					]}
				/>
			</div>
			<label class="form-field">Countdown (seconds)<input
					name="delay_seconds"
					type="number"
					min="10"
					max="3600"
					step="1"
					bind:value={draft.delay_seconds}
					required
					disabled={locked}
				/>
			</label>
		{/snippet}
	</PolicyCard>
{/snippet}

{#snippet extensionCard()}
	<PolicyCard
		id="extension-policy"
		title="Extension policy"
		description="Set the duration and number of countdown extensions."
		fields={fields.extension}
		enabled={policy.allow_extension === true}
		busy={actions.busy}
		onsave={(values) => actions.action('policies', { ...values, policy: 'extension' })}
		ontoggle={(value) => toggle('extension', value)}
	>
		{#snippet children(draft, locked)}
			<label class="form-field">Extension duration (seconds)<input
					name="extension_duration_seconds"
					type="number"
					min="10"
					max="3600"
					step="1"
					bind:value={draft.extension_duration_seconds}
					required
					disabled={locked}
				/>
			</label>
			<label class="form-field">Maximum extensions<input
					name="maximum_extensions"
					type="number"
					min="1"
					max="100"
					step="1"
					bind:value={draft.maximum_extensions}
					required
					disabled={locked}
				/>
			</label>
		{/snippet}
	</PolicyCard>
{/snippet}

{#snippet offlineCard()}
	<PolicyCard
		id="offline-policy"
		title="Offline policy"
		description="Saved preferences only."
		fields={fields.offline}
		enabled={false}
		unavailable="Offline protection is not supported yet."
		busy={actions.busy}
		onsave={(values) => actions.action('policies', { ...values, policy: 'offline' })}
		ontoggle={(value) => toggle('offline', value)}
	>
		{#snippet children(draft, locked)}
			<label class="form-field">Disconnect timeout (seconds)<input
					name="client_disconnect_timeout_seconds"
					type="number"
					min="10"
					max="86400"
					step="1"
					bind:value={draft.client_disconnect_timeout_seconds}
					required
					disabled={locked}
				/>
			</label>
			<div class="form-field">
				<label for="offline-action">Action after timeout</label>
				<DropDown
					id="offline-action"
					name="offline_action"
					label="Action after timeout"
					bind:value={draft.offline_action}
					required
					disabled={locked}
					items={[
						{ value: 'none', label: 'Do nothing' },
						{ value: 'lock', label: 'Lock' },
						{ value: 'logout', label: 'Log out' }
					]}
				/>
			</div>
			<label class="checkbox-field full-width">
				<input
					type="checkbox"
					name="allow_recovery_code"
					bind:checked={draft.allow_recovery_code}
					disabled={locked}
				/>
				Allow recovery code
			</label>
		{/snippet}
	</PolicyCard>
{/snippet}

{#snippet activityCard()}
	<PolicyCard
		id="activity-policy"
		title="Activity policy"
		description="After keyboard and mouse inactivity, confirm you are here before the selected automatic lock or logout action runs."
		fields={fields.activity}
		enabled={policy.inactivity_monitoring_enabled === true}
		busy={actions.busy}
		onsave={(values) => actions.action('policies', { ...values, policy: 'activity' })}
		ontoggle={(value) => toggle('activity', value)}
	>
		{#snippet children(draft, locked)}
			<label class="form-field">Inactivity timeout (seconds)<input
					name="inactivity_timeout_seconds"
					type="number"
					min="10"
					max="86400"
					step="1"
					bind:value={draft.inactivity_timeout_seconds}
					required
					disabled={locked}
				/>
			</label>
			<label class="form-field">Confirmation timeout (seconds)<input
					name="confirmation_timeout_seconds"
					type="number"
					min="10"
					max="3600"
					step="1"
					bind:value={draft.confirmation_timeout_seconds}
					required
					disabled={locked}
				/>
			</label>
		{/snippet}
	</PolicyCard>
{/snippet}

<WorkspacePage
	title="Policies"
	description="Manage automatic chair actions, countdown extensions and Windows inactivity prompts. Offline protection remains unavailable."
	{actions}
>
	<div class="policy-grid">
		{#each initialOrder as section (section)}
			<div class="policy-slot" class:automatic={section === 'automatic'}>
				{#if section === 'automatic'}{@render automaticCard()}
				{:else if section === 'extension'}{@render extensionCard()}
				{:else if section === 'offline'}{@render offlineCard()}
				{:else}{@render activityCard()}{/if}
			</div>
		{/each}
	</div>
</WorkspacePage>

<style>
	.policy-slot {
		min-width: 0;
	}
	.policy-slot.automatic {
		grid-column: 1 / -1;
	}
	.policy-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: stretch;
		gap: 20px;
	}
	@media (max-width: 1100px) {
		.policy-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
