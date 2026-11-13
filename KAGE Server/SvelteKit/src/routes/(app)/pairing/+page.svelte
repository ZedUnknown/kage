<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	let view = $state<'active' | 'history'>('active');
	let activePairings = $derived(
		overview.pairing.filter((request) => ['pending', 'approved'].includes(request.status))
	);
	let pairingHistory = $derived(
		overview.pairing.filter((request) => !['pending', 'approved'].includes(request.status))
	);
	let visiblePairings = $derived(view === 'active' ? activePairings : pairingHistory);
	const actions = createPageActions(workspace);
	const { action } = actions;
</script>

<WorkspacePage
	title="Pairing"
	description="Approval permits the next discovery handshake. It does not mark a Node paired."
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
			class:secondary={view !== 'history'}
			aria-pressed={view === 'history'}
			onclick={() => (view = 'history')}>Pairing history ({pairingHistory.length})</button
		>
	</div>
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
</WorkspacePage>
