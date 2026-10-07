<script lang="ts">
	// Vision (spec §1.4 Vision box, §8.1 acuity entry, §8.4 Amsler). Free text everywhere; the picks
	// above the grid fill the focused box and move on, so a whole line takes two taps per eye.
	import { FIELDS } from '#lib/exam/catalog.ts';
	import { VA_ROWS, VA_ROW_LABEL_KEY, amslerValue, normalizeVA, type VaRow } from '#lib/exam/sections/workup.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import type { PanelProps } from './types.ts';
	import { cellState, replaceKeepingCaret, withValues } from './workup/cell.ts';
	import AmslerGrid from './workup/AmslerGrid.svelte';
	import VaHistory from './workup/VaHistory.svelte';

	let { context, findings, preview, copied, onedit, oncommit }: PanelProps = $props();
	const { t } = useI18n();
	/** Acuity history dialog (§8.2). */
	let historyOpen = $state(false);

	const GROUPS: { title: MessageKey; keys: string[] }[] = [
		{ title: 'sections.visionGroupDistance', keys: ['SC', 'CC', 'PH'] },
		{ title: 'sections.visionGroupRefraction', keys: ['AR', 'MR', 'CR', 'CTL'] },
		{ title: 'sections.visionGroupNear', keys: ['SCNEAR', 'CCNEAR', 'ARNEAR', 'MRNEAR'] },
		{ title: 'sections.visionGroupOther', keys: ['PAM', 'GLARE', 'CONTRAST', 'LI'] }
	];
	const ROW = new Map(VA_ROWS.map((r) => [r.key, r]));
	const ORDER = GROUPS.flatMap((g) => g.keys.flatMap((k) => [ROW.get(k)!.od, ROW.get(k)!.os]));
	const LONG: Record<string, MessageKey> = {
		SC: 'sections.vaLongSc',
		CC: 'sections.visionLongCc',
		PH: 'sections.vaLongPh',
		AR: 'sections.vaLongAr',
		MR: 'sections.vaLongMr',
		CR: 'sections.vaLongCr',
		CTL: 'sections.vaLongCtl',
		PAM: 'sections.visionLongPam',
		GLARE: 'sections.visionLongGlare',
		LI: 'sections.visionLongLi'
	};
	const rowLabel = (r: VaRow) => t(VA_ROW_LABEL_KEY[r.key]);
	const vaLabel = (r: VaRow, eye: 'OD' | 'OS') => t('sections.vaCellLabel', { row: rowLabel(r), eye });
	const SNELLEN = ['20/15', '20/20', '20/25', '20/30', '20/40', '20/50', '20/60', '20/70', '20/80', '20/100', '20/200', '20/400', 'CF', 'HM', 'LP', 'NLP'];
	const JAEGER = ['J1+', 'J1', 'J2', 'J3', 'J5', 'J7', 'J10', 'J16'];

	let root: HTMLElement;
	let active = $state('SCODVA');
	const activeRow = $derived(VA_ROWS.find((r) => r.od === active || r.os === active));
	const activeLabel = $derived(
		activeRow ? vaLabel(activeRow, activeRow.od === active ? 'OD' : 'OS') : vaLabel(VA_ROWS[0], 'OD')
	);
	const picks = $derived(activeRow?.near ? JAEGER : SNELLEN);
	const ams = $derived({ OD: amslerValue(findings, 'OD'), OS: amslerValue(findings, 'OS') });
	/** What the grids show: a shorthand preview wins over the saved value. */
	const amsShown = $derived({
		OD: amslerValue({ ...findings, ...(preview ?? {}) }, 'OD'),
		OS: amslerValue({ ...findings, ...(preview ?? {}) }, 'OS')
	});
	const amslerNormal = $derived(ams.OD === 0 && ams.OS === 0);

	const cell = (id: string) => cellState(id, findings, preview, copied);

	function type(id: string, el: HTMLInputElement) {
		const value = normalizeVA(el.value);
		replaceKeepingCaret(el, value);
		onedit(id, value);
	}

	/** Fill the focused box from a pick, then move to the other eye / next line. */
	function pick(value: string) {
		onedit(active, value);
		const i = ORDER.indexOf(active);
		const next = ORDER[i + 1];
		if (next) {
			active = next;
			root.querySelector<HTMLInputElement>(`input[data-va="${next}"]`)?.focus();
		}
	}

	function clearAll() {
		const ids = FIELDS.filter((f) => f.section === 'ACUITY').map((f) => f.id);
		const { next, changed } = withValues(findings, Object.fromEntries(ids.map((id) => [id, ''])));
		oncommit(next, changed, t('sections.visionUndoCleared'));
	}

	/** Amsler: each press steps 0 → 5 → 0 (§8.4); saved immediately (FIX). */
	function stepAmsler(eye: 'OD' | 'OS') {
		const cur = ams[eye] ?? 0;
		onedit(`AMSLER${eye}`, String((cur + 1) % 6));
	}

	function setAmslerNormal(on: boolean) {
		const value = on ? '0' : '';
		const { next, changed } = withValues(findings, { AMSLEROD: value, AMSLEROS: value });
		oncommit(next, changed, on ? t('sections.amslerUndoNormal') : t('sections.amslerUndoCleared'));
	}
</script>

{#snippet vaInput(id: string, label: string)}
	{@const c = cell(id)}
	<td class="cell" class:ghost={c.ghost} class:is-default={c.isDefault} class:copied={c.copied} data-field={id}>
		<input
			class="va num"
			data-va={id}
			value={c.value}
			maxlength="25"
			autocomplete="off"
			spellcheck="false"
			aria-label={c.isDefault ? t('sections.labelDefault', { label }) : label}
			placeholder="–"
			onfocus={() => (active = id)}
			oninput={(e) => type(id, e.currentTarget)}
		/>
	</td>
{/snippet}

{#snippet vaRow(r: VaRow)}
	<tr class:current={activeRow?.key === r.key}>
		<th scope="row">
			<span class="rowname" title={LONG[r.key] ? t(LONG[r.key]) : ''}>{rowLabel(r)}</span>
			<span class="code" title={t('sections.shorthandCodes')}>{r.od} · {r.os}</span>
		</th>
		{@render vaInput(r.od, vaLabel(r, 'OD'))}
		{@render vaInput(r.os, vaLabel(r, 'OS'))}
	</tr>
{/snippet}

{#snippet wide(id: string, name: string, label: string, max: number, va: boolean)}
	{@const c = cell(id)}
	<tr>
		<th scope="row"><span class="rowname">{name}</span><span class="code">{id}</span></th>
		<td colspan="2" class="cell" class:ghost={c.ghost} class:copied={c.copied} data-field={id}>
			<input
				class:va
				class:num={va}
				data-va={va ? id : undefined}
				value={c.value}
				maxlength={max}
				autocomplete="off"
				aria-label={label}
				placeholder="–"
				onfocus={() => va && (active = id)}
				oninput={(e) => (va ? type(id, e.currentTarget) : onedit(id, e.currentTarget.value))}
			/>
		</td>
	</tr>
{/snippet}

<section aria-labelledby="vision-title" bind:this={root}>
	<div class="head">
		<h2 id="vision-title">{t('sections.visionTitle')}</h2>
		<button type="button" aria-haspopup="dialog" title={t('sections.visionHistoryTitle')} onclick={() => (historyOpen = true)}>
			{t('sections.visionHistory')}
		</button>
		<button type="button" onclick={clearAll}>{t('sections.visionClear')}</button>
	</div>
	{#if historyOpen}
		<VaHistory {context} {findings} onclose={() => (historyOpen = false)} />
	{/if}

	<div class="layout">
		<div class="panel">
			<div class="picker" role="group" aria-label={t('sections.visionQuickValues')}>
				<span class="fills"><Msg key="sections.visionFills">{#snippet target()}<strong>{activeLabel}</strong>{/snippet}</Msg></span>
				<div class="chips">
					{#each picks as p (p)}
						<button type="button" class="chip num" onmousedown={(e) => e.preventDefault()} onclick={() => pick(p)}>{p}</button>
					{/each}
				</div>
			</div>
			<table>
				<thead>
					<tr>
						<th scope="col" class="rowhead"><span class="visually-hidden">{t('sections.visionAcuity')}</span></th>
						<th scope="col"><span class="eye od">{t('sections.eyeOdR')}</span></th>
						<th scope="col"><span class="eye os">{t('sections.eyeOsL')}</span></th>
					</tr>
				</thead>
				{#each GROUPS as g (g.title)}
					<tbody>
						<tr class="group"><th scope="rowgroup" colspan="3">{t(g.title)}</th></tr>
						{#each g.keys as k (k)}
							{@render vaRow(ROW.get(k)!)}
						{/each}
					</tbody>
				{/each}
				<tbody>
					{@render wide('BINOCVA', t('sections.visionBinocular'), t('sections.visionBinocularLabel'), 25, true)}
					{@render wide('GLARECOMMENTS', t('sections.visionGlareNotes'), t('sections.visionGlareComments'), 255, false)}
				</tbody>
			</table>
		</div>

		<div class="panel amsler" role="group" aria-labelledby="amsler-title">
			<div class="card-head">
				<h3 id="amsler-title">{t('sections.amsler')}</h3>
				<label class="check">
					<input type="checkbox" aria-label={t('sections.amslerNormal')} checked={amslerNormal} onchange={(e) => setAmslerNormal(e.currentTarget.checked)} />
					{t('sections.normal')}
				</label>
			</div>
			<div class="grids">
				{#each ['OD', 'OS'] as const as eye (eye)}
					{@const c = cell(`AMSLER${eye}`)}
					<button
						type="button"
						class="amsler-btn"
						class:ghost={c.ghost}
						class:copied={c.copied}
						data-field="AMSLER{eye}"
						aria-label={amsShown[eye] === null ? t('sections.amslerButtonUntested', { eye }) : t('sections.amslerButton', { eye, n: amsShown[eye] ?? 0 })}
						onclick={() => stepAmsler(eye)}
					>
						<span class="eye {eye.toLowerCase()}">{eye}</span>
						<AmslerGrid severity={amsShown[eye]} />
						<span class="caption num">{amsShown[eye] === null ? t('sections.notTested') : `${amsShown[eye]}/5`}</span>
					</button>
				{/each}
			</div>
			<p class="hint">{t('sections.amslerHint')}</p>
		</div>
	</div>
	<p class="legend">
		<span class="swatch" aria-hidden="true"></span> {t('sections.legendDefault')}
		<span class="swatch copied" aria-hidden="true"></span> {t('sections.legendCopied')}
		<span class="sep"><Msg key="sections.visionLegendShorthand">{#snippet codes()}<code>SCODVA:20/25</code>, <code>BVA:20/20</code>{/snippet}</Msg></span>
	</p>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0 auto 0 0;
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0 auto 0 0;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
		gap: var(--space-4);
		align-items: start;
	}
	@media (max-width: 760px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
		min-width: 0;
	}
	.picker {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.fills {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.fills strong {
		color: var(--text-1);
		font-weight: var(--weight-semibold);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chip {
		min-width: var(--target-min);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	th,
	td {
		text-align: left;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--hairline);
		vertical-align: middle;
	}
	.rowhead {
		width: 34%;
	}
	thead th {
		height: calc(var(--row-height) + var(--space-2));
	}
	tbody th {
		font-weight: var(--weight-regular);
		color: var(--text-2);
		height: var(--row-height);
	}
	tr.group th {
		background: var(--surface-2);
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		height: auto;
		padding-top: 2px;
		padding-bottom: 2px;
	}
	tr.current th .rowname {
		color: var(--text-1);
		font-weight: var(--weight-semibold);
	}
	.rowname {
		display: inline-block;
	}
	.code {
		display: block;
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.eye {
		display: inline-flex;
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
	.cell {
		padding: 2px var(--space-1);
		transition: background var(--dur-small-in) var(--ease-enter);
	}
	.cell.is-default {
		background: var(--default-tint);
	}
	.cell.copied {
		background: var(--copied-tint);
	}
	.cell.ghost {
		background: var(--accent-soft);
	}
	.ghost input {
		color: var(--accent);
		font-style: italic;
	}
	input:not([type='checkbox']) {
		width: 100%;
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: calc(var(--row-height) - 4px);
	}
	input.va {
		width: 8em;
		max-width: 100%;
	}
	input::placeholder {
		color: var(--text-3);
	}
	input:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.amsler {
		padding: var(--space-3);
		display: grid;
		gap: var(--space-2);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		cursor: pointer;
	}
	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}
	.grids {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.amsler-btn {
		display: grid;
		justify-items: center;
		gap: var(--space-1);
		padding: var(--space-2);
		height: auto;
	}
	.amsler-btn.ghost {
		background: var(--accent-soft);
	}
	.amsler-btn.copied {
		background: var(--copied-tint);
	}
	.caption {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.legend {
		color: var(--text-3);
		font-size: var(--text-xs);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.legend code {
		font-family: var(--font-mono);
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--default-tint);
		border: 1px solid var(--hairline);
	}
	.swatch.copied {
		background: var(--copied-tint);
		margin-left: var(--space-3);
	}
	.sep {
		margin-left: var(--space-3);
	}
</style>
