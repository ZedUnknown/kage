<script lang="ts">
    import iro from '@jaames/iro'; // Simple import
    import { onMount } from 'svelte';

    let {
        color = $bindable(),
        // Use string identifiers instead of objects for props
        layout = [
            { component: 'Box' },
            { component: 'Slider', options: { sliderType: 'hue' } }
        ],
        size = 250,
        togglable = true,
        toggleButtonClass = "w-8 h-8 rounded-full cursor-pointer border border-gray-300",

        showColorCodeInput = false
    } = $props();

    let pickerElement: HTMLElement | undefined = $state();
    let colorPicker: any;
    let toggleColorPicker = $state(false);

    onMount(() => {
        if (!pickerElement) return;

        let processedLayout = {}

        if (layout.length !== 0) {
            processedLayout = layout.map((item) => {
                return {
                    component: (iro.ui as any)[item.component],
                    options: item.options || {}
                }
            });
        }

        if (color === '' || color === undefined || color === null) {
            color = '#ffffff';
            console.warn('No initial color provided to ColorPicker, defaulting to #ffed00');
        }


        colorPicker = new (iro as any).ColorPicker(pickerElement, {
            width: size,
            color: color,
            borderWidth: 1,
            borderColor: "#474747",
            layout: processedLayout
        });

        colorPicker.on('color:change', (newColor: any) => {
            color = newColor.hexString;
        });

        return () => {
            if (colorPicker) {
                pickerElement!.innerHTML = '';
                colorPicker = null;
            }
        };
    });

    let containerElement: HTMLElement | undefined = $state();

    $effect(() => {
        if (colorPicker && color && color.length === 7) {
            const pickerColor = colorPicker.color.hexString;

            if (pickerColor.toLowerCase() !== color.toLowerCase()) {
                try {
                    colorPicker.setByLink = true;
                    colorPicker.color.set(color);
                } catch (e) {
                    console.error('Invalid color value provided to ColorPicker:', color);
                }
            }
        }

        const handleClickOutside = (event: MouseEvent) => {
            // If the click is NOT inside our container, close the picker
            if (containerElement && !containerElement.contains(event.target as Node)) {
                toggleColorPicker = false;
            }
        };

        window.addEventListener('click', handleClickOutside);

        return () => {
            window.removeEventListener('click', handleClickOutside);
        };
    });

</script>

{#if togglable}
    <div
        class="relative z-9999"
        bind:this={containerElement}
    >
        <button
            type="button"
            class={toggleButtonClass}
            style="background-color: {color}"
            onclick={() => toggleColorPicker = !toggleColorPicker}
            aria-label="Toggle Color Picker"
        ></button>

        <!-- Use svelte:element or simply ensure visibility -->
        <div class="absolute p-5 -translate-x-full left-full top-10 rounded-2xl bg-white border shadow-xl {toggleColorPicker ? 'block' : 'hidden'}">
            <div bind:this={pickerElement}></div>

            {#if showColorCodeInput}
                <input
                    class="my-0.5 mt-2 py-1 w-full text-sm outline-hidden bg-gray-200 border border-gray-300 rounded-md placeholder:text-gray-400 text-center"
                    type="text"
                    bind:value={color}
                    placeholder="#000000"
                    autocomplete="off"
                />
            {/if}
        </div>
    </div>
{:else}
    <div bind:this={pickerElement}></div>
    {#if showColorCodeInput}
        <div style="background-color: {color}" class="rounded-md border border-gray-300">
            <input
                class="my-0.5 py-1 w-full text-sm outline-hidden text-center text-white mix-blend-difference"
                type="text"
                bind:value={color}
                placeholder=""
                autocomplete="off"
            />
        </div>
    {/if}
{/if}