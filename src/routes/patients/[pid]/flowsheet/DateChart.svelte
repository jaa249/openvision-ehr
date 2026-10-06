<script lang="ts">
	// Flow sheet chart "by date" (spec §8.3 with FIXes): IOP OD/OS (applanation, else Tono-Pen) and the
	// target in force per eye, over real time; VF / OCT / gonioscopy "performed" markers in a strip below,
	// aligned by date. Missing readings are gaps. y is mmHg from 0 (at least 35).
	import type { FlowMarker, FlowVisit, MarkerKind } from '#lib/server/flowsheet.ts';
	import { dateScale, dateTicks, iopMax, segments } from './chart.ts';

	let {
		visits,
		markers,
		dates,
		onmarker
	}: {
		visits: FlowVisit[];
		markers: FlowMarker[];
		dates: string[];
		/** Open a VF / OCT document from its marker. */
		onmarker?: (m: FlowMarker) => void;
	} = $props();

	const uid = $props.id();
	const W = 720;
	const PAD = { l: 44, r: 20 };
	const TOP = 28;
	const BOTTOM = 236;
	const STRIP: Record<MarkerKind, number> = { VF: 258, OCT: 276, GONIO: 294 };
	const H = 334;
	const KIND_LABEL: Record<MarkerKind, string> = { VF: 'VF', OCT: 'OCT', GONIO: 'Gonio' };

	const x = $derived(dateScale(dates, PAD.l + 24, W - PAD.r - 24));
	const ymax = $derived(iopMax(visits.flatMap((v) => [v.iop.OD?.value, v.iop.OS?.value, v.target.OD, v.target.OS].filter((n): n is number => n != null))));
	const y = (v: number) => BOTTOM - (v / ymax) * (BOTTOM - TOP);
	const yTicks = $derived(Array.from({ length: ymax / 5 + 1 }, (_, i) => i * 5));
	const xTicks = $derived(dateTicks(dates, x));

	type P = { x: number; y: number; v: FlowVisit };
	function line(eye: 'OD' | 'OS', kind: 'iop' | 'target'): P[][] {
		return segments(
			visits.map((v) => {
				const val = kind === 'iop' ? v.iop[eye]?.value : v.target[eye];
				return val == null ? null : { x: x(v.date), y: y(val), v };
			})
		);
	}
	const d = (seg: P[]) => seg.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
	const lines = $derived({
		iopOD: line('OD', 'iop'),
		iopOS: line('OS', 'iop'),
		tOD: line('OD', 'target'),
		tOS: line('OS', 'target')
	});

	const METHOD = { AP: 'applanation', TPN: 'Tono-Pen' } as const;
	function label(v: FlowVisit, eye: 'OD' | 'OS'): string {
		const r = v.iop[eye]!;
		const high = r.value > v.target[eye] ? ', above target' : '';
		return `${v.date}${v.current ? ' (this visit)' : ''}: IOP ${eye} ${r.value} mmHg by ${METHOD[r.method]}, target ${v.target[eye]}${high}`;
	}
	let tip = $state<{ x: number; y: number; text: string } | null>(null);
</script>

<div class="legend" aria-hidden="true">
	<span><svg width="28" height="12"><line class="iop od" x1="2" x2="26" y1="6" y2="6" /><circle class="mk od" cx="14" cy="6" r="3.5" /></svg>IOP OD</span>
	<span><svg width="28" height="12"><line class="iop os" x1="2" x2="26" y1="6" y2="6" /><rect class="mk os" x="10.5" y="2.5" width="7" height="7" /></svg>IOP OS</span>
	<span><svg width="28" height="12"><line class="target od" x1="2" x2="26" y1="6" y2="6" /></svg>Target OD</span>
	<span><svg width="28" height="12"><line class="target os" x1="2" x2="26" y1="6" y2="6" /></svg>Target OS</span>
	<span><svg width="14" height="12"><rect class="bar" x="4" y="1" width="6" height="10" /></svg>Test performed</span>
</div>
<svg viewBox="0 0 {W} {H}" role="group" aria-label="IOP by date chart. The same values are in the table below." aria-describedby="{uid}-d">
	<desc id="{uid}-d">Lines for IOP and target per eye; a gap means no reading at that visit. Markers below show visual field, OCT and gonioscopy dates.</desc>
	{#each yTicks as t (t)}
		<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
		<text class="tick" x={PAD.l - 6} y={y(t) + 4} text-anchor="end">{t}</text>
	{/each}
	<text class="tick" x={PAD.l - 6} y="12" text-anchor="end">mmHg</text>
	{#each Object.entries(STRIP) as [k, sy] (k)}
		<text class="tick" x={PAD.l - 6} y={sy + 4} text-anchor="end">{KIND_LABEL[k as MarkerKind]}</text>
		<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={sy} y2={sy} />
	{/each}
	{#each xTicks as t (t)}
		<text class="tick" x={x(t)} y={H - 14} text-anchor="middle">{t}</text>
	{/each}

	{#each lines.tOD as seg, i (i)}<path class="target od" d={d(seg)} />{/each}
	{#each lines.tOS as seg, i (i)}<path class="target os" d={d(seg)} />{/each}
	{#each lines.iopOD as seg, i (i)}<path class="iop od" d={d(seg)} />{/each}
	{#each lines.iopOS as seg, i (i)}<path class="iop os" d={d(seg)} />{/each}

	{#each visits as v (v.id)}
		{#each ['OD', 'OS'] as const as eye (eye)}
			{@const r = v.iop[eye]}
			{#if r}
				{@const px = x(v.date)}
				{@const py = y(r.value)}
				{@const text = label(v, eye)}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<g
					class="pt {eye.toLowerCase()}"
					class:high={r.value > v.target[eye]}
					class:cur={v.current}
					role="img"
					tabindex="0"
					aria-label={text}
					onfocus={() => (tip = { x: px, y: py, text })}
					onblur={() => (tip = null)}
					onpointerenter={() => (tip = { x: px, y: py, text })}
					onpointerleave={() => (tip = null)}
				>
					<circle class="hit" cx={px} cy={py} r="13" />
					{#if eye === 'OD'}
						<circle class="mk" cx={px} cy={py} r={v.current ? 5.5 : 4} />
					{:else}
						<rect class="mk" x={px - (v.current ? 5 : 3.5)} y={py - (v.current ? 5 : 3.5)} width={v.current ? 10 : 7} height={v.current ? 10 : 7} />
					{/if}
					{#if r.value > v.target[eye]}<text class="hi" x={px + 7} y={py - 6}>▲</text>{/if}
				</g>
			{/if}
		{/each}
	{/each}

	{#each markers as m (`${m.kind}-${m.ref}`)}
		{@const text = `${KIND_LABEL[m.kind]} performed ${m.date}${m.kind !== 'GONIO' ? '. Press to open.' : ''}`}
		{#if m.kind === 'GONIO' || !onmarker}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<g class="mark" role="img" tabindex="0" aria-label={text}
				onfocus={() => (tip = { x: x(m.date), y: STRIP[m.kind] - 6, text })}
				onblur={() => (tip = null)}
				onpointerenter={() => (tip = { x: x(m.date), y: STRIP[m.kind] - 6, text })}
				onpointerleave={() => (tip = null)}>
				<rect class="hit" x={x(m.date) - 10} y={STRIP[m.kind] - 9} width="20" height="18" />
				<rect class="bar" x={x(m.date) - 3} y={STRIP[m.kind] - 7} width="6" height="14" />
			</g>
		{:else}
			<g class="mark link" role="button" tabindex="0" aria-label={text}
				onclick={() => onmarker?.(m)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onmarker?.(m))}
				onfocus={() => (tip = { x: x(m.date), y: STRIP[m.kind] - 6, text })}
				onblur={() => (tip = null)}
				onpointerenter={() => (tip = { x: x(m.date), y: STRIP[m.kind] - 6, text })}
				onpointerleave={() => (tip = null)}>
				<rect class="hit" x={x(m.date) - 10} y={STRIP[m.kind] - 9} width="20" height="18" />
				<rect class="bar" x={x(m.date) - 3} y={STRIP[m.kind] - 7} width="6" height="14" />
			</g>
		{/if}
	{/each}

	{#if tip}
		{@const w = Math.min(460, tip.text.length * 6.4 + 16)}
		{@const tx = Math.min(Math.max(tip.x - w / 2, 2), W - w - 2)}
		{@const ty = tip.y > TOP + 34 ? tip.y - 34 : tip.y + 12}
		<g class="tip" aria-hidden="true">
			<rect x={tx} y={ty} width={w} height="22" rx="4" />
			<text x={tx + w / 2} y={ty + 15} text-anchor="middle">{tip.text}</text>
		</g>
	{/if}
</svg>

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
	.grid {
		stroke: var(--hairline);
	}
	.tick {
		fill: var(--text-3);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.iop,
	.target {
		fill: none;
		stroke-width: 2;
	}
	.target {
		stroke-dasharray: 6 4;
		stroke-width: 1.5;
	}
	.od.iop,
	.od.target,
	.od .mk,
	.mk.od {
		stroke: var(--od);
	}
	.os.iop,
	.os.target,
	.os .mk,
	.mk.os {
		stroke: var(--os);
	}
	.od .mk,
	.mk.od {
		fill: var(--od);
	}
	.os .mk,
	.mk.os {
		fill: var(--os);
	}
	.pt.high .mk {
		stroke: var(--abnormal);
		stroke-width: 2;
	}
	.hi {
		fill: var(--abnormal);
		font-size: 10px;
	}
	.pt.cur .mk {
		stroke: var(--text-1);
		stroke-width: 1.5;
	}
	.pt,
	.mark {
		outline: none;
	}
	.mark.link {
		cursor: pointer;
	}
	.hit {
		fill: transparent;
	}
	.pt:focus-visible .hit,
	.mark:focus-visible .hit {
		stroke: var(--focus-ring);
		stroke-width: 2;
		fill: var(--accent-soft);
	}
	.bar {
		fill: var(--text-2);
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
