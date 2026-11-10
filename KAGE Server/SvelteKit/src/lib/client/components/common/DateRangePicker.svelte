<script lang="ts">

let {
    onDateRangeChange,
    defaultDateRange,
    value = $bindable(),
    preventOnChangeOnMount = true,
    position = [10, 10],
    __class_container__ = ""
 }: {
    onDateRangeChange?: (dateRange: [string, string]) => void;
    defaultDateRange?: {start: string; end: string};
    value?: [string, string];
    preventOnChangeOnMount?: boolean;
    position?: [number, number]; // x, y | top, left
    __class_container__?: string;
 } = $props();

import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import type { Instance } from "flatpickr/dist/types/instance";
import { twMerge } from "tailwind-merge";

import CalendarBlank from "../icons/CalendarBlank.svelte";
import { onMount, untrack } from "svelte";
import { getLocalDate } from "$lib/utils/datetime";

// ui status
let datepicker: HTMLDivElement;
let dateDisplayElement: HTMLInputElement;

type DateRange = [string, string];

let selectedDatesRange = $state<DateRange | null>(null);

let flatpickrInstance: Instance | undefined;

let __class_container__computed = $derived.by(() => twMerge("group relative flex max-w-45", __class_container__));

onMount(() => {
    flatpickrInstance = flatpickr(dateDisplayElement, {
        mode: "range",
        // NOTE: `static: true` breaks the flatpickr positioning
        // For any custom position keep this false
        static: false,
        monthSelectorType: "static",
        dateFormat: "M j",

        position: (fp, customEl) => {
            const anchor = (customEl ?? fp._positionElement) as HTMLElement;
            const rect = anchor.getBoundingClientRect();

            const top = rect.bottom + (position[1] ?? 0);
            const left = rect.left + (position[0] ?? 0);

            fp.calendarContainer.style.position = "absolute";
            fp.calendarContainer.style.top = `${top}px`;
            fp.calendarContainer.style.left = `${left}px`;
            fp.calendarContainer.style.right = "auto";
        },

        locale: {
            rangeSeparator: " - "
        },

        defaultDate: defaultDateRange
            ? [new Date(defaultDateRange.start), new Date(defaultDateRange.end)]
            : undefined,

        prevArrow: '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.25 6L9 12.25L15.25 18.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        nextArrow: '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.75 19L15 12.75L8.75 6.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',

        onReady: (selectedDates, dateStr) => {
            const start = getLocalDate(selectedDates[0]);
            const end = getLocalDate(selectedDates[1]);
            selectedDatesRange = start && end ? [start, end] : null;
            dateDisplayElement.value = dateStr.replace("to", "-");
        },

        // Use onValueUpdate for better reliability with 'range' mode
        onValueUpdate: (selectedDates, dateStr) => {
            const start = getLocalDate(selectedDates[0]);
            const end = getLocalDate(selectedDates[1]);
            selectedDatesRange = start && end ? [start, end] : null;
            dateDisplayElement.value = dateStr.replace("to", "-");
        }
    });

    return () => {
        flatpickrInstance?.destroy();
    };
});


let isFirstRun = untrack(() => preventOnChangeOnMount);
let isUpdatingFromParent = false;


$effect(() => {
    if (flatpickrInstance && value?.length === 2) {
        isUpdatingFromParent = true;

        const instance = flatpickrInstance;

        const dateRangeObject = [new Date(value[0]), new Date(value[1])];

        instance.setDate(dateRangeObject, true);
        instance.jumpToDate(dateRangeObject[0]);
        instance.redraw();

        const start = getLocalDate(dateRangeObject[0]);
        const end = getLocalDate(dateRangeObject[1]);
        selectedDatesRange = start && end ? [start, end] : null;

        const dateStr = value
            .map(d => instance.formatDate(new Date(d), "M j"))
            .join(" - ");
        dateDisplayElement.value = dateStr;

        setTimeout(() => {
            isUpdatingFromParent = false;
        }, 0);
    }
});


$effect(() => {
    const dateRange = selectedDatesRange;

    if (onDateRangeChange && !isFirstRun && !isUpdatingFromParent && dateRange) {
        onDateRangeChange(dateRange);
    }

    isFirstRun = false;
});
</script>


<div class={__class_container__computed} bind:this={datepicker}>
    <div class="flex overflow-hidden border border-gray-300 rounded-xl focus-within:border focus-within:border-primary-400">
        <div class="flex items-center justify-center w-14 text-gray-400 border-primary-500 group-focus-within:bg-primary-500 group-focus-within:text-white hover:bg-primary-500 hover:text-white cursor-pointer">
            <CalendarBlank properties="size-5 " />
        </div>

        <input
            class="text-center h-10 w-full border-l-2 border-gray-300 group-focus-within:border-primary-400 bg-white py-2.5 px-2 cursor-pointer font-medium text-gray-700 focus:ring-0 focus:outline-none"
            placeholder="Select dates"
            data-class="flatpickr-right"
            readonly={true}
            bind:this={dateDisplayElement}
        />

    </div>
</div>

<style>
:global(.flatpickr-day.inRange),
:global(.flatpickr-day.inRange.prevMonthDay),
:global(.flatpickr-day.inRange.nextMonthDay) {
    box-shadow: -5px 0 0 var(--color-primary-200), 5px 0 0 var(--color-primary-200);
    border: 1px solid var(--color-primary-200);
}

:global(.flatpickr-day.startRange),
:global(.flatpickr-day.endRange),
:global(.flatpickr-day.startRange.prevMonthDay),
:global(.flatpickr-day.endRange.prevMonthDay),
:global(.flatpickr-day.startRange.nextMonthDay),
:global(.flatpickr-day.endRange.nextMonthDay) {
    background-color: var(--color-primary-500) !important;
    border: 1px solid var(--color-primary-500) !important;

}

:global(.flatpickr-day.startRange),
:global(.flatpickr-day.startRange.prevMonthDay),
:global(.flatpickr-day.startRange.nextMonthDay) {
    box-shadow: 5px 0 0 var(--color-primary-500), 5px 0 0 var(--color-primary-500) !important;
    border: 1px solid var(--color-primary-500);
    z-index: 1;
}

:global(.flatpickr-day.endRange),
:global(.flatpickr-day.endRange.prevMonthDay),
:global(.flatpickr-day.endRange.nextMonthDay) {
    box-shadow: -5px 0 0 var(--color-primary-500), -5px 0 0 var(--color-primary-500) !important;
    z-index: 1;
}

:global(.flatpickr-day.startRange:hover),
:global(.flatpickr-day.endRange:hover) {
    background-color: var(--color-primary-500);
    border: 1px solid var(--color-primary-500);
}

:global(.flatpickr-day.inRange),
:global(.flatpickr-day.inRange.prevMonthDay),
:global(.flatpickr-day.inRange.nextMonthDay) {
    background-color: var(--color-primary-200);
}

:global(.flatpickr-day.inRange.today) {
    background-color: var(--color-primary-400);
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