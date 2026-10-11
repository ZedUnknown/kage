<script lang="ts">
    let { properties = 'size-4', hide = false } = $props();
</script>

{#if !hide}
    <div class="flex justify-center text-center">
        <img style="
        filter: brightness(120%) hue-rotate(335deg);
        opacity: 1;
        transition: opacity 0.3s ease-in-out;
        "
        width="18" alt="" src="/assets/apngs/loading.apng" class={properties} />
    </div>
{/if}
