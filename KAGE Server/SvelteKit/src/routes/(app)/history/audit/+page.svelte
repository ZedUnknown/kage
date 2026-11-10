<script lang="ts">
	import HistoryPage from '#lib/client/special/HistoryPage.svelte';
	import { getWorkspace } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';

	const workspace = getWorkspace();
</script>

<HistoryPage type="audit">
	<ol>
		{#each workspace.overview.audit as event (event.id)}
			<li class="history-row">
				<strong>{event.action}</strong><span>{event.resource_id || 'Workspace'}</span><time>{date(event.created_at)}
				</time>
			</li>
		{:else}<li class="muted">No administrative actions.</li>{/each}
	</ol>
</HistoryPage>
