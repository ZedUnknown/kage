<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Eye from '../icons/Eye.svelte';
	import EyeSlash from '../icons/EyeSlash.svelte';
	const uniqueId = $props.id();
	let {
		id = uniqueId,
		value = $bindable(''),
		type = 'text',
		required = true,
		readOnly = false,
		outerClassName = '',
		inputClassName = '',
		showButtonClassName = '',
		label,
		...inputProps
	}: Omit<HTMLInputAttributes, 'value' | 'type'> & {
		value?: string;
		type?: 'text' | 'password';
		readOnly?: boolean;
		outerClassName?: string;
		inputClassName?: string;
		showButtonClassName?: string;
		label?: string;
	} = $props();
	let show = $state(false);
</script>

<div class="sensitive-input {outerClassName}">
	<input
		{...inputProps}
		{id}
		class={inputClassName}
		aria-label={label || inputProps['aria-label']}
		type={type === 'password' && !show ? 'password' : 'text'}
		bind:value
		required={required && !readOnly}
		readonly={readOnly || inputProps.readonly}
	/>
	{#if type === 'password'}
		<button
			class="icon-button {showButtonClassName}"
			type="button"
			aria-label={show ? 'Hide password' : 'Show password'}
			aria-pressed={show}
			aria-controls={id}
			disabled={inputProps.disabled}
			onclick={() => (show = !show)}
		>
			{#if show}<EyeSlash />{:else}<Eye />{/if}
		</button>
	{/if}
</div>

<style>
	.sensitive-input {
		position: relative;
		width: 100%;
		min-width: 0;
	}
	.sensitive-input:has(button) input {
		padding-right: 48px;
	}
	.sensitive-input button {
		position: absolute;
		top: 50%;
		right: 4px;
		transform: translateY(-50%);
	}
</style>
