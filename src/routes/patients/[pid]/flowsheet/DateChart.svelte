<script lang="ts">
	// Flow sheet chart "by date" (spec §8.3 with FIXes): IOP OD/OS (applanation, else Tono-Pen) and the
	// target in force per eye, over real time; VF / OCT / gonioscopy "performed" markers in a strip below,
	// aligned by date. Missing readings are gaps. y is mmHg from 0 (at least 35).
	import type { FlowMarker, FlowVisit, MarkerKind } from '#lib/server/flowsheet.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { tip as tipAction } from '#lib/components/ui/tooltip.ts';
	import { glossary } from '#lib/i18n/glossary.ts';
	import { dateScale, dateTicks, iopMax, segments } from './chart.ts';
	import { MARKER_KIND_KEY, METHOD_LONG_KEY } from './labels.ts';

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
	const { t } = useI18n();

	const uid = $props.id();
	const W = 720;
	const PAD = { l: 44, r: 20 };
	const TOP = 28;
	const BOTTOM = 236;
	const STRIP: Record<MarkerKind, number> = { VF: 258, OCT: 276, GONIO: 294 };
	const H = 334;
	const kindLabel = (k: MarkerKind) => t(MARKER_KIND_KEY[k]);

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

	function label(v: FlowVisit, eye: 'OD' | 'OS'): string {
		const r = v.iop[eye]!;
		const params = {
			date: v.current ? t('flowsheet.thisVisitDate', { date: v.date }) : v.date,
			eye,
			value: r.value,
			method: t(METHOD_LONG_KEY[r.method]),
			target: v.target[eye]
		};
		return r.value > v.target[eye] ? t('flowsheet.datePointHigh', params) : t('flowsheet.datePoint', params);
	}
	const markerLabel = (m: FlowMarker) =>
		m.kind !== 'GONIO'
			? t('flowsheet.markerPerformedOpen', { kind: kindLabel(m.kind), date: m.date })
			: t('flowsheet.markerPerformed', { kind: kindLabel(m.kind), date: m.date });
	let tip = $state<{ x: number; y: number; text: string } | null>(null);
</script>

<!-- The key is read out too (with how each line looks); OD and OS differ by marker shape and the
     targets by dash length, not only by colour (WCAG 1.4.1). -->
<ul class="legend" aria-label={t('flowsheet.legendLabel')}>
	<li use:tipAction={{ text: t('flowsheet.legendIopOd'), describe: false }}><svg width="28" height="12" aria-hidden="true"><line class="iop od" x1="2" x2="26" y1="6" y2="6" /><circle class="mk od" cx="14" cy="6" r="3.5" /></svg>{t('flowsheet.iopOd')}<span class="visually-hidden">: {t('flowsheet.legendIopOd')}</span></li>
	<li use:tipAction={{ text: t('flowsheet.legendIopOs'), describe: false }}><svg width="28" height="12" aria-hidden="true"><line class="iop os" x1="2" x2="26" y1="6" y2="6" /><rect class="mk os" x="10.5" y="2.5" width="7" height="7" /></svg>{t('flowsheet.iopOs')}<span class="visually-hidden">: {t('flowsheet.legendIopOs')}</span></li>
	<li use:tipAction={{ text: t('flowsheet.legendTargetOd'), describe: false }}><svg width="28" height="12" aria-hidden="true"><line class="target od" x1="2" x2="26" y1="6" y2="6" /></svg>{t('flowsheet.targetOd')}<span class="visually-hidden">: {t('flowsheet.legendTargetOd')}</span></li>
	<li use:tipAction={{ text: t('flowsheet.legendTargetOs'), describe: false }}><svg width="28" height="12" aria-hidden="true"><line class="target os" x1="2" x2="26" y1="6" y2="6" /></svg>{t('flowsheet.targetOs')}<span class="visually-hidden">: {t('flowsheet.legendTargetOs')}</span></li>
	<li use:tipAction={{ text: t('flowsheet.legendTest'), describe: false }}><svg width="14" height="12" aria-hidden="true"><rect class="bar" x="4" y="1" width="6" height="10" /></svg>{t('flowsheet.testPerformed')}<span class="visually-hidden">: {t('flowsheet.legendTest')}</span></li>
</ul>
<svg class="eye-ltr" viewBox="0 0 {W} {H}" role="group" aria-label={t('flowsheet.dateChartLabel')} aria-describedby="{uid}-d">
	<desc id="{uid}-d">{t('flowsheet.dateChartDesc')}</desc>
	{#each yTicks as tick (tick)}
		<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={y(tick)} y2={y(tick)} />
		<text class="tick" x={PAD.l - 6} y={y(tick) + 4} text-anchor="end">{tick}</text>
	{/each}
	<text class="tick" x={PAD.l - 6} y="12" text-anchor="end" use:tipAction={glossary('mmHg', t)}>mmHg</text>
	{#each Object.entries(STRIP) as [k, sy] (k)}
		<text class="tick" x={PAD.l - 6} y={sy + 4} text-anchor="end" use:tipAction={glossary(k, t)}>{kindLabel(k as MarkerKind)}</text>
		<line class="grid" x1={PAD.l} x2={W - PAD.r} y1={sy} y2={sy} />
	{/each}
	{#each xTicks as tick (tick)}
		<text class="tick" x={x(tick)} y={H - 14} text-anchor="middle">{tick}</text>
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
		{@const text = markerLabel(m)}
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
		margin: 0 0 var(--space-1);
		padding: 0;
		list-style: none;
		position: relative;
	}
	.legend li {
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
	/* Target OD long dashes, target OS short dashes: told apart without colour. */
	.target {
		stroke-dasharray: 6 4;
		stroke-width: 1.5;
	}
	.target.os {
		stroke-dasharray: 2 3;
		stroke-width: 2;
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
	/* Windows high contrast: SVG keeps author colours, so give lines and marks system colours; shapes and
	   dashes still tell OD, OS and the targets apart. */
	@media (forced-colors: active) {
		.iop.od,
		.iop.os,
		.target.od,
		.target.os,
		.od .mk,
		.os .mk,
		.mk.od,
		.mk.os,
		.pt.cur .mk {
			stroke: CanvasText;
		}
		.od .mk,
		.os .mk,
		.mk.od,
		.mk.os,
		.bar,
		.hi {
			fill: CanvasText;
		}
		.pt.high .mk {
			stroke: Highlight;
		}
		.grid {
			stroke: GrayText;
		}
		.tick,
		.tip text {
			fill: CanvasText;
		}
		.tip rect {
			fill: Canvas;
			stroke: CanvasText;
		}
		.pt:focus-visible .hit,
		.mark:focus-visible .hit {
			stroke: Highlight;
			fill: none;
		}
	}
</style>
