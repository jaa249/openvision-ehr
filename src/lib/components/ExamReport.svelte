<script lang="ts">
	import { buildReport } from '#lib/exam/report.ts';
	import type { PrintableEncounter, Practice } from '#lib/exam/types.ts';
	import { historyReport } from '#lib/exam/sections/history.ts';
	import ReportPlan from './report/ReportPlan.svelte';
	import ReportSignature from './report/ReportSignature.svelte';
	import { allergyStatusText, issueLine, summarizeFamily, summarizeSocial, visibleIssues } from '#lib/history/summary.ts';

	let { item, practice, generatedOn }: { item: PrintableEncounter; practice: Practice; generatedOn: string } = $props();

	const sections = $derived(buildReport(item.findings));
	const p = $derived(item.patient);
	const e = $derived(item.encounter);

	// Drawings (spec §13.4): the latest saved drawing prints with its section; none means nothing.
	const DRAWING_TITLES: Record<string, string> = {
		HPI: 'History of present illness',
		EXT: 'External',
		ANTSEG: 'Anterior segment',
		NEURO: 'Neuro',
		RETINA: 'Retina',
		IMPPLAN: 'Impression/Plan'
	};
	const drawn = $derived(item.drawingZones ?? []);
	const drawingIn = (title: string) => drawn.find((z) => DRAWING_TITLES[z] === title);
	/** Drawn zones whose section has no recorded findings still print, after the sections. */
	const drawnOnly = $derived(drawn.filter((z) => !sections.some((s) => s.title === DRAWING_TITLES[z])));
	// PMSFH (spec §13.2 item 2) prints right after the HPI block, which history.ts puts first in `sections`.
	const hpiCount = $derived(historyReport(item.findings).length);
	const history = $derived(item.history);
	/** Compact blocks; empty lists say "None" (FH "Not recorded"), and the block is skipped when the whole history is empty. */
	const historyBlocks = $derived.by(() => {
		const h = item.history;
		if (!h) return [];
		const lines = (t: Parameters<typeof visibleIssues>[1]) => visibleIssues(h.issues, t).map((i) => issueLine(i) + (i.active ? '' : ' (inactive)'));
		const fh = summarizeFamily(h.family);
		const meds = [...visibleIssues(h.issues, 'MED').map(issueLine), ...visibleIssues(h.issues, 'EYEMED').map((i) => `${issueLine(i)} (eye)`)];
		const social = summarizeSocial(h.social);
		const blocks = [
			{ title: 'POH', lines: lines('POH'), empty: 'None' },
			{ title: 'Eye surgery', lines: lines('POS'), empty: 'None' },
			{ title: 'PMH', lines: lines('PMH'), empty: 'None' },
			{ title: 'Medication', lines: meds, empty: 'None' },
			{ title: 'Surgery', lines: lines('SURG'), empty: 'None' },
			{ title: 'Allergy', lines: lines('ALLERGY'), empty: allergyStatusText(h.allergyStatus) },
			{ title: 'Social', lines: social, empty: 'Not documented' },
			{ title: 'FH', lines: fh.state === 'positive' ? fh.lines : [], empty: fh.state === 'negative' ? 'Negative' : 'Not recorded' }
		];
		const anything = h.issues.length > 0 || fh.state !== 'unrecorded' || social.length > 0 || h.allergyStatus.kind !== 'unknown';
		return anything ? blocks : [];
	});
	const drawingUrl = (zone: string) => `/api/patients/${p.id}/encounters/${e.id}/drawings/${zone}`;
</script>

{#snippet pmsfh()}
	{#if history}
		<section class="pmsfh">
			<h2>Past history</h2>
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
				<p class="empty">No past history recorded.</p>
			{/if}
		</section>
	{/if}
{/snippet}

{#snippet drawing(zone: string)}
	<figure class="drawing">
		<img src={drawingUrl(zone)} width="324" height="180" alt="{DRAWING_TITLES[zone] ?? zone} drawing, OD on the left" />
	</figure>
{/snippet}

<!-- One encounter on paper. Colours are fixed (paper is white in every theme). -->
<article class="report" aria-label="Exam report for {p.legalName}, {e.date}">
	<header>
		<div class="practice">
			<strong>{practice.name}</strong>
			{#if practice.address}<span>{practice.address}</span>{/if}
			<span>
				{#if practice.phone}Phone {practice.phone}{/if}{#if practice.phone && practice.fax}&ensp;·&ensp;{/if}{#if practice.fax}Fax {practice.fax}{/if}
			</span>
		</div>
		<dl class="patient">
			<dt>Patient</dt>
			<dd>
				<strong>{p.legalName}</strong>{#if p.preferredName}&nbsp;(&ldquo;{p.preferredName}&rdquo;){/if}
			</dd>
			<dt>DOB</dt>
			<dd>{p.dob} ({p.age} y)</dd>
			<dt>MRN</dt>
			<dd>{p.mrn}</dd>
			<dt>Visit</dt>
			<dd>{e.date} · {e.visitType}</dd>
			<dt>Provider</dt>
			<dd>{e.provider}</dd>
			{#if e.technician}
				<dt>Technician</dt>
				<dd>{e.technician}</dd>
			{/if}
		</dl>
	</header>

	<h1>Eye examination</h1>
	<!-- Always printed: "Not recorded" must never be mistaken for "no allergies". -->
	<p class="allergies" class:listed={p.allergyStatus.kind === 'listed'}><strong>Allergies:</strong> {allergyStatusText(p.allergyStatus)}</p>

	{#if hpiCount === 0}{@render pmsfh()}{/if}
	{#each sections as s, i (s.title)}
		<section>
			<h2>{s.title}</h2>
			{#if s.summary}<p class="summary">{s.summary}</p>{/if}
			{#if s.rows.length}
			<table>
				<thead>
					<tr><th scope="col" class="od">OD (right)</th><th scope="col" class="label"><span class="visually-hidden">Finding</span></th><th scope="col">OS (left)</th></tr>
				</thead>
				<tbody>
					{#each s.rows as r (r.label)}
						<tr>
							{#if !r.od && !r.os}
								<!-- Binocular measures (e.g. "NPC: 5 cm") carry their value in the label. -->
								<th scope="row" colspan="3" class="label">{r.label}</th>
							{:else}
								<td class="od">{r.od}</td>
								<th scope="row" class="label">{r.label}</th>
								<td>{r.os}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
			{/if}
			{#if s.table}
				<table class="grid" class:two={s.table.head.length === 2}>
					<thead><tr>{#each s.table.head as h, i (i)}<th scope="col">{h}</th>{/each}</tr></thead>
					<tbody>
						{#each s.table.body as row, r (r)}
							<tr>{#each row as c, i (i)}{#if i === 0}<th scope="row">{c}</th>{:else}<td>{c}</td>{/if}{/each}</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			{#if s.comments}<p class="comments"><strong>Comments:</strong> {s.comments}</p>{/if}
			{#if drawingIn(s.title)}{@render drawing(drawingIn(s.title)!)}{/if}
		</section>
		{#if i === hpiCount - 1}{@render pmsfh()}{/if}
	{:else}
		<p class="none">No exam findings recorded for this visit.</p>
	{/each}
	{#each drawnOnly.filter((z) => z !== 'IMPPLAN') as z (z)}
		<section>
			<h2>{DRAWING_TITLES[z] ?? z}</h2>
			{@render drawing(z)}
		</section>
	{/each}
	<ReportPlan plan={item.plan} />
	{#if drawn.includes('IMPPLAN')}
		<section>
			<h2>Impression/Plan drawing</h2>
			{@render drawing('IMPPLAN')}
		</section>
	{/if}

	<footer>
		<ReportSignature provider={e.provider} signature={item.signature} />
		<div class="generated">Generated {generatedOn} · OpenVision</div>
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
		text-align: right;
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
		text-align: left;
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
		text-align: right;
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
		text-align: left;
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
