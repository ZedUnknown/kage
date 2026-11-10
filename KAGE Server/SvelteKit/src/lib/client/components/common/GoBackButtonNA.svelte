<script lang="ts">
// NA = Non-Automated

import { twMerge } from "tailwind-merge";
	import CaretLeft from "../icons/CaretLeft.svelte";

let {

    onclick,

    __class_button__ = "",
    __class_arrow_container__ = "",
} = $props();


let __class_button__computed = $derived.by(() => twMerge("group absolute top-3 left-3 p-1 rounded-xl text-gray-600 hover:bg-gray-200 border border-b-2 border-gray-300 cursor-pointer overflow-hidden", __class_button__));
let __class_arrow_container__computed = $derived.by(() => twMerge("flex items-center justify-center w-6 h-6 relative", __class_arrow_container__));

</script>


<button
    type="button"
    class={__class_button__computed}
    onclick={() => {
        if (onclick) {
            onclick();
        }
    }}
>
    <div class={__class_arrow_container__computed}>
        <CaretLeft properties="size-6 absolute transition-all duration-300 translate-x-[0%]   group-hover:scale-110 group-active:translate-x-[-100%] opacity-100 group-active:opacity-0 group-active:scale-100"/>
        <CaretLeft properties="size-6 absolute transition-all duration-300 translate-x-[100%] group-hover:scale-110 group-hover:translate-x-[0%]     opacity-100 group-hover:opacity-0  group-active:opacity-100    group-active:scale-100"/>
    </div>
</button>