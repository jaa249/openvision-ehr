<script lang="ts">
	import { buildReport, type ReportRow, type ReportSection } from '#lib/exam/report.ts';
	import type { PrintableEncounter, Practice } from '#lib/exam/types.ts';
	import { historyReport } from '#lib/exam/sections/history.ts';
	import ReportPlan from './report/ReportPlan.svelte';
	import ReportCodes from './report/ReportCodes.svelte';
	import ReportSignature from './report/ReportSignature.svelte';
	import { allergyStatusText, issueLine, summarizeFamily, summarizeSocial, visibleIssues } from '#lib/history/summary.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let { item, practice, generatedOn }: { item: PrintableEncounter; practice: Practice; generatedOn: string } = $props();

	// Headings and labels in the reader's language (D48); recorded findings print exactly as entered.
	const i18n = useI18n();
	const { t } = i18n;
	/** A phone or fax number keeps its order inside right-to-left text (Unicode left-to-right isolate); unchanged in left-to-right. */
	const ltrIsolate = (v: string) => (i18n.dir === 'rtl' ? String.fromCharCode(0x2066) + v + String.fromCharCode(0x2069) : v);
	const sectionTitle = (s: ReportSection) => (s.titleText ? t(s.titleText.key, s.titleText.params) : s.title);
	const rowLabel = (r: ReportRow) => (r.labelText ? t(r.labelText.key, r.labelText.params) : r.label);

	const sections = $derived(buildReport(item.findings, t));
	const p = $derived(item.patient);
	const e = $derived(item.encounter);

	// Drawings (spec §13.4): the latest saved drawing prints with its section; none means nothing.
	// The English titles match the report sections; DRAWING_TITLE_KEY is what the reader sees.
	const DRAWING_TITLES: Record<string, string> = {
		HPI: 'History of present illness',
		EXT: 'External',
		ANTSEG: 'Anterior segment',
		NEURO: 'Neuro',
		RETINA: 'Retina',
		IMPPLAN: 'Impression/Plan'
	};
	const DRAWING_TITLE_KEY: Record<string, MessageKey> = {
		HPI: 'report.drawingHpi',
		EXT: 'report.sectionExternal',
		ANTSEG: 'report.sectionAnteriorSegment',
		NEURO: 'report.drawingNeuro',
		RETINA: 'report.sectionRetina',
		IMPPLAN: 'report.impressionPlan'
	};
	const drawingTitle = (zone: string) => (DRAWING_TITLE_KEY[zone] ? t(DRAWING_TITLE_KEY[zone]) : zone);
	const drawn = $derived(item.drawingZones ?? []);
	const drawingIn = (title: string) => drawn.find((z) => DRAWING_TITLES[z] === title);
	/** Drawn zones whose section has no recorded findings still print, after the sections. */
	const drawnOnly = $derived(drawn.filter((z) => !sections.some((s) => s.title === DRAWING_TITLES[z])));
	// PMSFH (spec §13.2 item 2) prints right after the HPI block, which history.ts puts first in `sections`.
	const hpiCount = $derived(historyReport(item.findings).length);
	const history = $derived(item.history);
	/**
	 * Compact blocks; an empty list says "Not recorded" (D29: nothing is implied as negative; allergies say
	 * NKDA only when confirmed), and the block is skipped when the whole history is empty.
	 */
	const historyBlocks = $derived.by(() => {
		const h = item.history;
		if (!h) return [];
		const lines = (type: Parameters<typeof visibleIssues>[1]) =>
			visibleIssues(h.issues, type).map((i) => (i.active ? issueLine(i) : t('report.historyInactive', { line: issueLine(i) })));
		const fh = summarizeFamily(h.family);
		const meds = [
			...visibleIssues(h.issues, 'MED').map(issueLine),
			...visibleIssues(h.issues, 'EYEMED').map((i) => t('report.historyEyeMed', { line: issueLine(i) }))
		];
		const social = summarizeSocial(h.social);
		const notRecorded = t('report.historyNotRecorded');
		const blocks = [
			{ title: t('report.historyPoh'), lines: lines('POH'), empty: notRecorded },
			{ title: t('report.historyEyeSurgery'), lines: lines('POS'), empty: notRecorded },
			{ title: t('report.historyPmh'), lines: lines('PMH'), empty: notRecorded },
			{ title: t('report.historyMedication'), lines: meds, empty: notRecorded },
			{ title: t('report.historySurgery'), lines: lines('SURG'), empty: notRecorded },
			{ title: t('report.historyAllergy'), lines: lines('ALLERGY'), empty: allergyStatusText(h.allergyStatus, t) },
			{ title: t('report.historySocial'), lines: social, empty: t('report.historyNotDocumented') },
			{
				title: t('report.historyFh'),
				lines: fh.state === 'positive' ? fh.lines : [],
				empty: fh.state === 'negative' ? t('report.historyNegative') : t('report.historyNotRecorded')
			}
		];
		const anything = h.issues.length > 0 || fh.state !== 'unrecorded' || social.length > 0 || h.allergyStatus.kind !== 'unknown';
		return anything ? blocks : [];
	});
	/**
	 * D36: a signed exam prints the history it was signed with; an unsigned one says it is the current
	 * history; an exam signed before snapshots existed prints today's history, marked as not signed content.
	 */
	const historyHeading = $derived.by(() => {
		const src = item.historySource;
		if (src?.kind === 'signed') return t('report.pastHistorySigned', { date: i18n.dateTime(src.at) });
		if (src?.kind === 'legacy') return t('report.pastHistoryLegacy', { date: generatedOn });
		if (src?.kind === 'current') return t('report.pastHistoryCurrent');
		return t('report.pastHistory');
	});
	/** The allergy line follows the signed history too, so the two never disagree on a signed report. */
	const allergyStatus = $derived(item.historySource?.kind === 'signed' && item.history ? item.history.allergyStatus : p.allergyStatus);
	const drawingUrl = (zone: string) => `/api/patients/${p.id}/encounters/${e.id}/drawings/${zone}`;
</script>

{#snippet pmsfh()}
	{#if history}
		<section class="pmsfh">
			<h2>{historyHeading}</h2>
			{#if historyBlocks.length}
				<div class="cols">
					{#each historyBlocks as b (b.title)}
						<div class="hblock">
							<h3>{b.title}</h3>
							{#if b.lines.length}
								<ul>{#each b.lines as l, n (n)}<li>{l}</li>{/each}</ul>
							{:else}
								<p class="empty">{b.empty}</p>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty">{t('report.noPastHistory')}</p>
			{/if}
		</section>
	{/if}
{/snippet}

{#snippet drawing(zone: string)}
	<figure class="drawing">
		<img src={drawingUrl(zone)} width="324" height="180" alt={t('report.drawingAlt', { title: drawingTitle(zone) })} />
	</figure>
{/snippet}

<!-- One encounter on paper. Colours are fixed (paper is white in every theme). -->
<article class="report" aria-label={t('report.ariaLabel', { name: p.legalName, date: e.date })}>
	<header>
		<div class="practice">
			<strong dir="auto">{practice.name}</strong>
			{#if practice.address}<span dir="auto">{practice.address}</span>{/if}
			<span>
				{#if practice.phone}{t('report.practicePhone', { phone: ltrIsolate(practice.phone) })}{/if}{#if practice.phone && practice.fax}&ensp;·&ensp;{/if}{#if practice.fax}{t('report.practiceFax', { fax: ltrIsolate(practice.fax) })}{/if}
			</span>
		</div>
		<dl class="patient">
			<dt>{t('report.patient')}</dt>
			<dd>
				<strong>{p.legalName}</strong>{#if p.preferredName}&nbsp;(&ldquo;{p.preferredName}&rdquo;){/if}
			</dd>
			<dt>{t('report.dob')}</dt>
			<dd>{t('report.dobAge', { dob: p.dob, age: p.age })}</dd>
			<dt>{t('report.mrn')}</dt>
			<dd>{p.mrn}</dd>
			<dt>{t('report.visit')}</dt>
			<dd>{e.date} · {e.visitType}</dd>
			<dt>{t('report.provider')}</dt>
			<dd>{e.provider}</dd>
			{#if e.technician}
				<dt>{t('report.technician')}</dt>
				<dd>{e.technician}</dd>
			{/if}
		</dl>
	</header>

	<h1>{t('report.heading')}</h1>
	<!-- Always printed: "Not recorded" must never be mistaken for "no allergies". -->
	<p class="allergies" class:listed={allergyStatus.kind === 'listed'}><strong>{t('report.allergiesLabel')}</strong> {allergyStatusText(allergyStatus, t)}</p>

	{#if hpiCount === 0}{@render pmsfh()}{/if}
	{#each sections as s, i (s.title)}
		<section>
			<h2>{sectionTitle(s)}</h2>
			{#if s.summary}<p class="summary">{s.summary}</p>{/if}
			{#if s.rows.length}
			<table class="eye-ltr">
				<thead>
					<tr><th scope="col" class="od">{t('report.odRight')}</th><th scope="col" class="label"><span class="visually-hidden">{t('report.finding')}</span></th><th scope="col">{t('report.osLeft')}</th></tr>
				</thead>
				<tbody>
					{#each s.rows as r (r.label)}
						<tr>
							{#if !r.od && !r.os}
								<!-- Binocular measures (e.g. "NPC: 5 cm") carry their value in the label. -->
								<th scope="row" colspan="3" class="label">{rowLabel(r)}</th>
							{:else}
								<td class="od">{r.od}</td>
								<th scope="row" class="label">{rowLabel(r)}</th>
								<td>{r.os}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
			{/if}
			{#if s.table}
				<table class="grid" class:two={s.table.head.length === 2} class:eye-ltr={s.table.head.length > 2}>
					<thead><tr>{#each s.table.head as h, i (i)}<th scope="col">{h}</th>{/each}</tr></thead>
					<tbody>
						{#each s.table.body as row, r (r)}
							<tr>{#each row as c, i (i)}{#if i === 0}<th scope="row">{c}</th>{:else}<td>{c}</td>{/if}{/each}</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			{#if s.comments}<p class="comments"><strong>{t('report.commentsLabel')}</strong> <span dir={i18n.dir === 'rtl' ? 'auto' : undefined}>{s.comments}</span></p>{/if}
			{#if drawingIn(s.title)}{@render drawing(drawingIn(s.title)!)}{/if}
		</section>
		{#if i === hpiCount - 1}{@render pmsfh()}{/if}
	{:else}
		<p class="none">{t('report.noFindings')}</p>
	{/each}
	{#each drawnOnly.filter((z) => z !== 'IMPPLAN') as z (z)}
		<section>
			<h2>{drawingTitle(z)}</h2>
			{@render drawing(z)}
		</section>
	{/each}
	<ReportPlan plan={item.plan} />
	{#if drawn.includes('IMPPLAN')}
		<section>
			<h2>{t('report.impressionPlanDrawing')}</h2>
			{@render drawing('IMPPLAN')}
		</section>
	{/if}
	<ReportCodes codes={item.codes} />

	<footer>
		<ReportSignature provider={e.provider} signature={item.signature} />
		<div class="generated">{t('report.generated', { date: generatedOn })}</div>
	</footer>
</article>

<style>
	.report {
		--ink: #111;
		--ink-2: #444;
		--rule: #c9c9c9;
		color: var(--ink);
		background: #fff;
		font: 10.5pt/1.4 var(--font-sans, system-ui, sans-serif);
		max-width: 8.5in;
		margin: 0 auto;
		padding: 0.6in 0.7in;
		box-sizing: border-box;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1.5em;
		padding-bottom: 0.6em;
		border-bottom: 2px solid var(--ink);
	}
	.practice {
		display: grid;
		align-content: start;
		gap: 1px;
		font-size: 9.5pt;
		color: var(--ink-2);
	}
	.practice strong {
		font-size: 13pt;
		color: var(--ink);
	}
	.patient {
		display: grid;
		grid-template-columns: auto auto;
		gap: 1px 0.8em;
		margin: 0;
		font-size: 9.5pt;
	}
	.patient dt {
		color: var(--ink-2);
		text-align: end;
	}
	.patient dd {
		margin: 0;
	}
	h1 {
		font-size: 14pt;
		margin: 0.7em 0 0.3em;
	}
	.allergies {
		margin: 0 0 0.6em;
	}
	.allergies.listed {
		color: #8a1010;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.3em 1em;
	}
	.hblock h3 {
		font-size: 9pt;
		margin: 0;
		color: var(--ink-2);
	}
	.hblock ul {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 9.5pt;
	}
	.hblock li,
	.hblock .empty {
		overflow-wrap: anywhere;
		margin: 0;
		font-size: 9.5pt;
	}
	.empty {
		color: var(--ink-2);
	}
	section {
		break-inside: avoid;
		margin-top: 0.9em;
	}
	h2 {
		font-size: 11pt;
		margin: 0 0 0.25em;
		padding-bottom: 2px;
		border-bottom: 1px solid var(--rule);
		break-after: avoid;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	thead th {
		font-size: 8.5pt;
		font-weight: 600;
		color: var(--ink-2);
		text-align: start;
		padding: 0 0.5em 2px;
	}
	td,
	tbody th {
		padding: 2px 0.5em;
		vertical-align: top;
		border-bottom: 1px solid #ececec;
		overflow-wrap: anywhere;
	}
	.od {
		text-align: end;
	}
	.label {
		width: 26%;
		text-align: center;
		font-weight: 600;
	}
	.grid {
		margin-top: 0.3em;
	}
	.grid th,
	.grid td {
		text-align: start;
		width: auto;
	}
	.grid tbody th {
		font-weight: 600;
	}
	.grid td {
		white-space: pre-line;
	}
	/* Label / text tables (HPI): a narrow italic label column. */
	.grid.two thead th:first-child {
		width: 22%;
	}
	.grid.two tbody th {
		font-style: italic;
		font-weight: 400;
	}
	.summary {
		margin: 0.2em 0 0;
	}
	.comments {
		margin: 0.3em 0 0;
		white-space: pre-wrap;
	}
	.drawing {
		margin: 0.4em 0 0;
	}
	.drawing img {
		display: block;
		width: 3.375in;
		max-width: 100%;
		height: auto;
		aspect-ratio: 450 / 250;
		border: 1px solid var(--rule);
	}
	.none {
		color: var(--ink-2);
		font-style: italic;
		margin-top: 1em;
	}
	footer {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		margin-top: 2em;
		break-inside: avoid;
	}
   	.generated {
		font-size: 8pt;
		color: var(--ink-2);
	}
	@media screen {
		.report {
			box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
			margin-bottom: 1.5rem;
		}
	}
	@media print {
		.report {
			max-width: none;
			padding: 0;
		}
	}
	@media screen and (max-width: 700px) {
		.report {
			padding: 1.25rem 1rem;
		}
		header {
			flex-direction: column;
		}
		.cols {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
