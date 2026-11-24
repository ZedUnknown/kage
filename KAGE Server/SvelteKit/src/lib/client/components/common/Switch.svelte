<script lang="ts">
	let {
		checked = $bindable(false),
		disabled = false,
		controlled = false,
		id,
		ariaLabelledbyId,
		label,
		onchange
	}: {
		checked?: boolean;
		disabled?: boolean;
		controlled?: boolean;
		id?: string;
		ariaLabelledbyId?: string;
		label?: string;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	{id}
	{disabled}
	aria-checked={checked}
	aria-labelledby={ariaLabelledbyId}
	aria-label={label}
	class="switch"
	class:checked
	onclick={() => {
		if (disabled) return;
		const next = !checked;
		if (!controlled) checked = next;
		onchange?.(next);
	}}
>
	<span></span>
</button>

<style>
	button.switch {
		width: 40px;
		min-width: 40px;
		height: 24px;
		min-height: 24px;
		padding: 3px;
		border: 1px solid var(--line-strong);
		border-radius: 20px;
		background: var(--surface-raised);
		justify-content: flex-start;
	}
	button.switch.checked {
		background: var(--action);
		border-color: var(--action);
	}
	button.switch:hover:not(:disabled) {
		border-color: var(--action);
	}
	button.switch:disabled {
		background: var(--surface-deep);
		border-color: var(--line);
	}
	button.switch:disabled span {
		background: var(--muted);
	}
	span {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		transition: transform 180ms ease;
		transform: translate(0, -0.5px);
	}
	.checked span {
		transform: translate(16px, -0.5px);
	}
	@media (prefers-reduced-motion: reduce) {
		span {
			transition: none;
		}
	}
</style>
