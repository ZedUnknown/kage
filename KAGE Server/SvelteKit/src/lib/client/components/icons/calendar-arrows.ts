export const calendarArrowPaths = {
	previous: 'M15.25 6L9 12.25L15.25 18.5',
	next: 'M8.75 19L15 12.75L8.75 6.5'
} as const;

function arrow(path: string) {
	return `<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Flatpickr requires SVG markup strings, so keep its navigation arrow paths centralized here.
export const calendarArrows = {
	prevArrow: arrow(calendarArrowPaths.previous),
	nextArrow: arrow(calendarArrowPaths.next)
};
