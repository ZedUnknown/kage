<script lang="ts">
	import Check from "../icons/Check.svelte";

    let {
        checked = $bindable(false),
        disabled = false,
        onchange = () => {}
    } = $props();

    let _checked = $state(checked);


</script>

<label class="flex items-center gap-1.5 cursor-pointer select-none">
    <input
        bind:checked={_checked}
        type="checkbox"
        class="sr-only"
        disabled={disabled}
        onchange={() => {
            if (disabled) return;
            onchange(_checked);
        }}
    />

    <div class="
        check-mark flex items-center justify-center w-[16px] h-[16px] rounded-sm transition-colors duration-200
        {_checked ? 'bg-primary-500 border-primary-500' : ''} border border-gray-400
    ">
        <Check properties="size-3 text-white transition-opacity duration-200 {_checked ? 'opacity-100' : 'opacity-0'}" />
    </div>
</label>