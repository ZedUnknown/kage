<script>
	import { authStore } from "$lib/stores/index.svelte";
	import GoBackButton from "./GoBackButton.svelte";
    import { twMerge } from "tailwind-merge";

    let {
        title = "Go Back",
        showRoleBadge = true,
        __class_container__ = "",
        __class__button = "",
        __class__arrow = "",
        __class__title = ""
    } = $props();

    let __class_container__computed = $derived.by(() => twMerge("flex w-full h-14 items-center justify-between border-b border-gray-300 p-4", __class_container__));
    let __class__button_computed = $derived.by(() => twMerge("group text-gray-500 cursor-pointer transition-all duration-200 active:scale-98", __class__button));
    let __class__arrow_computed = $derived.by(() => twMerge("size-5 text-gray-600 transition-all duration-200 group-hover:translate-x-[-2px] group-hover:scale-110 group-active:translate-x-[-20px] group-active:scale-100", __class__arrow));
    let __class__title_computed = $derived.by(() => twMerge("text-md text-gray-600 font-bold tracking-wide transition-all duration-100", __class__title));

</script>

<!-- Header -->
<div class={__class_container__computed}>
    <!-- back button -->
    <GoBackButton
        title={title}
        __class__button={__class__button_computed}
        __class__arrow={__class__arrow_computed}
        __class__title={__class__title_computed}
    />

    <!-- role badge -->
    {#if showRoleBadge}
        <div class="w-full flex justify-end">
            <span
                class="w-fit py-0.5 px-2.5 rounded-full text-xs border cursor-pointer"
                style="color: {authStore?.user?.role.color}; background-color: {authStore?.user?.role.color}25; border-color: {authStore?.user?.role.color}50"
            >
                {authStore?.user?.role.name.toUpperCase()}
            </span>
        </div>
    {/if}
</div>