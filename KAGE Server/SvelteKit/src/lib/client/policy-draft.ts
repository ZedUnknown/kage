export type PolicyFields = Record<string, string | number | boolean | undefined>;

export function hasPolicyChanges<T extends PolicyFields>(saved: T, draft: T) {
	return Object.keys(saved).some((key) => !Object.is(saved[key], draft[key]));
}

// Refresh clean fields without replacing edits the user has not saved.
export function reconcilePolicyDraft<T extends PolicyFields>(saved: T, draft: T, incoming: T): T {
	return Object.fromEntries(
		Object.keys(incoming).map((key) => [key, Object.is(saved[key], draft[key]) ? incoming[key] : draft[key]])
	) as T;
}
