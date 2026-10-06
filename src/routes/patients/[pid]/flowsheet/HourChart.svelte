<script lang="ts">
	// Flow sheet chart "by hour" (spec §8.3): each visit's IOP OD / OS against the time of day it was
	// measured, to show diurnal variation. Hours print as "08:30" (FIX). Visits without a time are left out.
	import type { FlowVisit } from '#lib/server/flowsheet.ts';
	import { fmtHour, hourDomain, hourTicks, iopMax } from './chart.ts';

	let { visits }: { visits: FlowVisit[] } = $props();

	const W = 720;
	const H = 274;
	const PAD = { l: 44, r: 20, t: 28, b: 40 };
	const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
	const timed = $derived(visits.filter((v) => v.time && (v.iop.OD || v.iop.OS)));
	const domain = $derived(hourDomain(timed.map((v) => mins(v.time!))));
	const x = (m: number) => PAD.l + ((m - domain[0]) / (domain[1] - domain[0])) * (W - PAD.l - PAD.r);
	const ymax = $derived(iopMax(timed.flatMap((v) => [v.iop.OD?.value, v.iop.OS?.value].filter((n): n is number => n != null))));
	const y = (v: number) => H - PAD.b - (v / ymax) * (H - PAD.t - PAD.b);
	const yTicks = $derived(Array.from({ length: ymax / 5 + 1 }, (_, i) => i * 5));
	let tip = $state<{ x: number; y: number; text: string } | null>(null);
</script>

{#if timed.length === 0}
	<p class="empty">No IOP readings with a time recorded yet.</p>
{:else}
	<div class="legend" aria-hidden="true">
		<span><svg width="12" height="12"><circle class="mk od" cx="6" cy="6" r="4" /></svg>OD</span>
		<span><svg width="12" height="12"><rect class="mk os" x="2" y="2" width="8" height="8" /></svg>OS</span>
		<span>Larger mark = this visit</span>
	</div>
	<svg viewBox="0 0 {W} {H}" role="group" aria-label="IOP by time of day chart. The same values are in the table below.">
		{#each yTicks as t (t)}
			<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
			<text class="tick" x={PAD.l - 6} y={y(t) + 4} text-anchor="end">{t}</text>
		{/each}
		<text class="tick" x={PAD.l - 6} y="12" text-anchor="end">mmHg</text>
		{#each hourTicks(domain) as t (t)}
			<line class="grid v" x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} />
			<text class="tick" x={x(t)} y={H - PAD.b + 18} text-anchor="middle">{fmtHour(t)}</text>
		{/each}
		{#each timed as v (v.id)}
			{#each ['OD', 'OS'] as const as eye (eye)}
				{@const r = v.iop[eye]}
				{#if r}
					{@const px = x(mins(v.time!))}
					{@const py = y(r.value)}
					{@const text = `${v.time} on ${v.date}${v.current ? ' (this visit)' : ''}: IOP ${eye} ${r.value} mmHg`}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<g class="pt {eye.toLowerCase()}" class:cur={v.current} role="img" tabindex="0" aria-label={text}
						onfocus={() => (tip = { x: px, y: py, text })}
						onblur={() => (tip = null)}
						onpointerenter={() => (tip = { x: px, y: py, text })}
						onpointerleave={() => (tip = null)}>
						<circle class="hit" cx={px} cy={py} r="13" />
						{#if eye === 'OD'}
							<circle class="mk" cx={px} cy={py} r={v.current ? 6 : 4} />
						{:else}
							<rect class="mk" x={px - (v.current ? 5.5 : 3.5)} y={py - (v.current ? 5.5 : 3.5)} width={v.current ? 11 : 7} height={v.current ? 11 : 7} />
						{/if}
					</g>
				{/if}
			{/each}
		{/each}
		{#if tip}
			{@const w = Math.min(420, tip.text.length * 6.4 + 16)}
			{@const tx = Math.min(Math.max(tip.x - w / 2, 2), W - w - 2)}
			{@const ty = tip.y > PAD.t + 34 ? tip.y - 34 : tip.y + 12}
			<g class="tip" aria-hidden="true">
				<rect x={tx} y={ty} width={w} height="22" rx="4" />
				<text x={tx + w / 2} y={ty + 15} text-anchor="middle">{tip.text}</text>
			</g>
		{/if}
	</svg>
{/if}

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-2);
		margin-bottom: var(--space-1);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.legend svg {
		width: auto;
		display: inline;
	}
	.empty {
		color: var(--text-2);
		margin: 0;
	}
	.grid {
		stroke: var(--hairline);
	}
	.grid.v {
		stroke-dasharray: 2 4;
	}
	.tick {
		fill: var(--text-3);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.od .mk,
	.mk.od {
		fill: var(--od);
		stroke: var(--od);
	}
	.os .mk,
	.mk.os {
		fill: var(--os);
		stroke: var(--os);
	}
	.pt.cur .mk {
		stroke: var(--text-1);
		stroke-width: 1.5;
	}
	.pt {
		outline: none;
	}
	.hit {
		fill: transparent;
	}
	.pt:focus-visible .hit {
		stroke: var(--focus-ring);
		stroke-width: 2;
		fill: var(--accent-soft);
	}
	.tip rect {
		fill: var(--surface-3);
		stroke: var(--text-3);
	}
	.tip text {
		fill: var(--text-1);
		font-size: 11px;
		font-weight: var(--weight-semibold);
	}
</style>
