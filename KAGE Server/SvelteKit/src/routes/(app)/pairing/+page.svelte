<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	let view = $state<'active' | 'saved' | 'history'>('active');
	let activePairings = $derived(
		overview.pairing.filter((request) => ['pending', 'approved'].includes(request.status))
	);
	let pairingHistory = $derived(
		overview.pairing.filter((request) => !['pending', 'approved'].includes(request.status))
	);
	let visiblePairings = $derived(view === 'active' ? activePairings : pairingHistory);
	let savedPairings = $derived(overview.saved_pairings ?? []);
	const actions = createPageActions(workspace);
	const { action } = actions;
</script>

<WorkspacePage
	title="Pairing"
	description="Approve new pairing requests or restore pairings already saved on a Hub."
	{actions}
>
	<div class="actions" role="group" aria-label="Pairing view">
		<button
			type="button"
			class:secondary={view !== 'active'}
			aria-pressed={view === 'active'}
			onclick={() => (view = 'active')}>Active pairings ({activePairings.length})</button
		>
		<button
			type="button"
			class:secondary={view !== 'saved'}
			aria-pressed={view === 'saved'}
			onclick={() => (view = 'saved')}>Saved pairings ({savedPairings.length})</button
		>
		<button
			type="button"
			class:secondary={view !== 'history'}
			aria-pressed={view === 'history'}
			onclick={() => (view = 'history')}>Pairing history ({pairingHistory.length})</button
		>
	</div>
	{#if view === 'saved'}
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>Node MAC</th><th>Hub</th><th>Last reported</th><th>Actions</th></tr>
				</thead>
				<tbody>
					{#each savedPairings as pairing (`${pairing.hub_id}/${pairing.mac_address}`)}
						<tr>
							<td>{pairing.mac_address}</td>
							<td>{pairing.hub_code}</td>
							<td>{date(pairing.last_seen)}</td>
							<td>
								<button
									type="button"
									disabled={actions.busy}
									onclick={() =>
										action('pairing', {
											action: 'restore',
											hub_id: pairing.hub_id,
											mac_address: pairing.mac_address
										})}
								>
									Restore pairing
								</button>
							</td>
						</tr>
					{:else}
						<tr><td colspan="4">No saved pairings to restore.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Node MAC</th><th>Hub</th><th>Request</th><th>Status</th><th>Expires</th><th
							>Actions
						</th>
					</tr>
				</thead><tbody
					>{#each visiblePairings as request (request.id)}<tr
							><td>{request.mac_address}</td><td>{request.hub_code}</td><td>{request.kind}</td><td
								>{request.status}
							</td><td>{date(request.expires_at)}</td><td
								>{#if ['pending', 'approved'].includes(request.status)}<div class="actions">
										<button
											type="button"
											disabled={actions.busy}
											onclick={() => action('pairing', { action: 'approve', id: request.id })}
										>
											Approve
										</button><button
											type="button"
											class="secondary"
											disabled={actions.busy}
											onclick={() => action('pairing', { action: 'reject', id: request.id })}
										>
											Reject
										</button>
									</div>{:else if request.status === 'completed'}
									<span>---</span>
								{:else if request.status === 'rejected'}
									<span>Rejected</span>
								{:else if request.status === 'expired'}
									<span>Expired</span>
								{:else}
									<span>No actions available.</span>
								{/if}
							</td>
						</tr>{:else}<tr
							><td colspan="6"
								>{view === 'active' ? 'No active pairing requests.' : 'No pairing history yet.'}</td
							></tr
						>{/each}
				</tbody>
			</table>
		</div>
	{/if}
</WorkspacePage>
