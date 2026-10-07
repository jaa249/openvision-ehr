<script lang="ts">
	// Code summary (spec §11.4 FIX): the diagnoses with pointer letters, the CPT lines and the checks.
	// A billing aid only (D46): nothing is saved as billing lines; the provider copies these codes into
	// the practice's billing system, and the chosen ones print on the exam report.
	import type { CodingSummary } from '#lib/coding/lines.ts';
	import { codeSetsShort } from '#lib/codesets/index.ts';
	import { MAX_DX } from '#lib/coding/codes.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let { summary }: { summary: CodingSummary } = $props();
	const { t } = useI18n();

	const LEVEL: Record<CodingSummary['checks'][number]['level'], MessageKey> = {
		error: 'codes.levelFix',
		warning: 'codes.levelCheck',
		suggestion: 'codes.levelConsider'
	};
</script>

<div class="panel wide" role="group" aria-labelledby="summary-title">
	<div class="card-head">
		<h3 id="summary-title">{t('codes.summaryTitle')}</h3>
	</div>

	<div class="tables">
		<div class="tbl">
			<h4>{t('codes.summaryDiagnoses')} <span class="count">{t('codes.summaryDxCount', { n: summary.dx.length, max: MAX_DX })}</span></h4>
			{#if summary.dx.length}
				<table>
					<thead><tr><th scope="col" class="ptr">{t('codes.summaryPtr')}</th><th scope="col" class="code">{codeSetsShort(summary.dx.map((d) => d.code))}</th><th scope="col">{t('codes.summaryImpression')}</th></tr></thead>
					<tbody>
						{#each summary.dx as d (d.letter)}
							<tr><td class="ptr">{d.letter}</td><td class="code">{d.code}</td><td>{d.title}</td></tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">{t('codes.summaryNoDx')}</p>
			{/if}
		</div>
		<div class="tbl">
			<h4>{t('codes.summaryProcedures')}</h4>
			<table>
				<thead><tr><th scope="col" class="code">CPT</th><th scope="col">{t('codes.summaryDescription')}</th><th scope="col" class="mod">{t('codes.summaryMod')}</th><th scope="col" class="ptr">{t('codes.summaryPtr')}</th></tr></thead>
				<tbody>
					{#each summary.cpt as l, i (i)}
						<tr class:over={l.pointers.length > 4}>
							<td class="code">{l.code}</td>
							<td>{l.description}</td>
							<td class="mod">{l.modifiers.join(' ') || '—'}</td>
							<td class="ptr">{l.pointers.join('') || '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="empty">{t('codes.summaryNoProcedures')}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if summary.checks.length}
		<ul class="checks" aria-label={t('codes.summaryChecks')}>
			{#each summary.checks as c, i (i)}
				<li class={c.level}><span class="lvl">{t(LEVEL[c.level])}</span> {c.message}</li>
			{/each}
		</ul>
	{/if}

	<p class="help">{t('codes.summaryHelp')}</p>
</div>

<style>
	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
	}
	.tbl {
		min-width: 0;
	}
	h4 {
		margin: 0 0 var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-2);
	}
	.count {
		font-weight: var(--weight-regular);
		color: var(--text-3);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
		font-size: var(--text-xs);
	}
	th,
	td {
		text-align: left;
		padding: 4px var(--space-1);
		border-bottom: 1px solid var(--hairline);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	th {
		color: var(--text-3);
		font-weight: var(--weight-semibold);
	}
	.ptr {
		width: 3.5em;
	}
	.code {
		width: 5.5em;
		font-family: var(--font-mono);
	}
	.mod {
		width: 3.5em;
		font-family: var(--font-mono);
	}
	tr.over .ptr {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.checks {
		list-style: none;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		display: grid;
		gap: var(--space-1);
		border-top: 1px solid var(--hairline);
		font-size: var(--text-xs);
	}
	.lvl {
		display: inline-block;
		min-width: 5.5em;
		font-weight: var(--weight-semibold);
	}
	.error .lvl {
		color: var(--danger);
	}
	.warning .lvl {
		color: var(--warn);
	}
	.suggestion .lvl {
		color: var(--accent);
	}
	.help {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--hairline);
		background: var(--surface-2);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
</style>
