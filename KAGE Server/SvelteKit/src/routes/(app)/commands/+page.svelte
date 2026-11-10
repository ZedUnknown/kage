<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';
	import DropDown from '#lib/client/components/common/DropDown.svelte';
	import SearchDropDown from '#lib/client/components/common/SearchDropDown.svelte';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	const { submit } = actions;
</script>

<WorkspacePage
	title="Commands"
	description="Choose a workstation and operation. Check its reported status below to confirm execution."
	{actions}
>
	<section class="panel">
		<h2>Workstation operation</h2>
		<form class="form-grid" onsubmit={(e) => submit(e, 'commands')}>
			<div class="form-field">
				<label for="command-client">Client</label>
				<SearchDropDown
					id="command-client"
					name="client_id"
					label="Client"
					placeholder="Select client"
					required
					disabled={actions.busy}
					items={overview.clients.map((client) => ({
						value: client.id,
						label: `${client.name} / ${client.pc_id}`
					}))}
				/>
			</div>
			<div class="form-field">
				<label for="command-operation">Operation</label>
				<DropDown
					id="command-operation"
					name="command"
					label="Operation"
					value="force_lock"
					required
					disabled={actions.busy}
					items={[
						'force_lock',
						'force_logout',
						'cancel_force_lock',
						'cancel_force_logout',
						'cancel_auto_lock',
						'cancel_auto_logout'
					].map((command) => ({ value: command, label: command.replaceAll('_', ' ') }))}
				/>
			</div>
			<label>Countdown (seconds)<input
					name="delay_seconds"
					type="number"
					min="0"
					max="3600"
					value="30"
					required
				/>
			</label>
			<div><button disabled={actions.busy}>Queue command</button></div>
		</form>
	</section>
	<div class="table-wrap">
		<table>
			<thead><tr><th>Operation</th><th>Status</th><th>Created</th><th>Expires</th></tr></thead><tbody>{#each overview.commands as command (command.id)}<tr><td>{command.kind}</td><td><span class="badge">{command.status}</span></td><td>{date(command.created_at)}
						</td><td>{date(command.expires_at)}</td>
				</tr>{:else}<tr><td colspan="4">No commands.</td></tr>{/each}
			</tbody>
		</table>
	</div>
</WorkspacePage>
