<script lang="ts">

let {
    onDateChange,
    defaultDate,
    preventOnChangeOnMount
 }: {
    onDateChange?: (date: Date) => void;
    defaultDate?: string;
    preventOnChangeOnMount?: boolean;
 } = $props();

import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";

import CalendarBlank from "../icons/CalendarBlank.svelte";
import { onMount } from "svelte";
import { getLocalDate } from "$lib/utils/datetime";

// ui statusa
let datepicker: HTMLInputElement;
let dateDisplayElement: HTMLInputElement;

let selectedDate = $state(null);

onMount(() => {
    flatpickr(datepicker, {
        mode: "single",
        static: true,
        monthSelectorType: "static",
        dateFormat: "M j",

        locale: {
            rangeSeparator: " - "
        },

        defaultDate: new Date(defaultDate),

        prevArrow: '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.25 6L9 12.25L15.25 18.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        nextArrow: '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.75 19L15 12.75L8.75 6.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',

        onReady: (selectedDates, dateStr, instance) => {
            selectedDate = getLocalDate(selectedDates[0]);
            dateDisplayElement.value = dateStr;
        },

        // Use onValueUpdate for better reliability with 'range' mode
        onValueUpdate: (selectedDates, dateStr, instance) => {
            selectedDate = getLocalDate(selectedDates[0]);
            dateDisplayElement.value = dateStr;
        }
    });
});


let isFirstRun = preventOnChangeOnMount;

$effect(() => {

    const date = selectedDate;
    if (onDateChange && !isFirstRun) {
        onDateChange(date);
    }

    isFirstRun = false;
});

</script>


<div class="group relative flex max-w-[180px] " bind:this={datepicker}>
    <div class="flex overflow-hidden border border-gray-300 rounded-xl focus-within:border-1 focus-within:border-primary-400">
        <div class="flex items-center justify-center w-14 text-gray-400 border-primary-500 group-focus-within:bg-primary-500 group-focus-within:text-white hover:bg-primary-500 hover:text-white cursor-pointer">
            <CalendarBlank properties="size-5 " />
        </div>

        <input
            class="text-center h-10 w-full border-l-2 border-gray-300 group-focus-within:border-primary-400  bg-white py-2.5 pr-4 pl-3 cursor-pointer font-medium text-gray-700 focus:ring-0 focus:outline-none"
            placeholder="Select dates"
            data-class="flatpickr-right"
            readonly={true}
            bind:this={dateDisplayElement}
        />

    </div>
</div>

<style>
:global(.flatpickr-day.selected),
:global(.flatpickr-day.selected.prevMonthDay),
:global(.flatpickr-day.selected.nextMonthDay) {
    border: 1px solid var(--color-primary-200);
}

:global(.flatpickr-calendar) {
  margin-top: 0.5rem !important;
  border-radius: 0.75rem !important;
  padding: 1.25rem !important;
  color: var(--color-gray-500) !important; /* gray-500 */
  width: auto !important;
}

:global(.flatpickr-calendar.arrowTop:before),
:global(.flatpickr-calendar.arrowTop:after) {
  display: none;
}

:global(.flatpickr-current-month .cur-month),
:global(.flatpickr-current-month input.cur-year) {
  height: auto !important;
  padding-top: 0 !important;
  font-size: 1.125rem !important; /* text-lg */
  line-height: 1.75rem !important;
  font-weight: 500 !important;
  color: var(--color-gray-800) !important; /* gray-800 */
}

:global(.flatpickr-prev-month),
:global(.flatpickr-next-month) {
  padding: 0 !important;
}

:global(.flatpickr-weekdays) {
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  height: auto;
}

:global(.flatpickr-weekday) {
  font-size: 0.875rem !important; /* text-sm */
  line-height: 1.25rem !important;
  font-weight: 500 !important;
}

:global(.flatpickr-months .flatpickr-prev-month),
:global(.flatpickr-months .flatpickr-next-month) {
  top: 1.75rem !important;
}

:global(.flatpickr-months .flatpickr-prev-month.flatpickr-prev-month),
:global(.flatpickr-months .flatpickr-next-month.flatpickr-prev-month) {
  left: 1.75rem !important;
}

:global(.flatpickr-months .flatpickr-prev-month.flatpickr-next-month),
:global(.flatpickr-months .flatpickr-next-month.flatpickr-next-month) {
  right: 1.75rem !important;
}

:global(.flatpickr-calendar.static) {
  right: 0;
}
</style>