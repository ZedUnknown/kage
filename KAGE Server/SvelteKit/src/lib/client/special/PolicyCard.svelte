<script lang="ts" generics="Fields extends PolicyFields">
	import { untrack, type Snippet } from 'svelte';
	import Warning from '../components/icons/Warning.svelte';
	import { hasPolicyChanges, reconcilePolicyDraft, type PolicyFields } from '../policy-draft.ts';

	let {
		id,
		title,
		description,
		fields,
		enabled,
		busy,
		unavailable = '',
		onsave,
		ontoggle,
		children
	}: {
		id: string;
		title: string;
		description: string;
		fields: Fields;
		enabled: boolean;
		busy: boolean;
		unavailable?: string;
		onsave: (fields: Fields) => Promise<boolean>;
		ontoggle: (enabled: boolean) => Promise<boolean>;
		children: Snippet<[Fields, boolean]>;
	} = $props();

	let saved = $state<Fields>(untrack(() => ({ ...fields })));
	let draft = $state<Fields>(untrack(() => ({ ...fields })));
	let active = $state(untrack(() => enabled));

	const dirty = $derived(hasPolicyChanges(saved, draft));
	const locked = $derived(busy || !active || !!unavailable);

	$effect(() => {
		const incoming = fields;
		const incomingEnabled = enabled;
		untrack(() => {
			draft = reconcilePolicyDraft(saved, draft, incoming);
			saved = { ...incoming };
			active = incomingEnabled;
		});
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (locked || !dirty) return;

		const submitted = { ...draft };

		if (await onsave(submitted)) saved = submitted;
	}

	async function toggle() {
		if (busy || unavailable) return;

		const next = !active;

		if (await ontoggle(next)) active = next;
	}
</script>

<section
	class="policy-card"
	class:inactive={!active || !!unavailable}
	class:unsaved={dirty}
	aria-labelledby={`${id}-heading`}
>
	<header class="card-header">
		<h2 id={`${id}-heading`}>{title}</h2>
		{#if dirty}
			<span class="unsaved-indicator" role="status" title="Unsaved changes">
				<Warning properties="size-4" /><span>Unsaved changes</span>
			</span>
		{/if}
	</header>
	<p class="card-description">{description}</p>
	<form onsubmit={save}>
		<fieldset class="policy-fields" disabled={locked}>
			<legend class="sr-only">{title} settings</legend>
			{@render children(draft, locked)}
		</fieldset>
		{#if unavailable}
			<p class="availability-note" id={`${id}-unavailable`}>{unavailable}</p>
		{/if}
		<footer class="policy-footer">
			<div class="policy-actions">
				<button
					type="button"
					class:secondary={active}
					disabled={busy || !!unavailable}
					aria-pressed={active}
					aria-label={`${active ? 'Disable' : 'Enable'} ${title.toLowerCase()}`}
					aria-describedby={unavailable ? `${id}-unavailable` : undefined}
					onclick={toggle}
				>
					{active ? 'Disable' : 'Enable'}
				</button>
				{#if dirty}
					<button
						type="submit"
						disabled={locked}
						aria-label={`Save ${title.toLowerCase()}`}
					>
						Save changes
					</button>
				{/if}
			</div>
		</footer>
	</form>
</section>

<style>
	.policy-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
		padding: 22px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
	}
	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.card-header h2 {
		margin: 0;
		font-size: 17px;
	}
	.card-description {
		margin: 10px 0 20px;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.policy-card.inactive .card-header h2 {
		color: var(--muted);
	}
	.policy-card.inactive .policy-fields {
		opacity: 0.45;
		filter: grayscale(1);
	}
	.policy-card.unsaved {
		border-color: var(--warning-border);
	}
	.unsaved-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		color: var(--warning);
		font-size: 11px;
		line-height: 1.5;
	}
	form {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 20px;
	}
	.policy-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: 16px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.policy-fields :global(label) {
		font-size: 12px;
	}
	.policy-fields :global(.full-width) {
		grid-column: 1 / -1;
	}
	.policy-fields :global(input[type='checkbox']) {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--action);
	}
	.policy-fields :global(.checkbox-field) {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.policy-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		padding-top: 16px;
		margin-top: auto;
		border-top: 1px solid var(--line);
	}
	.policy-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.policy-actions button {
		min-height: 36px;
		padding: 8px 12px;
	}
	.availability-note {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
	}
	@media (max-width: 600px) {
		.policy-card {
			padding: 18px;
		}
		.policy-fields {
			grid-template-columns: minmax(0, 1fr);
		}
		.unsaved-indicator > span {
			display: none;
		}
	}
</style>
