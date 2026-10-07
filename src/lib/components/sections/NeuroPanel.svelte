<script lang="ts">
	// Neuro (spec §9): motility (§9.1), alternate cover test + builder (§9.2), other neuro fields (§9.3).
	// Clicks and buttons go through oncommit (immediate save + undo toast); typing goes through onedit.
	import {
		NEURO_EYE_ROWS,
		NEURO_PAIRS,
		NEURO_ROW_LABEL_KEY,
		motilityClick,
		motilityIsNormal,
		motilityNormalValues,
		motilitySet,
		sensorimotorSuggested
	} from '#lib/exam/sections/neuro.ts';
	import type { PanelProps } from './types.ts';
	import { cellState, withValues } from './workup/cell.ts';
	import MotilityDiagram from './neuro/MotilityDiagram.svelte';
	import CoverTest from './neuro/CoverTest.svelte';
	import Msg from '#lib/i18n/Msg.svelte';
	import Abbr from '#lib/components/ui/Abbr.svelte';
	import CodeHint from '#lib/components/ui/CodeHint.svelte';
	import { tip } from '#lib/components/ui/tooltip.ts';
	import { glossary } from '#lib/i18n/glossary.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { stateLabel, useCopiedFrom } from '#lib/exam/copied.ts';

	let { findings, preview, copied, onedit, oncommit }: PanelProps = $props();
	const { t } = useI18n();
	const copiedFrom = useCopiedFrom();
	const rowLabel = (key: keyof typeof NEURO_ROW_LABEL_KEY) => t(NEURO_ROW_LABEL_KEY[key]);

	const cell = (id: string) => cellState(id, findings, preview, copied);

	// ---------- motility ----------
	const motNormal = $derived(motilityIsNormal(findings));
	/** Touch-friendly decrement: while on, taps remove a mark (Shift+click and long-press always do). */
	let removeMode = $state(false);

	function step(id: string, dir: 1 | -1) {
		const { next, changed } = withValues(findings, motilityClick(findings, id, dir));
		oncommit(next, changed, t('sections.motility'));
	}
	function setCount(id: string, n: number) {
		const { next, changed } = withValues(findings, motilitySet(id, n));
		oncommit(next, changed, t('sections.motility'));
	}
	function setMotilityNormal(on: boolean) {
		const { next, changed } = on ? withValues(findings, motilityNormalValues()) : withValues(findings, { MOTILITYNORMAL: '' });
		oncommit(next, changed, on ? t('sections.motilityUndoNormal') : t('sections.motilityUndoNormalOff'));
	}

	// ---------- other fields ----------
	function rowNormal(r: (typeof NEURO_EYE_ROWS)[number]) {
		const { next, changed } = withValues(findings, { [r.od]: r.normal, [r.os]: r.normal }, true);
		oncommit(next, changed, t('sections.neuroUndoRowNormal', { label: rowLabel(r.key) }));
	}

	/** Advisory only (§9.4 FIX); the coding panel will offer it with an include checkbox. */
	const suggest92060 = $derived(sensorimotorSuggested(findings));
</script>

{#snippet text(id: string, label: string, opts: { size?: 's' | 'm' | 'l'; placeholder?: string } = {})}
	{@const c = cell(id)}
	<span class="inp" class:ghost={c.ghost} class:is-default={c.isDefault} class:copied={c.copied} data-field={id}>
		<input
			class={opts.size ?? 's'}
			value={c.value}
			autocomplete="off"
			aria-label={stateLabel(t, label, { isDefault: c.isDefault, copied: c.copied, date: copiedFrom(id) })}
			placeholder={opts.placeholder ?? '–'}
			oninput={(e) => onedit(id, e.currentTarget.value)}
		/>
	</span>
{/snippet}

<section aria-labelledby="neuro-title">
	<div class="head">
		<h2 id="neuro-title">{t('sections.neuroTitle')}</h2>
		{#if suggest92060}
			<span class="advice" role="status">{t('sections.neuroSensorimotorAdvice', { code: '92060' })}</span>
		{/if}
	</div>

	<div class="cards">
		<!-- Motility -->
		<div class="panel" role="group" aria-labelledby="motility-title">
			<div class="card-head">
				<h3 id="motility-title">{t('sections.motility')}</h3>
				<button type="button" class="mini" aria-pressed={removeMode} use:tip={t('tips.motilityRemove')} onclick={() => (removeMode = !removeMode)}>
					<span aria-hidden="true">−</span> {t('sections.motilityRemoveMode')}
				</button>
				<label class="check">
					<input type="checkbox" checked={motNormal} onchange={(e) => setMotilityNormal(e.currentTarget.checked)} />
					{t('sections.normal')} <span class="unit" use:tip={{ text: glossary('D&V', t) ?? '', host: true }}>{t('sections.motilityDvFull')}</span>
				</label>
			</div>
			<div class="motility eye-ltr">
				{#each ['OD', 'OS'] as const as eye (eye)}
					<MotilityDiagram {eye} {cell} {removeMode} onstep={step} onset={setCount} />
				{/each}
			</div>
			<p class="hint">
				{removeMode ? t('sections.motilityHintRemove') : t('sections.motilityHintAdd')}
				{t('sections.motilityHintKeys')}
			</p>
		</div>

		<!-- Other neuro fields -->
		<div class="panel" role="group" aria-labelledby="measures-title">
			<div class="card-head"><h3 id="measures-title">{t('sections.neuroSensory')}</h3></div>
			<table class="eye-ltr">
				<thead>
					<tr>
						<th scope="col" class="rowhead"><span class="visually-hidden">{t('sections.measure')}</span></th>
						<th scope="col"><span class="eye od" use:tip={t('tips.eyeOd')}>{t('sections.eyeOdR')}</span></th>
						<th scope="col"><span class="eye os" use:tip={t('tips.eyeOs')}>{t('sections.eyeOsL')}</span></th>
					</tr>
				</thead>
				<tbody>
					{#each NEURO_EYE_ROWS as r (r.key)}
						{@const label = rowLabel(r.key)}
						<tr>
							<th scope="row">
								<span class="rowname">
									<Abbr code={r.key} text={label} />
									{#if r.normal}
										<button
											type="button"
											class="mini normal"
											aria-label="{t('sections.normal')}: {t('sections.neuroRowNormalLabel', { label, value: r.normal })}"
											use:tip={t('sections.neuroBothEyes', { value: r.normal })}
											onclick={() => rowNormal(r)}>{t('sections.normal')}</button
										>
									{/if}
								</span>
							</th>
							<td class="cell">{@render text(r.od, t('sections.neuroEyeCell', { label, eye: 'OD' }))}</td>
							<td class="cell">{@render text(r.os, t('sections.neuroEyeCell', { label, eye: 'OS' }))}</td>
						</tr>
					{/each}
					<tr class="divider"><td colspan="3"></td></tr>
					<tr>
						<th scope="col" class="sub"><span class="visually-hidden">{t('sections.neuroBinocularMeasure')}</span></th>
						<th scope="col" class="sub">{t('sections.visionGroupDistance')}</th>
						<th scope="col" class="sub">{t('sections.visionGroupNear')}</th>
					</tr>
					{#each NEURO_PAIRS as p (p.key)}
						{@const label = rowLabel(p.key)}
						<tr>
							<th scope="row">{label}</th>
							<td class="cell">{@render text(p.dist, t('sections.neuroPairDistance', { label }))}</td>
							<td class="cell">{@render text(p.near, t('sections.neuroPairNear', { label }))}</td>
						</tr>
					{/each}
					<tr>
						<th scope="row">{t('sections.neuroDivergence')}</th>
						<td class="cell" colspan="2">{@render text('DIVERGENCEAMPS', t('sections.neuroDivergence'), { size: 'l', placeholder: t('sections.neuroDistNear') })}</td>
					</tr>
					<tr>
						<th scope="row">{t('sections.neuroVertFusionalShort')}</th>
						<td class="cell" colspan="2">{@render text('VERTFUSAMPS', t('sections.neuroVertFusional'), { size: 'l' })}</td>
					</tr>
					<tr>
						<th scope="row"><Abbr code="NPC" text={t('sections.neuroNpc')} /></th>
						<td class="cell" colspan="2">{@render text('NPC', t('sections.neuroNpcLong'), { size: 'l' })}</td>
					</tr>
					<tr>
						<th scope="row">{t('sections.neuroStereopsis')}</th>
						<td class="cell" colspan="2">{@render text('STEREOPSIS', t('sections.neuroStereopsis'), { size: 'l' })}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Alternate cover test (full width) -->
		<div class="wide">
			<CoverTest {findings} {cell} {onedit} {oncommit} />
		</div>

		<!-- Comments -->
		<div class="panel wide">
			{#snippet comments()}
				{@const c = cell('NEURO_COMMENTS')}
				<label class="comments">
					<span>{t('sections.neuroComments')} <CodeHint hint="NCOM" inline /></span>
					<textarea
						rows="2"
						class:ghost={c.ghost}
						class:copied={c.copied}
						data-field="NEURO_COMMENTS"
						value={c.value}
						oninput={(e) => onedit('NEURO_COMMENTS', e.currentTarget.value)}
					></textarea>
				</label>
			{/snippet}
			{@render comments()}
		</div>
	</div>
	<p class="legend">
		<span class="swatch" aria-hidden="true"></span> {t('sections.legendDefault')}
		<span class="swatch copied" aria-hidden="true"></span> {t('sections.legendCopied')}
		<span class="sep"
			><Msg key="sections.legendShorthand"
				>{#snippet codes()}<code>RCOL:11/11</code>, <code>NPA:8 cm</code>, <code>STEREO:40 sec</code>, <code>CCDIST:6 XT</code>{/snippet}</Msg
			></span
		>
	</p>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0;
		margin-inline-end: auto;
	}
	.advice {
		font-size: var(--text-xs);
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: var(--radius-pill);
		padding: 2px var(--space-2);
	}
	/* Two cards side by side when they fit, then the full-width cover test and comments. */
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		align-items: flex-start;
	}
	.cards > * {
		flex: 1 1 340px;
	}
	.cards > .wide {
		flex-basis: 100%;
		min-width: 0;
	}
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
		min-height: calc(var(--target-min) + var(--space-2));
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.unit {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.mini {
		font-size: var(--text-xs);
		padding: 0 var(--space-2);
		color: var(--text-2);
		min-height: max(var(--target-min), 40px);
	}
	.mini[aria-pressed='true'] {
		background: var(--abnormal-soft);
		border-color: var(--abnormal);
		color: var(--abnormal);
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
	.motility {
		display: flex;
		justify-content: space-around;
		flex-wrap: wrap;
		gap: var(--space-3);
		padding: var(--space-3);
	}
	.hint {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-3);
		border-top: 1px solid var(--hairline);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	th,
	td {
		text-align: start;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--hairline);
		vertical-align: middle;
	}
	.rowhead {
		width: 40%;
	}
	thead th {
		height: calc(var(--row-height) + var(--space-1));
	}
	tbody th {
		font-weight: var(--weight-regular);
		color: var(--text-2);
		height: var(--row-height);
	}
	th.sub {
		font-size: var(--text-xs);
		color: var(--text-3);
		height: auto;
		padding-top: var(--space-1);
	}
	.rowname {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-1);
	}
	.mini.normal {
		min-height: max(var(--target-min), 40px);
		padding: 0 6px;
	}
	.divider td {
		height: var(--space-1);
		background: var(--surface-2);
		padding: 0;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
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
	}
	.inp {
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-1);
		max-width: 100%;
	}
	.inp.ghost {
		background: var(--accent-soft);
	}
	.ghost input,
	textarea.ghost {
		color: var(--accent);
		font-style: italic;
	}
	.inp.copied,
	textarea.copied {
		background: var(--copied-tint);
	}
	.inp.is-default {
		background: var(--default-tint);
	}
	input,
	textarea {
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(calc(var(--row-height) - 4px), 36px);
		max-width: 100%;
	}
	input.s {
		width: 8em;
	}
	input.l {
		width: 16em;
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--text-3);
	}
	input:focus,
	textarea:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.comments {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		color: var(--text-2);
	}
	.comments textarea {
		width: 100%;
		resize: vertical;
	}
	.code {
		font: var(--text-xs) var(--font-mono);
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
		margin-inline-start: var(--space-3);
	}
	.sep {
		margin-inline-start: var(--space-3);
	}
</style>
