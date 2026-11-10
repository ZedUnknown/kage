<script lang="ts" generics="Item">
	import { untrack } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	let {
		placeholder = 'Search',
		value = $bindable(''),
		objectToBeSearched = [],
		searchKeys = [],
		fncReturnObject,
		preventOnMountTrigger = true,
		__class__ = '',
		...inputProps
	}: Omit<HTMLInputAttributes, 'value'> & {
		value?: string;
		objectToBeSearched?: Item[];
		searchKeys?: string[];
		fncReturnObject?: (results: Item[]) => void;
		preventOnMountTrigger?: boolean;
		__class__?: string;
	} = $props();
	const results = $derived.by(() => {
		const query = value.trim().toLowerCase();
		if (!query) return objectToBeSearched;
		return objectToBeSearched.filter((item) =>
			searchKeys.some((key) => {
				const field = key
					.split('.')
					.reduce<unknown>(
						(current, part) =>
							current && typeof current === 'object'
								? (current as Record<string, unknown>)[part]
								: undefined,
						item
					);
				return String(field ?? '')
					.toLowerCase()
					.includes(query);
			})
		);
	});
	let firstRun = untrack(() => preventOnMountTrigger);
	$effect(() => {
		const filtered = results;
		if (firstRun) {
			firstRun = false;
			return;
		}
		untrack(() => fncReturnObject?.(filtered));
	});
</script>

<input
	{...inputProps}
	type="search"
	bind:value
	class={__class__}
	{placeholder}
	aria-label={inputProps['aria-label'] || placeholder}
/>
