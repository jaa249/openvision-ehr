<script lang="ts">
	// Alternate cover test (spec §9.2): four tabs × 11 free-text cells, an Ortho flag, and the builder.
	// FIX: RECORD saves immediately (oncommit) and never recolors other cells; only the selected cell is marked.
	// Open state and last tab are remembered per user (/api/prefs, spec §1.7 ACT_VIEW / ACT_SHOW FIX).
	import { onMount } from 'svelte';
	import {
		COVER_POSITIONS,
		COVER_POSITION_KEY,
		COVER_ZONE_KEY,
		COVER_ZONES,
		DEFAULT_COVER_ZONE,
		DEVIATIONS,
		LATERALITIES,
		LATERALITY_LABEL_KEY,
		PRIMARY_POSITION,
		PRISMS,
		coverId,
		coverIsOrtho,
		recordCell,
		type CoverZone,
		type Laterality
	} from '#lib/exam/sections/neuro.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';
	import { withValues, type CellState } from '../workup/cell.ts';
	import { loadPrefs, savePrefs } from '#lib/prefs/client.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import Abbr from '#lib/components/ui/Abbr.svelte';
	import CodeHint from '#lib/components/ui/CodeHint.svelte';
	import { tip } from '#lib/components/ui/tooltip.ts';
	import { glossary } from '#lib/i18n/glossary.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let {
		findings,
		cell,
		onedit,
		oncommit
	}: {
		findings: Findings;
		cell: (id: string) => CellState;
		onedit: (field: string, value: string) => void;
		oncommit: (next: Findings, changed: string[], label: string) => void;
	} = $props();
	const { t } = useI18n();
	const positionName = (n: number) => t(COVER_POSITION_KEY[n - 1]);

	// ---------- remembered view state (per-user prefs; new users: open, "cc distance") ----------
	let open = $state(true);
	let zone = $state<CoverZone>(DEFAULT_COVER_ZONE);
	onMount(() => {
		loadPrefs().then((p) => {
			open = p['cover.open'];
			if (COVER_ZONES.some((z) => z.key === p['cover.zone'])) zone = p['cover.zone'];
		});
	});
	function remember() {
		void savePrefs({ 'cover.open': open, 'cover.zone': zone });
	}
	function toggle() {
		open = !open;
		remember();
	}
	function pickZone(z: CoverZone) {
		zone = z;
		remember();
	}

	const zoneLabel = $derived(t(COVER_ZONE_KEY[zone].label));
	const filledIn = (z: CoverZone) => COVER_POSITIONS.filter((n) => (findings[coverId(n, z)]?.value ?? '').trim()).length;

	/** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
	function tabKey(e: KeyboardEvent, i: number) {
		const n = COVER_ZONES.length;
		// The next tab is to the right in left-to-right, to the left in right-to-left.
		const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl';
		const [next, prev] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
		const to = e.key === next ? (i + 1) % n : e.key === prev ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
		if (to < 0) return;
		e.preventDefault();
		pickZone(COVER_ZONES[to].key);
		document.getElementById(`cover-tab-${COVER_ZONES[to].key}`)?.focus();
	}

	// ---------- Ortho ----------
	const ortho = $derived(coverIsOrtho(findings));
	function setOrtho(on: boolean) {
		const { next, changed } = withValues(findings, { ACT: on ? 'on' : '' });
		oncommit(next, changed, on ? t('sections.coverUndoOrtho') : t('sections.coverUndoOrthoOff'));
	}

	// ---------- builder ----------
	let selected = $state(PRIMARY_POSITION);
	let laterality = $state<Laterality>('');
	let deviation = $state('');
	let prism = $state('');
	const text = $derived(recordCell(laterality, deviation, prism));
	const targetId = $derived(coverId(selected, zone));

	function pickPrism(p: string) {
		prism = p;
		// Choosing Ortho clears laterality and deviation (§9.2).
		if (p === 'Ortho') {
			laterality = '';
			deviation = '';
		}
	}
	function pickDeviation(d: string) {
		deviation = deviation === d ? '' : d;
		if (deviation && prism === 'Ortho') prism = '';
	}
	function pickLaterality(l: Laterality) {
		laterality = l;
		if (l && prism === 'Ortho') prism = '';
	}

	/**
	 * RECORD: replace the selected cell's text and save now (FIX). Recording a deviation also clears the
	 * Ortho flag, or the report would hide the grid it was just written into.
	 */
	function record() {
		if (!text) return;
		const values: Record<string, string> = { [targetId]: text };
		if (text !== 'Ortho' && ortho) values.ACT = '';
		const { next, changed } = withValues(findings, values);
		oncommit(next, changed, t('sections.coverUndoRecord', { zone: zoneLabel, position: positionName(selected) }));
	}

	const GRID_ROWS: { label: MessageKey; cells: number[] }[] = [
		{ label: 'sections.coverRowUp', cells: [1, 2, 3] },
		{ label: 'sections.coverRowPrimary', cells: [4, 5, 6] },
		{ label: 'sections.coverRowDown', cells: [7, 8, 9] }
	];
</script>

{#snippet coverCell(n: number)}
	{@const id = coverId(n, zone)}
	{@const c = cell(id)}
	<textarea
		rows="2"
		class="act"
		class:primary={n === PRIMARY_POSITION}
		class:selected={n === selected}
		class:ghost={c.ghost}
		class:copied={c.copied}
		data-field={id}
		maxlength="255"
		aria-label={t('sections.coverCellLabel', { zone: zoneLabel, position: positionName(n) })}
		placeholder={n === PRIMARY_POSITION ? t('sections.coverPhPrimary') : n > 9 ? (n === 10 ? t('sections.coverPhRTilt') : t('sections.coverPhLTilt')) : ''}
		value={c.value}
		onfocus={() => (selected = n)}
		oninput={(e) => onedit(id, e.currentTarget.value)}
	></textarea>
{/snippet}

<div class="panel cover" role="group" aria-labelledby="cover-title">
	<div class="card-head">
		<button type="button" class="disclose" aria-expanded={open} aria-controls="cover-body" onclick={toggle}>
			<span class="flip-rtl" aria-hidden="true">{open ? '▾' : '▸'}</span>
			<span id="cover-title">{t('sections.coverTitle')}</span>
		</button>
		<label class="check">
			<input type="checkbox" checked={ortho} onchange={(e) => setOrtho(e.currentTarget.checked)} />
			<span use:tip={{ text: glossary('Ortho', t) ?? '', host: true }}>{t('sections.coverOrtho')}</span> <CodeHint hint="ACT" inline />
		</label>
	</div>

	{#if open}
		<div id="cover-body" class="body">
			<div class="grid-side">
				<div class="tabs" role="tablist" aria-label={t('sections.coverCondition')}>
					{#each COVER_ZONES as z, i (z.key)}
						{@const count = filledIn(z.key)}
						<button
							type="button"
							role="tab"
							id="cover-tab-{z.key}"
							aria-selected={zone === z.key}
							aria-controls="cover-grid"
							tabindex={zone === z.key ? 0 : -1}
							onclick={() => pickZone(z.key)}
							onkeydown={(e) => tabKey(e, i)}
							use:tip={t('tips.coverZone', { zone: t(COVER_ZONE_KEY[z.key].label) })}
						>
							{t(COVER_ZONE_KEY[z.key].short)}{#if count}<span class="count" aria-label={t('sections.coverFilled', { n: count })}>{count}</span>{/if}
						</button>
					{/each}
				</div>
				<div id="cover-grid" class="eye-ltr" role="tabpanel" aria-labelledby="cover-tab-{zone}" class:dimmed={ortho}>
					<div class="axis" aria-hidden="true"><span>R</span><span class="page-dir">{t('sections.coverGaze')}</span><span>L</span></div>
					<div class="cells">
						{#each GRID_ROWS as r (r.label)}
							<span class="rowlabel page-dir" aria-hidden="true">{t(r.label)}</span>
							{#each r.cells as n (n)}{@render coverCell(n)}{/each}
						{/each}
						<span class="rowlabel page-dir" aria-hidden="true">{t('sections.coverRowTilt')}</span>
						{@render coverCell(10)}
						<span class="tilt-gap" aria-hidden="true"></span>
						{@render coverCell(11)}
					</div>
					{#if ortho}<p class="note">{t('sections.coverOrthoNote')}</p>{/if}
				</div>
			</div>

			<div class="builder" role="group" aria-labelledby="builder-title">
				<h4 id="builder-title">{t('sections.coverBuilder')}</h4>
				<div class="opts" role="group" aria-label={t('sections.coverLaterality')}>
					{#each LATERALITIES as l (l.key)}
						<button type="button" class="opt" aria-pressed={laterality === l.key} onclick={() => pickLaterality(l.key)}>{t(LATERALITY_LABEL_KEY[l.key])}</button>
					{/each}
				</div>
				<div class="opts" role="group" aria-label={t('sections.coverDeviation')}>
					{#each DEVIATIONS as d (d)}
						<button type="button" class="opt" aria-pressed={deviation === d} onclick={() => pickDeviation(d)}><Abbr code={d} /></button>
					{/each}
				</div>
				<div class="opts" role="group" aria-label={t('sections.coverPrismDiopters')}>
					{#each PRISMS as p (p)}
						<button type="button" class="opt num" aria-pressed={prism === p} aria-label={p === 'Ortho' ? 'Ortho' : t('sections.coverPrismN', { n: p })} onclick={() => pickPrism(p)}
							>{#if p === 'Ortho'}<Abbr code="Ortho" />{:else}{p}<Abbr code="Δ" />{/if}</button
						>
					{/each}
				</div>
				<div class="record">
					<span class="target" aria-live="polite">
						<Msg key="sections.coverInto"
							>{#snippet target()}<strong>{t('sections.coverTarget', { zone: zoneLabel, position: positionName(selected) })}</strong>{/snippet}{#snippet preview()}<span
									class="preview">{text || '–'}</span
								>{/snippet}</Msg
						>
					</span>
					<button type="button" class="primary-btn" disabled={!text} onclick={record}>{t('sections.coverRecord')}</button>
				</div>
				<p class="hint">{t('sections.coverHint')}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
		min-width: 0;
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.disclose {
		margin-inline-end: auto;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border: 0;
		background: transparent;
		padding: 0 var(--space-1);
		min-height: max(var(--target-min), 40px);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: max(var(--target-min), 40px);
		cursor: pointer;
	}
	.check input {
		width: 1.125rem;
		height: 1.125rem;
		accent-color: var(--accent);
	}
	.body {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		padding: var(--space-3);
	}
	.grid-side {
		flex: 1 1 320px;
		min-width: 0;
	}
	.builder {
		flex: 1 1 300px;
		min-width: 0;
		display: grid;
		gap: var(--space-2);
		align-content: start;
	}
	h4 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--text-2);
	}
	.tabs {
		display: flex;
		gap: 2px;
		border-bottom: 1px solid var(--hairline);
		margin-bottom: var(--space-2);
		overflow-x: auto;
	}
	[role='tab'] {
		border: 0;
		border-bottom: 2px solid transparent;
		border-radius: var(--radius-1) var(--radius-1) 0 0;
		background: transparent;
		min-height: max(var(--target-min), 40px);
		color: var(--text-2);
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	[role='tab'][aria-selected='true'] {
		color: var(--accent);
		border-bottom-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.count {
		font-size: var(--text-xs);
		min-width: 16px;
		padding: 0 4px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		text-align: center;
	}
	.axis {
		display: grid;
		grid-template-columns: 3.2em 1fr 1fr 1fr;
		font-size: var(--text-xs);
		color: var(--text-3);
		text-align: center;
	}
	.axis span:first-child {
		grid-column: 2;
	}
	.cells {
		display: grid;
		grid-template-columns: 3.2em repeat(3, minmax(0, 1fr));
		gap: 4px;
		align-items: stretch;
	}
	.rowlabel {
		align-self: center;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.dimmed .cells {
		opacity: 0.6;
	}
	textarea {
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(var(--target-min), 44px);
		width: 100%;
		resize: vertical;
		text-align: center;
	}
	textarea::placeholder {
		color: var(--text-3);
	}
	textarea.primary {
		border-width: 2px;
	}
	textarea.selected {
		border-color: var(--accent);
	}
	textarea:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	textarea.ghost {
		background: var(--accent-soft);
		color: var(--accent);
		font-style: italic;
	}
	textarea.copied {
		background: var(--copied-tint);
	}
	.note,
	.hint {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.opt {
		min-height: max(var(--target-min), 40px);
		min-width: 40px;
		padding: 0 var(--space-2);
	}
	.opt[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.record {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding-top: var(--space-1);
	}
	.target {
		margin-inline-end: auto;
		color: var(--text-2);
	}
	.preview {
		font-family: var(--font-mono);
		color: var(--text-1);
	}
	.primary-btn {
		min-height: max(var(--target-min), 40px);
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.primary-btn:disabled {
		background: var(--surface-2);
		border-color: var(--hairline);
		color: var(--text-3);
	}
</style>
