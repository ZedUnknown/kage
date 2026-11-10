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

	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.min.css';
	import './flatpickr.css';

	import CalendarBlank from '../icons/CalendarBlank.svelte';
	import { onMount } from 'svelte';
	import { getLocalDate } from '$lib/utils/datetime';

	let datepicker: HTMLInputElement;
	let dateDisplayElement: HTMLInputElement;

	let selectedDate = $state(null);

	onMount(() => {
		flatpickr(datepicker, {
			mode: 'single',
			static: true,
			monthSelectorType: 'static',
			dateFormat: 'M j',

			locale: {
				rangeSeparator: ' - '
			},

			defaultDate: new Date(defaultDate),

			prevArrow: '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.25 6L9 12.25L15.25 18.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
			nextArrow: '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.75 19L15 12.75L8.75 6.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',

			onReady: (selectedDates, dateStr, instance) => {
				selectedDate = getLocalDate(selectedDates[0]);
				dateDisplayElement.value = dateStr;
			},

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

<div class="group relative flex max-w-[180px]" bind:this={datepicker}>
	<div
		class="focus-within:border-primary-400 flex overflow-hidden rounded-xl border border-gray-300 focus-within:border-1"
	>
		<div
			class="border-primary-500 group-focus-within:bg-primary-500 hover:bg-primary-500 flex w-14 cursor-pointer items-center justify-center text-gray-400 group-focus-within:text-white hover:text-white"
		>
			<CalendarBlank properties="size-5 " />
		</div>

		<input
			class="group-focus-within:border-primary-400 h-10 w-full cursor-pointer border-l-2 border-gray-300 bg-white py-2.5 pr-4 pl-3 text-center font-medium text-gray-700 focus:ring-0 focus:outline-none"
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
</style>
