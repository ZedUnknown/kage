<script lang="ts">
	let { text, query }: { text: string; query: string } = $props();

	let parts = $derived.by(() => {
		const needle = query.trim().toLowerCase();

		if (!needle) return [{ text, matched: false }];

		const value = text.toLowerCase();
		const result: { text: string; matched: boolean }[] = [];
		let start = 0;
		let index = value.indexOf(needle);

		while (index !== -1) {
			if (index > start) result.push({ text: text.slice(start, index), matched: false });

			result.push({ text: text.slice(index, index + needle.length), matched: true });
			start = index + needle.length;
			index = value.indexOf(needle, start);
		}

		if (start < text.length) result.push({ text: text.slice(start), matched: false });

		return result;
	});
</script>

{#each parts as part, index (index)}
	{#if part.matched}<mark>{part.text}</mark>{:else}{part.text}{/if}
{/each}

<style>
	mark {
		border-radius: 3px;
		background: var(--accent-halo);
		color: var(--accent-soft);
		box-shadow: 0 0 0 1px var(--accent-border);
	}
</style>
