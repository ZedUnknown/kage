<script lang="ts">
	import HistoryPage from '#lib/client/special/HistoryPage.svelte';
	import { getWorkspace } from '#lib/client/workspace.svelte.ts';
	import { date } from '#lib/client/format.ts';

	const workspace = getWorkspace();
</script>

<HistoryPage type="events">
	<ol>
		{#each workspace.overview.events as event (event.id)}
			<li class="history-row">
				<strong>{event.kind}</strong><code>{JSON.stringify(event.detail)}</code><time>{date(event.created_at)}
				</time>
			</li>
		{:else}<li class="muted">No device events.</li>{/each}
	</ol>
</HistoryPage>
