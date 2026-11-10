<script lang="ts">
    import DateRangePicker from "./DateRangePicker.svelte";
    import { getLocalDate } from "$lib/utils/datetime";
	import CalendarBlank from "../icons/CalendarBlank.svelte";

    const now = new Date();

    let _today = getLocalDate(now);
    let _thisWeekStart = getLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));
    let _thisWeekEnd = getLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay())));
    let _thisMonthStart = getLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
    let _thisMonthEnd = getLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    let _lastMonthStart = getLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    let _lastMonthEnd = getLocalDate(new Date(now.getFullYear(), now.getMonth(), 0));

    console.log('Today:', _today);
    console.log('This Week:', _thisWeekStart, 'to', _thisWeekEnd);
    console.log('This Month:', _thisMonthStart, 'to', _thisMonthEnd);
    console.log('Last Month:', _lastMonthStart, 'to', _lastMonthEnd);

    let {
        today = [_today, _today],
        thisWeek = [_thisWeekStart, _thisWeekEnd],
        thisMonth = [_thisMonthStart, _thisMonthEnd],
        lastMonth = [_lastMonthStart, _lastMonthEnd],

        defaultSelectedRange = today,

        onCloseTrigger = () => {},
        onDateRangeChange = () => {},
        onApply = () => {},

    }: {
        today?: [string, string]; // Repeat the date to keep the [start, end] shape.
        thisWeek?: [string, string];
        thisMonth?: [string, string];
        lastMonth?: [string, string];
        defaultSelectedRange?: [string, string];
        onCloseTrigger?: () => void;
        onDateRangeChange?: (range: [string, string]) => void;
        onApply?: (range: [string, string]) => void;
    } = $props();


    let selectedRange: [string, string] = $state(defaultSelectedRange);

    let selectableRanges = $derived([
        {
            label: "Today",
            range: today
        },
        {
            label: "This Week",
            range: thisWeek
        },
        {
            label: "This Month",
            range: thisMonth
        },
        {
            label: "Last Month",
            range: lastMonth
        }
    ]);

</script>


<div
    class="absolute inset-0 flex items-center justify-center font-primary z-100 text-black bg-black/20 backdrop-blur-xs"
    onmousedown={(e) => {
        if (e.target === e.currentTarget) {
            onCloseTrigger();
        }
    }}
    role="button"
    tabindex="0"
    onkeydown={(e) => {}}
>
	<div class="w-full min-h-screen flex flex-col text-center pointer-events-none">
        <div class="my-auto flex flex-col justify-center items-center">

            <div class="flex flex-col gap-5 px-6 py-4 pointer-events-auto form-container relative sm:max-w-md w-full bg-white border border-b-2 border-gray-300 rounded-xl shadow-lg backdrop-blur-xs">

                <div>
                    <div class="text-left text-lg font-bold mb-4">
                        Select Range
                    </div>

                    <div class="flex flex-col gap-2.5">
                        {#each selectableRanges as item, _ (_) }
                            {@const active = selectedRange && item.range && selectedRange[0] === item.range[0] && selectedRange[1] === item.range[1]}
                            <button
                                class="
                                    flex items-center justify-between gap-1.5 text-gray-800 bg-white border border-gray-300
                                    text-xs font-bold rounded-md transition-all duration-200
                                    outline-none cursor-pointer px-4 py-2.5 text-left w-full hover:bg-primary-50 hover:border-primary-400
                                    focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                                    active:scale-[98.5%] active:bg-primary-100 overflow-hidden
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
                                    {active ? 'bg-primary-50 border-primary-400' : ''}
                                "
                                onclick={() => {
                                    selectedRange = item.range;
                                }}
                            >
                                <div class="flex items-center gap-2">
                                    <CalendarBlank properties="size-4" />
                                    <span>{item.label}</span>
                                </div>
                                <div class="text-gray-400 font-normal text-right">{item.range ? `${item.range[0]} → ${item.range[1]}` : ''}</div>
                            </button>
                        {/each}
                    </div>
                </div>

                <div>
                    <div class="text-left text-sm font-bold text-gray-600 mb-4">
                        Custom Range
                    </div>

                    <div class="relative flex gap-3 items-center justify-between w-full">
                        <DateRangePicker
                            bind:value={selectedRange}
                            onDateRangeChange={(dateRange) => {
                                if (!dateRange || dateRange.length !== 2) return;
                                selectedRange =  [...dateRange];
                                onDateRangeChange(selectedRange);
                            }}
                            position={[-420, -310]}
                            __class_container__="flex-1 max-w-full [&>div]:w-full"
                        />
                    </div>
                </div>


                <button
                    class="
                        flex items-center justify-center gap-1.5 tracking-wider
                        w-full rounded-xl font-semibold text-sm py-2.5 bg-primary-500 hover:bg-primary-600 text-white
                        border border-b-2 border-primary-600 hover:border-primary-700 transition duration-200
                        active:scale-98 disabled:bg-gray-300 disabled:border-gray-400 disabled:text-gray-500
                        disabled:pointer-events-none
                    "
                    type="button"
                    aria-label="Apply date range"
                    disabled={selectedRange ? false : true}
                    onclick={() => {
                        if (selectedRange) {
                            onApply(selectedRange);
                            onCloseTrigger();
                        }
                    }}
                >
                    Apply
                </button>
            </div>
        </div>
    </div>
</div>