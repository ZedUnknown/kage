<script lang="ts">
	import { onMount } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import type { EventActivity } from '#lib/client/types/event-activity.ts';

	let host: HTMLDivElement;
	let snapshot = $state<EventActivity | null>(null);
	let connection = $state<'connecting' | 'live' | 'reconnecting'>('connecting');
	let hovered = $state<{ second: number; count: number } | null>(null);
	const total = $derived(snapshot?.counts.reduce((sum, count) => sum + count, 0) ?? 0);
	const peak = $derived(snapshot ? Math.max(0, ...snapshot.counts) : 0);
	const rate = $derived(hovered?.count ?? snapshot?.counts.at(-1));
	const time = new Intl.DateTimeFormat(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	});

	onMount(() => {
		let chart: uPlot | undefined;
		let stopped = false;
		let inFlight = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let controller: AbortController | undefined;
		const styles = getComputedStyle(host);
		const color = (name: string) => styles.getPropertyValue(name).trim();
		const options: uPlot.Options = {
			width: Math.max(1, Math.floor(host.clientWidth)),
			height: Math.max(1, Math.floor(host.clientHeight)),
			padding: [12, 8, 0, 0],
			legend: { show: false },
			select: { show: false, left: 0, top: 0, width: 0, height: 0 },
			cursor: { drag: { x: false, y: false, setScale: false } },
			scales: {
				x: { time: false, range: (_chart, _min, max) => [max - 60, max] },
				y: { range: (_chart, _min, max) => [0, Math.max(5, Math.ceil(max * 1.2))] }
			},
			series: [
				{},
				{
					label: 'Events/s',
					stroke: color('--success'),
					fill: color('--success-surface'),
					width: 1.5,
					points: { show: false }
				}
			],
			axes: [
				{
					size: 24,
					stroke: color('--muted'),
					font: '11px "Segoe UI", sans-serif',
					ticks: { show: false },
					grid: { stroke: color('--line'), width: 1 },
					splits: (_chart, _min, max) =>
						Array.from({ length: 7 }, (_, index) => max - 60 + index * 10),
					values: (plot, splits) =>
						splits.map((second) => {
							const age = Math.round((plot.scales.x.max ?? second) - second);
							return age === 0 ? 'Now' : age + 's';
						})
				},
				{
					size: 38,
					gap: 8,
					stroke: color('--muted'),
					font: '11px "Segoe UI", sans-serif',
					ticks: { show: false },
					grid: { stroke: color('--line'), width: 1 },
					incrs: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
					values: (_chart, splits) => splits.map((value) => String(value))
				}
			],
			hooks: {
				setCursor: [
					(plot) => {
						const index = plot.cursor.idx;
						const second = index == null ? null : plot.data[0][index];
						const count = index == null ? null : plot.data[1][index];
						hovered = second == null || count == null ? null : { second, count };
					}
				]
			}
		};

		async function refresh() {
			if (stopped || inFlight || document.hidden) return;
			inFlight = true;
			controller = new AbortController();
			try {
				const response = await fetch('/api/admin/event-activity', {
					cache: 'no-store',
					signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
				});
				if (response.status === 401) {
					window.location.assign('/auth');
					return;
				}
				if (!response.ok) throw new Error('Event activity unavailable');
				const activity: EventActivity = await response.json();
				if (stopped) return;
				const data: uPlot.AlignedData = [activity.seconds, activity.counts];
				if (chart) chart.setData(data);
				else {
					options.width = Math.max(1, Math.floor(host.clientWidth));
					options.height = Math.max(1, Math.floor(host.clientHeight));
					chart = new uPlot(options, data, host);
				}
				snapshot = activity;
				connection = 'live';
			} catch {
				if (!stopped) {
					connection = 'reconnecting';
					hovered = null;
				}
			} finally {
				inFlight = false;
				if (!stopped && !document.hidden)
					timer = setTimeout(refresh, connection === 'reconnecting' ? 3000 : 1000);
			}
		}

		const observer = new ResizeObserver(() => {
			const width = Math.floor(host.clientWidth);
			const height = Math.floor(host.clientHeight);
			if (width > 0 && height > 0 && chart && (width !== chart.width || height !== chart.height))
				chart.setSize({ width, height });
		});
		observer.observe(host);
		const visibilityChanged = () => {
			clearTimeout(timer);
			if (!document.hidden) void refresh();
		};
		document.addEventListener('visibilitychange', visibilityChanged);
		void refresh();

		return () => {
			stopped = true;
			clearTimeout(timer);
			controller?.abort();
			observer.disconnect();
			document.removeEventListener('visibilitychange', visibilityChanged);
			chart?.destroy();
		};
	});
</script>

<section class="event-activity" aria-labelledby="event-activity-title">
	<header>
		<h2 id="event-activity-title">Event activity</h2>
		<span class="connection" class:interrupted={connection !== 'live'} role="status">
			<span class="dot" aria-hidden="true"></span>
			{connection === 'live' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Reconnecting'}
		</span>
	</header>
	<div class="readings">
		<dl>
			<div>
				<dt>{hovered ? time.format(new Date(hovered.second * 1000)) : 'Latest second'}</dt>
				<dd>{rate ?? '—'}<span>events/s</span></dd>
			</div>
			<div>
				<dt>Last 60 s</dt>
				<dd>{snapshot ? total : '—'}</dd>
			</div>
			<div>
				<dt>Peak</dt>
				<dd>{snapshot ? peak : '—'}<span>/s</span></dd>
			</div>
		</dl>
	</div>
	<div class="plot-shell" class:stale={connection === 'reconnecting'}>
		<div class="plot" bind:this={host} aria-hidden="true"></div>
		{#if !snapshot}
			<p class="placeholder">
				{connection === 'connecting'
					? 'Loading event activity…'
					: 'Event activity unavailable. Retrying…'}
			</p>
		{/if}
	</div>
	<p class="sr-only">
		Event counts per second over the last 60 seconds.
		{#if snapshot}Latest second: {snapshot.counts.at(-1)} events. Total: {total}. Peak: {peak} events
			per second.{/if}
	</p>
	{#if snapshot && connection === 'reconnecting'}
		<p class="paused">Updates interrupted. Displaying the last received window.</p>
	{/if}
</section>

<style>
	.event-activity {
		display: flex;
		flex-direction: column;
		height: var(--dashboard-panel-height, 280px);
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 20px 0;
	}
	h2 {
		margin: 0;
		font-size: 14px;
	}
	.connection {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 3px 8px;
		border: 1px solid var(--success-border);
		border-radius: 999px;
		background: var(--success-surface);
		color: var(--success);
		font-size: 10px;
	}
	.connection.interrupted {
		border-color: var(--warning-border);
		background: var(--warning-surface);
		color: var(--warning);
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: currentColor;
	}
	.readings {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 16px;
		padding: 16px 20px 4px;
	}
	dl {
		display: flex;
		flex-shrink: 0;
		gap: 24px;
		margin: 0;
		font-size: 11px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 3px 0 0;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	dd span {
		margin-left: 2px;
		color: var(--muted);
		font-size: 11px;
	}
	.plot-shell {
		flex: 1;
		min-height: 100px;
		position: relative;
		margin: 4px 12px 10px;
	}
	.plot {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.plot :global(.u-cursor-x),
	.plot :global(.u-cursor-y) {
		border-color: var(--muted);
	}
	.stale .plot {
		position: absolute;
		inset: 0;
		opacity: 0.5;
	}
	.placeholder {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 20px;
		color: var(--muted);
		text-align: center;
		font-size: 12px;
	}
	.paused {
		margin: 0;
		padding: 0 20px 14px;
		color: var(--warning);
		font-size: 11px;
	}
	@media (max-width: 600px) {
		header {
			padding: 16px 16px 0;
		}
		.readings {
			padding: 14px 16px 4px;
		}
		dl {
			gap: 16px;
		}
		.plot-shell {
			margin-right: 8px;
			margin-left: 8px;
		}
	}
</style>
