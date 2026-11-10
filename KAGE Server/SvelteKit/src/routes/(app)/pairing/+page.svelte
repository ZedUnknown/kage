<script lang="ts">
	import WorkspacePage from '#lib/client/special/WorkspacePage.svelte';
	import { getWorkspace, createPageActions } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';

	const workspace = getWorkspace();
	let overview = $derived(workspace.overview);
	const actions = createPageActions(workspace);
	const { action } = actions;
</script>

<WorkspacePage
	title="Pairing"
	description="Approval permits the next discovery handshake. It does not mark a Node paired."
	{actions}
>
	<div class="table-wrap">
		<table>
			<thead><tr><th>Node MAC</th><th>Hub</th><th>Request</th><th>Status</th><th>Expires</th><th>Actions
					</th>
				</tr>
			</thead><tbody>{#each overview.pairing as request (request.id)}<tr><td>{request.mac_address}</td><td>{request.hub_code}</td><td>{request.kind}</td><td>{request.status}
						</td><td>{date(request.expires_at)}</td><td>{#if ['pending', 'approved'].includes(request.status)}<div class="actions">
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
				</tr>{:else}<tr><td colspan="6">No pairing or unpairing requests.</td></tr>{/each}
				</tbody>
		</table>
	</div>
</WorkspacePage>
