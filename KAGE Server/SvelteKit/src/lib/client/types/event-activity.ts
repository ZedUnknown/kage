export type EventActivity = {
	/** UTC epoch seconds at the end of each completed one-second bucket. */
	seconds: number[];
	counts: number[];
};
