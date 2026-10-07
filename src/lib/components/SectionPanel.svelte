<script lang="ts">
	import { fieldId, fieldLabel, rowLabel, sectionTitle, type Row, type SectionDef } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';
	import { page } from '$app/state';
	import ZoneDocuments from '#lib/components/documents/ZoneDocuments.svelte';

	type Side = 'OD' | 'OS' | 'OU';
	let {
		sec,
		findings,
		preview,
		copied,
		onedit,
		ondefaults,
		oncopy,
		onclear,
		context
	}: {
		sec: SectionDef;
		findings: Findings;
		/** Values the shorthand bar would write, shown as a ghost until committed. */
		preview: Findings | null;
		/** Fields just filled from a prior visit (tinted until edited). */
		copied: Set<string>;
		onedit: (field: string, value: string) => void;
		ondefaults: (side: Side) => void;
		oncopy: (from: 'OD' | 'OS') => void;
		onclear: (side: 'OD' | 'OS') => void;
		/** Which chart this is (documents strip). Falls back to the page's route ids. */
		context?: { patientId: number; encounterId: number };
	} = $props();

	/** Zones with a documents strip (§15.4): External, Anterior segment, Retina. */
	const DOC_ZONES = ['EXT', 'ANTSEG', 'RETINA'] as const;
	const docZone = $derived((DOC_ZONES as readonly string[]).includes(sec.id) ? (sec.id as (typeof DOC_ZONES)[number]) : null);
	const chart = $derived(
		context ?? { patientId: Number(page.params.pid), encounterId: Number(page.params.eid) }
	);

	const textRows = $derived(sec.rows.filter((r) => r.measure === undefined));
	const measureRows = $derived(sec.rows.filter((r) => r.measure !== undefined));
	const titleId = $derived(`${sec.id.toLowerCase()}-title`);
	const comments = $derived(cell(sec.comments.field));

	const { t } = useI18n();
	const aria = (label: string, isDefault: boolean) => (isDefault ? t('exam.fieldDefault', { field: label }) : label);

	function cell(id: string) {
		const ghost = preview?.[id];
		const real = findings[id];
		return {
			value: ghost?.value ?? real?.value ?? '',
			ghost: !!ghost,
			isDefault: !ghost && !!real?.isDefault,
			copied: !ghost && copied.has(id)
		};
	}
</script>

{#snippet eyeHead(eye: 'OD' | 'OS')}
	<th scope="col" class="eyecol">
		<span class="eye {eye.toLowerCase()}">{eye === 'OD' ? t('exam.eyeHeadOd') : t('exam.eyeHeadOs')}</span>
		<span class="side-actions">
			<button type="button" class="mini" onclick={() => ondefaults(eye)}>{t('exam.normal')}</button>
			<button type="button" class="mini" onclick={() => onclear(eye)}>{t('exam.clear')}</button>
		</span>
	</th>
{/snippet}

{#snippet input(id: string, label: string, short: boolean, numeric = false)}
	{@const c = cell(id)}
	<td class="cell" class:ghost={c.ghost} class:is-default={c.isDefault} class:copied={c.copied} data-field={id}>
		{#if short}
			<input
				class="short"
				value={c.value}
				inputmode={numeric ? 'decimal' : 'text'}
				aria-label={aria(label, c.isDefault)}
				placeholder="–"
				oninput={(e) => onedit(id, e.currentTarget.value)}
			/>
		{:else}
			<textarea
				rows="1"
				placeholder="–"
				value={c.value}
				aria-label={aria(label, c.isDefault)}
				oninput={(e) => onedit(id, e.currentTarget.value)}
			></textarea>
		{/if}
	</td>
{/snippet}

{#snippet rowHead(row: Row)}
	<th scope="row">
		{rowLabel(row, t)}
		{#if row.measure}<span class="unit">{row.measure}</span>{/if}
		<span class="code" title={t('exam.shorthandCodes')}>{row.hint}</span>
	</th>
{/snippet}

<section aria-labelledby={titleId}>
	<div class="head">
		<h2 id={titleId}>{sectionTitle(sec, t)}</h2>
		<button type="button" onclick={() => ondefaults('OU')}>{t('exam.normalOu')}</button>
		<button type="button" onclick={() => oncopy('OD')} aria-label={t('exam.copyOdToOs')}>OD → OS</button>
		<button type="button" onclick={() => oncopy('OS')} aria-label={t('exam.copyOsToOd')}>OS → OD</button>
	</div>

	<div class="panel">
		<table>
			<thead>
				<tr>
					<th scope="col" class="rowhead"><span class="visually-hidden">{t('exam.finding')}</span></th>
					{@render eyeHead('OD')}
					{@render eyeHead('OS')}
				</tr>
			</thead>
			<tbody>
				{#each textRows as row (row.id)}
					<tr>
						{@render rowHead(row)}
						{@render input(fieldId('OD', row), fieldLabel(fieldId('OD', row), t), false)}
						{@render input(fieldId('OS', row), fieldLabel(fieldId('OS', row), t), false)}
					</tr>
				{/each}
				<tr class="divider"><td colspan="3"></td></tr>
				{#each measureRows as row (row.id)}
					<tr>
						{@render rowHead(row)}
						{@render input(fieldId('OD', row), fieldLabel(fieldId('OD', row), t), true, !!row.measure)}
						{@render input(fieldId('OS', row), fieldLabel(fieldId('OS', row), t), true, !!row.measure)}
					</tr>
				{/each}
				{#if sec.hertel}
					{@const base = cell('HERTELBASE')}
					<tr>
						<th scope="row">
							{t('catalog.rowHertel')} <span class="unit">mm</span>
							<span class="code" title={t('exam.shorthandCodes')}>HERT:15-100-16</span>
						</th>
						{@render input('ODHERTEL', fieldLabel('ODHERTEL', t), true, true)}
						{@render input('OSHERTEL', fieldLabel('OSHERTEL', t), true, true)}
					</tr>
					<tr>
						<th scope="row">{t('catalog.hertelBase')} <span class="code">BHERT</span></th>
						<td
							class="cell"
							colspan="2"
							class:ghost={base.ghost}
							class:copied={base.copied}
							data-field="HERTELBASE"
						>
							<input
								class="short"
								value={base.value}
								inputmode="decimal"
								aria-label={t('catalog.hertelBase')}
								placeholder="–"
								oninput={(e) => onedit('HERTELBASE', e.currentTarget.value)}
							/>
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<label class="comments">
		<span>{t('exam.comments')} <span class="code">{sec.comments.hint}</span></span>
		<textarea
			rows="2"
			class:ghost={comments.ghost}
			class:copied={comments.copied}
			value={comments.value}
			oninput={(e) => onedit(sec.comments.field, e.currentTarget.value)}
		></textarea>
	</label>
	<p class="legend">
		<span class="swatch" aria-hidden="true"></span> {t('exam.legendDefault')}
		<span class="swatch copied" aria-hidden="true"></span> {t('exam.legendCopied')}
	</p>
	{#if docZone && chart.patientId > 0 && chart.encounterId > 0}
		<ZoneDocuments patientId={chart.patientId} encounterId={chart.encounterId} zone={docZone} />
	{/if}
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
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
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
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	.rowhead {
		width: 24%;
	}
	thead th {
		height: calc(var(--row-height) + var(--space-2));
	}
	.eyecol {
		width: 38%;
	}
	tbody th {
		font-weight: var(--weight-regular);
		color: var(--text-2);
		height: var(--row-height);
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
	.side-actions {
		float: right;
		display: inline-flex;
		gap: var(--space-1);
	}
	.mini {
		font-size: var(--text-xs);
		min-height: calc(var(--target-min) - 4px);
		padding: 0 var(--space-2);
		color: var(--text-2);
	}
	.cell {
		padding: 2px var(--space-1);
		transition: background var(--dur-small-in) var(--ease-enter);
	}
	.cell.is-default {
		background: var(--default-tint);
	}
	.cell.copied,
	textarea.copied {
		background: var(--copied-tint);
	}
	textarea,
	input {
		width: 100%;
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: calc(var(--row-height) - 4px);
		resize: none;
		field-sizing: content;
	}
	textarea::placeholder,
	input::placeholder {
		color: var(--text-3);
	}
	input.short {
		width: 9em;
		border-color: var(--hairline);
	}
	textarea:hover,
	input:hover {
		border-color: var(--hairline);
	}
	textarea:focus,
	input:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
	}
	textarea:focus-visible,
	input:focus-visible {
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.ghost textarea,
	.ghost input,
	textarea.ghost {
		color: var(--accent);
		font-style: italic;
	}
	.cell.ghost {
		background: var(--accent-soft);
	}
	.unit {
		color: var(--text-3);
		font-size: var(--text-xs);
		margin-left: var(--space-1);
	}
	.divider td {
		height: var(--space-2);
		background: var(--surface-2);
	}
	.comments {
		display: grid;
		gap: var(--space-1);
		margin-top: var(--space-4);
		color: var(--text-2);
	}
	.comments .code {
		display: inline;
	}
	.comments textarea {
		background: var(--surface-1);
		border-color: var(--hairline);
		max-width: var(--measure-prose);
	}
	.legend {
		color: var(--text-3);
		font-size: var(--text-xs);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
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
</style>
