<script lang="ts">
    /* eslint-disable svelte/no-navigation-without-resolve */
    import ArrowUp from "../icons/ArrowUp.svelte";

    let {
        style = 1,
        href = "#",
        target = "_blank",
        text = ""
    }: {
        style?: number;
        href?: string;
        target?: string;
        text?: string;
    } = $props();
</script>

{#if style === 1}
    <div
        class="group relative
            flex items-center justify-center gap-1.5 px-4 py-1.5
            text-xs font-semibold rounded-md transition-all duration-200
            outline-none cursor-pointer border
            text-gray-800 bg-white border-gray-300 shadow-sm
            hover:border-primary-400 hover:bg-primary-50
            focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
            active:scale-[98.5%] active:bg-primary-100 overflow-hidden
            disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
        "
        aria-label="View Reports"
    >

        <a href={href} target={target} aria-label="hyperlink" class="absolute inset-0 z-100 w-full h-full"></a>

        <div class="flex items-center gap-1 z-50">
            <span>{text}</span>
            <ArrowUp properties="size-3.5 rotate-45" />
        </div>

        <div class="absolute z-10 -translate-1/2 left-1/2 top-full opacity-0 w-1 h-1 rounded-full bg-primary-500 transition-all duration-200 group-hover:opacity-100 pointer-events-none group-hover:w-[110%] group-hover:h-[5%]"></div>
        <div class="absolute z-10 right-1.5 top-1.5 w-1 h-1 rounded-full bg-primary-500 group-hover:animate-pulse"></div>


    </div>
{/if}