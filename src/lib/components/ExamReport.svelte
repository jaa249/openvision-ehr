<script lang="ts">
	import { buildReport } from '#lib/exam/report.ts';
	import type { PrintableEncounter, Practice } from '#lib/exam/types.ts';

	let { item, practice, generatedOn }: { item: PrintableEncounter; practice: Practice; generatedOn: string } = $props();

	const sections = $derived(buildReport(item.findings));
	const p = $derived(item.patient);
	const e = $derived(item.encounter);
</script>

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
		</dl>
	</header>

	<h1>Eye examination</h1>
	{#if p.allergies.length}
		<p class="allergies"><strong>Allergies:</strong> {p.allergies.map((a) => a.title + (a.reaction ? ` (${a.reaction})` : '')).join(', ')}</p>
	{/if}

	{#each sections as s (s.title)}
		<section>
			<h2>{s.title}</h2>
			<table>
				<thead>
					<tr><th scope="col" class="od">OD (right)</th><th scope="col" class="label"><span class="visually-hidden">Finding</span></th><th scope="col">OS (left)</th></tr>
				</thead>
				<tbody>
					{#each s.rows as r (r.label)}
						<tr>
							<td class="od">{r.od}</td>
							<th scope="row" class="label">{r.label}</th>
							<td>{r.os}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if s.comments}<p class="comments"><strong>Comments:</strong> {s.comments}</p>{/if}
		</section>
	{:else}
		<p class="none">No exam findings recorded for this visit.</p>
	{/each}

	<footer>
		<div class="sign">
			<span class="line"></span>
			<span>{e.provider}</span>
			<span class="draft">Not electronically signed (signing arrives in a later release)</span>
		</div>
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
		color: #8a1010;
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
	.comments {
		margin: 0.3em 0 0;
		white-space: pre-wrap;
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
	.sign {
		display: grid;
		gap: 2px;
		font-size: 9.5pt;
		min-width: 3in;
	}
	.line {
		border-bottom: 1px solid var(--ink);
		height: 2em;
	}
	.draft {
		color: var(--ink-2);
		font-size: 8.5pt;
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
	}
</style>
