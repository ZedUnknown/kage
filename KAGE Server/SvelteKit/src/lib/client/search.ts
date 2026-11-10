// Keep matches first without changing the order within either group.
export function orderSearchResults<T>(
	items: readonly T[],
	query: string,
	fields: (item: T) => readonly (string | null | undefined)[]
) {
	const normalized = query.trim().toLowerCase();
	const matches = new Set<T>();

	if (!normalized) return { items, matches };

	const remaining: T[] = [];

	for (const item of items) {
		if (fields(item).some((field) => field?.toLowerCase().includes(normalized))) {
			matches.add(item);
		} else {
			remaining.push(item);
		}
	}

	return { items: [...matches, ...remaining], matches };
}
