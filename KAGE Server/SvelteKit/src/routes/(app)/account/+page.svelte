<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import SignOut from '#lib/client/components/icons/SignOut.svelte';
	import SensitiveInput from '#lib/client/components/common/SensitiveInput.svelte';
	import StatusDot from '#lib/client/components/common/StatusDot.svelte';

	const workspace = getWorkspace();
	const actions = createPageActions(workspace);
	const { logout } = actions;

	let fullName = $state(workspace.account.full_name);
	let currentPassword = $state('');
	let newPassword = $state('');
	const hasChanges = $derived(
		fullName !== workspace.account.full_name || currentPassword.length > 0 || newPassword.length > 0
	);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const fields = Object.fromEntries(new FormData(form));
		const saved = await actions.action('account', fields);

		if (saved) {
			fullName = workspace.account.full_name;
			currentPassword = '';
			newPassword = '';
		}
	}
</script>

<WorkspacePage
	title="Account"
	description="Manage your profile, password, and account details."
	{actions}
>
	<div class="account-page">
		<section class="account-panel" aria-label="Account details">
			<dl class="account-details">
				<div>
					<dt>Name</dt>
					<dd>{workspace.account.full_name}</dd>
				</div>
				<div>
					<dt>Email address</dt>
					<dd class="account-email">{workspace.account.email}</dd>
				</div>
				<div>
					<dt>Email verification</dt>
					<dd>
						<span
							class="verification-status"
							class:verified={!!workspace.account.email_verified_at}
						>
							<StatusDot />
							{workspace.account.email_verified_at ? 'Verified' : 'Not verified'}
						</span>
					</dd>
				</div>
			</dl>
		</section>

		<form class="account-panel account-form" onsubmit={handleSubmit}>
			<section class="settings-section" aria-labelledby="profile-title">
				<div class="section-heading">
					<h2 id="profile-title">Profile</h2>
					<p>Manage your account name.</p>
				</div>
				<div class="settings-fields">
					<label for="full-name">Full name</label>
					<input
						id="full-name"
						name="full_name"
						autocomplete="name"
						bind:value={fullName}
						required
					/>
				</div>
			</section>
			<section class="settings-section" aria-labelledby="password-title">
				<div class="section-heading">
					<h2 id="password-title">Password</h2>
					<p>Leave these fields blank to keep your current password.</p>
				</div>
				<div class="password-fields">
					<div class="settings-fields">
						<label for="current-password">Current password</label>
						<SensitiveInput
							id="current-password"
							name="current_password"
							bind:value={currentPassword}
							type="password"
							autocomplete="current-password"
							aria-describedby="password-help"
							required={false}
						/>
					</div>
					<div class="settings-fields">
						<label for="new-password">New password</label>
						<SensitiveInput
							id="new-password"
							name="new_password"
							bind:value={newPassword}
							type="password"
							minlength={12}
							maxlength={256}
							autocomplete="new-password"
							aria-describedby="password-help"
							required={false}
						/>
					</div>
					<p id="password-help" class="field-help">
						Use at least 12 characters. Changing your password signs out all sessions.
					</p>
				</div>
			</section>
			<div class="save-actions">
				<button disabled={actions.busy || !hasChanges}>{actions.busy ? 'Saving...' : 'Save account'}</button>
			</div>
		</form>

		<footer class="account-footer">
			<button type="button" class="secondary danger" disabled={actions.busy} onclick={logout}>
				<span aria-hidden="true"><SignOut properties="size-4" /></span>Sign out
			</button>
		</footer>
	</div>
</WorkspacePage>

<style>
	:global(.workspace:has(.account-page)),
	:global(.workspace:has(.account-page) > div) {
		display: flex;
		flex-direction: column;
	}
	:global(.workspace:has(.account-page) > div) {
		flex: 1;
	}
	.account-page {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}
	.account-panel {
		min-width: 0;
		padding: 28px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}
	.account-details {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(140px, 1fr);
		gap: 24px;
		margin: 0;
	}
	.account-details dt {
		margin-bottom: 8px;
		color: var(--muted);
		font-size: 12px;
	}
	.account-details dd {
		margin: 0;
		min-height: 28px;
		display: flex;
		align-items: center;
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.verification-status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 4px 9px;
		border: 1px solid var(--warning-border);
		border-radius: 6px;
		background: var(--warning-surface);
		color: var(--warning);
		font-size: 12px;
	}
	.verification-status.verified {
		border-color: var(--success-border);
		background: var(--success-surface);
		color: var(--success);
	}
	.account-form {
		gap: 0;
	}
	.settings-section {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr);
		align-items: start;
		gap: 24px 40px;
		padding-bottom: 28px;
	}
	.settings-section + .settings-section {
		padding-top: 28px;
		border-top: 1px solid var(--line);
	}
	.section-heading h2 {
		margin: 0 0 6px;
		font-size: 16px;
	}
	.section-heading p,
	.field-help {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.settings-fields {
		display: grid;
		gap: 8px;
		min-width: 0;
	}
	.password-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 20px;
	}
	.field-help {
		grid-column: 1 / -1;
	}
	.save-actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 20px;
		border-top: 1px solid var(--line);
	}
	.account-footer {
		display: flex;
		justify-content: flex-end;
		margin-top: auto;
		padding-top: 8px;
	}
	.account-footer button.danger {
		border-color: var(--action);
		background: var(--action);
		color: #fff;
	}
	.account-footer button.danger:hover:not(:disabled) {
		border-color: var(--action-hover);
		background: var(--action-hover);
	}
	@media (max-width: 1100px) {
		.settings-section {
			grid-template-columns: 1fr;
			gap: 20px;
		}
	}
	@media (max-width: 600px) {
		.account-panel {
			padding: 20px;
		}
		.account-details,
		.password-fields {
			grid-template-columns: minmax(0, 1fr);
			gap: 20px;
		}
	}
</style>
