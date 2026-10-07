<script lang="ts">
	import { openModal } from '#lib/components/ui/dialog.ts';
	// Visual acuity history (spec §8.2 with FIXes). Opened from the Vision panel's "History" button.
	// The table is the primary view; the chart plots logMAR with better vision HIGHER (inverted axis),
	// one line per correction type and eye, with the recorded Snellen value on hover and focus.
	import { buildVaHistory, snellenFor, vaSeries, VA_GROUPS, VA_GROUP_LONG_KEY, type VaGroup, type VaPoint, type VaSeries, type VaVisitInput } from '#lib/exam/va_history.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { tip } from '#lib/components/ui/tooltip.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';
	import { onMount } from 'svelte';

	let {
		context,
		findings,
		onclose
	}: {
		context: { patientId: number; encounterId: number };
		/** This exam's live values (unsaved edits included). */
		findings: Findings;
		onclose: () => void;
	} = $props();
	const { t } = useI18n();
	const long = (g: VaGroup) => t(VA_GROUP_LONG_KEY[g.key]);

	let dialog: HTMLDialogElement;
	let loaded = $state<{ current: { id: number; date: string; visitType: string }; visits: VaVisitInput[] } | null>(null);
	let failed = $state<string | null>(null);
	let on = $state<Record<string, boolean>>(Object.fromEntries(VA_GROUPS.map((g) => [g.key, g.defaultOn])));
	let focus = $state<{ s: VaSeries; p: VaPoint } | null>(null);

	onMount(() => {
		openModal(dialog); // focus returns to the History button when it closes
		const ctrl = new AbortController();
		fetch(`/api/patients/${context.patientId}/encounters/${context.encounterId}/va-history`, { signal: ctrl.signal })
			.then(async (r) => {
				if (!r.ok) throw new Error(t('sections.vahServerAnswered', { status: r.status }));
				loaded = await r.json();
			})
			.catch((e: Error) => {
				if (e.name !== 'AbortError') failed = e.message;
			});
		return () => ctrl.abort();
	});

	const history = $derived(
		loaded ? buildVaHistory({ ...loaded.current, findings }, loaded.visits) : null
	);
	const series = $derived(history ? vaSeries(history) : []);
	const shown = $derived(series.filter((s) => on[s.group.key]));

	// ---------- chart geometry (SVG user units; the SVG scales to its box) ----------
	const W = 720;
	const H = 300;
	const PAD = { l: 92, r: 16, t: 14, b: 44 };
	const plotW = W - PAD.l - PAD.r;
	const plotH = H - PAD.t - PAD.b;
	const n = $derived(history?.visits.length ?? 0);
	const x = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
	const domain = $derived.by(() => {
		const vals = shown.flatMap((s) => s.points.map((p) => p.logmar));
		const lo = Math.min(-0.1, ...vals.map((v) => Math.floor((v - 0.05) * 10) / 10));
		const hi = Math.max(1.0, ...vals.map((v) => Math.ceil((v + 0.05) * 10) / 10));
		return { lo, hi };
	});
	/** Inverted: the smallest logMAR (best vision) sits at the top. */
	const y = (v: number) => PAD.t + ((v - domain.lo) / (domain.hi - domain.lo)) * plotH;
	const TICKS = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.3, 1.6, 1.9, 2.3, 2.7, 3.0];
	const ticks = $derived.by(() => {
		const out: number[] = [];
		for (const t of TICKS.filter((t) => t >= domain.lo - 1e-9 && t <= domain.hi + 1e-9)) {
			if (!out.length || y(t) - y(out[out.length - 1]) >= 16) out.push(t);
		}
		return out;
	});
	/** Date labels thin out so they never overlap. */
	const labelEvery = $derived(Math.max(1, Math.ceil(n / 8)));

	const DASH: Record<VaGroup['key'], string> = { SC: '', CC: '7 4', PH: '2 3', AR: '10 3 2 3', MR: '', CR: '4 4', CTL: '1 2' };
	const SHAPE: Record<VaGroup['key'], 'circle' | 'square' | 'diamond' | 'triangle'> = {
		SC: 'circle',
		CC: 'square',
		PH: 'diamond',
		AR: 'triangle',
		MR: 'circle',
		CR: 'square',
		CTL: 'diamond'
	};
	const HOLLOW = new Set(['MR', 'CR', 'PH']);

	/** Line path for one series; a visit without a value breaks the line (a gap). */
	function path(s: VaSeries): string {
		let d = '';
		let prev = -2;
		for (const p of s.points) {
			d += `${p.visitIndex === prev + 1 ? 'L' : 'M'}${x(p.visitIndex).toFixed(1)},${y(p.logmar).toFixed(1)}`;
			prev = p.visitIndex;
		}
		return d;
	}

	const fmt = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));
	const pointLabel = (s: VaSeries, p: VaPoint) => t('sections.vahPointLabel', { group: s.group.label, eye: s.eye, date: p.date, value: p.raw, logmar: fmt(p.logmar) });

	function close() {
		dialog.close();
	}
</script>

{#snippet marker(shape: string, cx: number, cy: number, r: number, hollow: boolean, cls: string)}
	{#if shape === 'circle'}
		<circle class={cls} class:hollow {cx} {cy} {r} />
	{:else if shape === 'square'}
		<rect class={cls} class:hollow x={cx - r} y={cy - r} width={r * 2} height={r * 2} />
	{:else if shape === 'diamond'}
		<path class={cls} class:hollow d="M{cx},{cy - r * 1.3}L{cx + r * 1.3},{cy}L{cx},{cy + r * 1.3}L{cx - r * 1.3},{cy}Z" />
	{:else}
		<path class={cls} class:hollow d="M{cx},{cy - r * 1.3}L{cx + r * 1.2},{cy + r}L{cx - r * 1.2},{cy + r}Z" />
	{/if}
{/snippet}

<dialog bind:this={dialog} class="va-history" aria-labelledby="vah-title" onclose={onclose}>
	<div class="head">
		<h2 id="vah-title">{t('sections.vahTitle')}</h2>
		<button type="button" class="close" onclick={close}>{t('sections.close')}</button>
	</div>

	{#if failed}
		<p class="err" role="alert">{t('sections.vahLoadFailed', { error: failed })}</p>
	{:else if !history}
		<p class="muted" role="status">{t('sections.vahLoading')}</p>
	{:else if history.groups.length === 0}
		<p class="muted">{t('sections.vahEmpty')}</p>
	{:else}
		<p class="help">
			<Msg key="sections.vahHelp">{#snippet better()}<strong>{t('sections.vahHelpBetter')}</strong>{/snippet}</Msg>
		</p>

		<div class="toggles" role="group" aria-label={t('sections.vahLinesShown')}>
			{#each history.groups as g (g.key)}
				<button type="button" class="toggle" aria-pressed={on[g.key]} use:tip={{ text: long(g), describe: false }} onclick={() => (on[g.key] = !on[g.key])}>
					<svg width="34" height="14" aria-hidden="true" class="swatch">
						<line x1="2" y1="7" x2="32" y2="7" stroke-dasharray={DASH[g.key]} />
						{@render marker(SHAPE[g.key], 17, 7, 3.5, HOLLOW.has(g.key), 'mk')}
					</svg>
					{g.label}<span class="visually-hidden"> ({long(g)})</span>
				</button>
			{/each}
			<span class="eyes"><Msg key="sections.vahEyesByColour">{#snippet od()}<span class="eye od">OD</span>{/snippet}{#snippet os()}<span class="eye os">OS</span>{/snippet}</Msg></span>
		</div>

		<figure class="chart eye-ltr">
			<svg viewBox="0 0 {W} {H}" role="group" aria-label={t('sections.vahChartLabel')}>
				{#each ticks as t (t)}
					<line class="grid" class:zero={t === 0} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
					<text class="tick" x={PAD.l - 8} y={y(t) + 4} text-anchor="end">{t.toFixed(1)} · {snellenFor(t)}</text>
				{/each}
				<text class="axis" x="12" y={PAD.t + plotH / 2} transform="rotate(-90 12 {PAD.t + plotH / 2})" text-anchor="middle">{t('sections.vahAxis')}</text>
				{#each history.visits as v, i (v.id)}
					{#if i % labelEvery === 0 || i === n - 1}
						<text class="tick" class:cur={v.current} x={x(i)} y={H - PAD.b + 18} text-anchor="middle">{v.date}</text>
					{/if}
				{/each}
				{#each shown as s (s.id)}
					<g class="series {s.eye.toLowerCase()}">
						<path class="line" d={path(s)} stroke-dasharray={DASH[s.group.key]} />
						{#each s.points as p (p.visitIndex)}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<g
								class="pt"
								role="img"
								tabindex="0"
								aria-label={pointLabel(s, p)}
								onfocus={() => (focus = { s, p })}
								onblur={() => (focus = null)}
								onpointerenter={() => (focus = { s, p })}
								onpointerleave={() => (focus = null)}
							>
								<circle class="hit" cx={x(p.visitIndex)} cy={y(p.logmar)} r="14" />
								{@render marker(SHAPE[s.group.key], x(p.visitIndex), y(p.logmar), 4, HOLLOW.has(s.group.key), 'mk')}
							</g>
						{/each}
					</g>
				{/each}
				{#if focus}
					{@const fx = Math.min(Math.max(x(focus.p.visitIndex), PAD.l + 90), W - PAD.r - 90)}
					{@const fy = y(focus.p.logmar) > PAD.t + 40 ? y(focus.p.logmar) - 30 : y(focus.p.logmar) + 14}
					<g class="tip" aria-hidden="true">
						<rect x={fx - 90} y={fy} width="180" height="22" rx="4" />
						<text x={fx} y={fy + 15} text-anchor="middle">{focus.s.group.label} {focus.s.eye} · {focus.p.raw} · {focus.p.date}</text>
					</g>
				{/if}
			</svg>
			{#if shown.length === 0}
				<figcaption class="muted">{t('sections.vahAllOff')}</figcaption>
			{/if}
		</figure>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table-wrap" role="region" aria-label={t('sections.vahTableRegion')} tabindex="0">
			<table class="eye-ltr">
				<caption class="visually-hidden">{t('sections.vahTableCaption')}</caption>
				<thead>
					<tr>
						<th scope="col" rowspan="2">{t('sections.vahVisit')}</th>
						{#each history.groups as g (g.key)}
							<th scope="colgroup" colspan="2"><span use:tip={{ text: long(g), describe: false }}>{g.label}</span><span class="visually-hidden"> ({long(g)})</span></th>
						{/each}
					</tr>
					<tr>
						{#each history.groups as g (g.key)}
							<th scope="col" class="od">OD</th>
							<th scope="col" class="os">OS</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each history.visits as v (v.id)}
						<tr class:current={v.current}>
							<th scope="row">
								<span class="num">{v.date}</span>
								{#if v.current}<span class="badge">{t('sections.vahThisVisit')}</span>{/if}
							</th>
							{#each history.groups as g (g.key)}
								{#each ['OD', 'OS'] as const as eye (eye)}
									{@const val = v.values[g.key][eye]}
									<!-- logMAR is read with the cell and shown on hover / long-press (never hover-only). -->
									<td class="num"
										><span use:tip={val?.logmar != null ? { text: t('tips.logmar', { value: fmt(val.logmar) }), describe: false } : null}>{val?.raw ?? ''}</span
										>{#if val?.logmar != null}<span class="visually-hidden">, {t('tips.logmar', { value: fmt(val.logmar) })}</span>{/if}</td
									>
								{/each}
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</dialog>

<style>
	.va-history {
		width: min(980px, calc(100vw - 32px));
		max-height: calc(100vh - 32px);
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-3);
		color: var(--text-1);
		box-shadow: var(--shadow-overlay);
	}
	.va-history::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	h2 {
		margin: 0;
		margin-inline-end: auto;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}
	button {
		min-height: max(40px, var(--target-min));
	}
	.help,
	.muted {
		color: var(--text-2);
		margin: 0 0 var(--space-3);
		max-width: var(--measure-prose);
	}
	.err {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.toggles {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-2);
	}
	.toggle[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--text-1);
		font-weight: var(--weight-semibold);
	}
	.toggle[aria-pressed='false'] .swatch {
		opacity: 0.4;
	}
	.swatch line {
		stroke: var(--text-2);
		stroke-width: 2;
	}
	.swatch :global(.mk) {
		fill: var(--text-2);
		stroke: var(--text-2);
	}
	.swatch :global(.mk.hollow) {
		fill: var(--surface-3);
	}
	.eyes {
		color: var(--text-3);
		font-size: var(--text-xs);
		margin-inline-start: auto;
	}
	.eye {
		padding: 1px 6px;
		border-radius: var(--radius-1);
		font-weight: var(--weight-semibold);
	}
	.eye.od {
		color: var(--od);
		background: var(--od-soft);
	}
	.eye.os {
		color: var(--os);
		background: var(--os-soft);
	}
	.chart {
		margin: 0 0 var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-2);
	}
	.chart svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.grid {
		stroke: var(--hairline);
	}
	.grid.zero {
		stroke: var(--text-3);
		stroke-dasharray: 3 3;
	}
	.tick,
	.axis {
		fill: var(--text-3);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.tick.cur {
		fill: var(--text-1);
		font-weight: var(--weight-semibold);
	}
	.line {
		fill: none;
		stroke-width: 2;
	}
	.od .line,
	.od :global(.mk) {
		stroke: var(--od);
	}
	.os .line,
	.os :global(.mk) {
		stroke: var(--os);
	}
	.od :global(.mk) {
		fill: var(--od);
	}
	.os :global(.mk) {
		fill: var(--os);
	}
	.series :global(.mk.hollow) {
		fill: var(--surface-1);
		stroke-width: 2;
	}
	.pt {
		cursor: default;
		outline: none;
	}
	.pt .hit {
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
		font-size: 12px;
		font-weight: var(--weight-semibold);
	}
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-1);
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--hairline);
		text-align: start;
		white-space: nowrap;
		height: var(--row-height);
	}
	thead th {
		background: var(--surface-2);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	th.od {
		color: var(--od);
	}
	th.os {
		color: var(--os);
	}
	tbody th {
		font-weight: var(--weight-regular);
	}
	tr.current {
		background: var(--accent-soft);
	}
	.badge {
		margin-inline-start: var(--space-1);
		font-size: var(--text-xs);
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}
</style>
