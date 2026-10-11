<script lang="ts">
	let {
        properties = 'size-4'
    ,   animationClass = 'animate-InfiniteSlide'
    } = $props();
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    class={properties}
    width="24"
    height="24"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
>

    <path d="M21.25 6.72v10.56a2.97 2.97 0 0 1-2.97 2.97H5.72a2.97 2.97 0 0 1-2.97-2.97V6.72a2.97 2.97 0 0 1 2.97-2.97h12.56a2.97 2.97 0 0 1 2.97 2.97"></path>
    <path d="M6.25 7.25v9.5" class={animationClass}></path>

</svg>