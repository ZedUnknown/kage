<script lang="ts">
	import DropDown from './DropDown.svelte';
	import type { DropdownProps } from '../../types/dropdown.ts';
	let { value = $bindable(''), ...props }: DropdownProps = $props();
</script>

<DropDown {...props} bind:value searchable />
