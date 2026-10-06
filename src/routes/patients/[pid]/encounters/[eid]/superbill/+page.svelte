<script lang="ts">
	// Printable superbill: the coding lines saved from the Coding panel (spec §11.4 FIX, decision D7).
	import { VISIT_STATUSES } from '#lib/coding/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const p = $derived(data.patient);
	const e = $derived(data.encounter);
	const dx = $derived(data.lines.dx);
	const cpt = $derived(data.lines.cpt);
	const longDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' });
	const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const statusLabel = $derived(VISIT_STATUSES.find((s) => s.id === data.status)?.label ?? '');
	const reviewed = $derived(
		data.lines.savedBy ? ` (${data.lines.savedBy}${data.lines.savedAt ? `, saved ${stamp(data.lines.savedAt)}` : ''})` : ''
	);
</script>

<svelte:head>
	<title>Superbill · {p.legalName} · {e.date}</title>
</svelte:head>

<div class="toolbar">
	<button type="button" class="primary" onclick={() => window.print()}>Print superbill</button>
	<span>Opens the print dialog. Choose "Save as PDF" to keep a file.</span>
</div>

<article class="sheet" aria-label="Superbill">
	<header>
		<div class="practice">
			<strong>{data.practice.name}</strong>
			{#if data.practice.address}<span>{data.practice.address}</span>{/if}
			{#if data.practice.phone || data.practice.fax}
				<span>
					{#if data.practice.phone}Phone {data.practice.phone}{/if}
					{#if data.practice.phone && data.practice.fax}·{/if}
					{#if data.practice.fax}Fax {data.practice.fax}{/if}
				</span>
			{/if}
		</div>
		<dl class="patient">
			<dt>Patient</dt>
			<dd>{p.legalName}</dd>
			<dt>MRN</dt>
			<dd>{p.mrn}</dd>
			<dt>Date of birth</dt>
			<dd>{p.dob}</dd>
		</dl>
	</header>

	<h1>Superbill</h1>
	<dl class="visit">
		<dt>Visit date</dt>
		<dd>{longDate(e.date)}</dd>
		<dt>Visit type</dt>
		<dd>{e.visitType}</dd>
		<dt>Provider</dt>
		<dd>{e.provider}</dd>
		<dt>Status</dt>
		<dd>{statusLabel}</dd>
	</dl>

	{#if !dx.length && !cpt.length}
		<p class="empty">No coding lines saved for this visit yet. Open the Coding panel and choose "Save coding lines".</p>
	{:else}
		<section>
			<h2>Diagnoses (ICD-10-CM)</h2>
			{#if dx.length}
				<table>
					<thead>
						<tr><th scope="col" class="ptr">Pointer</th><th scope="col" class="code">Code</th><th scope="col">Impression</th></tr>
					</thead>
					<tbody>
						{#each dx as d (d.letter)}
							<tr><td class="ptr">{d.letter}</td><td class="code">{d.code}</td><td>{d.title}</td></tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">No coded diagnoses.</p>
			{/if}
		</section>

		<section>
			<h2>Procedures (CPT)</h2>
			<table>
				<thead>
					<tr>
						<th scope="col" class="code">Code</th>
						<th scope="col">Description</th>
						<th scope="col" class="mod">Modifiers</th>
						<th scope="col" class="ptr">Dx pointers</th>
						<th scope="col" class="units">Units</th>
					</tr>
				</thead>
				<tbody>
					{#each cpt as l, i (i)}
						<tr>
							<td class="code">{l.code}</td>
							<td>{l.description}</td>
							<td class="mod">{l.modifiers.join(', ') || '—'}</td>
							<td class="ptr">{l.pointers.join(' ') || '—'}</td>
							<td class="units">{l.units}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<footer>
		<p class="note">
			Codes were suggested by OpenVision and reviewed by the provider{reviewed}. Fees are not shown: they come from your billing system.
		</p>
		<p class="sig">Provider signature <span class="line"></span></p>
	</footer>
</article>

<style>
	:global(body) {
		background: var(--surface-0);
	}
	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		max-width: 8.5in;
		margin: var(--space-4) auto;
		padding: 0 var(--space-4);
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.primary {
		min-height: 40px;
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	/* Paper: fixed ink colors so it prints the same in every theme (like the exam report). */
	.sheet {
		--ink: #111;
		--ink-2: #444;
		--rule: #c9c9c9;
		color: var(--ink);
		background: #fff;
		font: 10.5pt/1.4 var(--font-sans, system-ui, sans-serif);
		max-width: 8.5in;
		margin: 0 auto var(--space-6);
		padding: 0.6in 0.7in;
		box-sizing: border-box;
		box-shadow: var(--shadow-overlay);
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1.5em;
		flex-wrap: wrap;
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
	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 1px 0.8em;
		margin: 0;
		font-size: 9.5pt;
	}
	dt {
		color: var(--ink-2);
		text-align: right;
	}
	dd {
		margin: 0;
	}
	.visit {
		grid-template-columns: auto 1fr auto 1fr;
		margin-bottom: 0.8em;
	}
	h1 {
		font-size: 14pt;
		margin: 0.7em 0 0.3em;
	}
	h2 {
		font-size: 10.5pt;
		margin: 1em 0 0.3em;
		padding-bottom: 2px;
		border-bottom: 1px solid var(--rule);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 9.5pt;
	}
	th,
	td {
		text-align: left;
		padding: 3px 6px;
		border-bottom: 1px solid var(--rule);
		vertical-align: top;
	}
	th {
		color: var(--ink-2);
		font-weight: 600;
	}
	.code {
		width: 6em;
		font-family: var(--font-mono, monospace);
	}
	.ptr {
		width: 6em;
	}
	.mod {
		width: 7em;
	}
	.units {
		width: 3.5em;
		text-align: right;
	}
	.empty {
		color: var(--ink-2);
	}
	footer {
		margin-top: 1.5em;
		font-size: 9pt;
		color: var(--ink-2);
	}
	.sig {
		margin-top: 2.5em;
		display: flex;
		align-items: end;
		gap: 0.6em;
	}
	.line {
		flex: 1;
		border-bottom: 1px solid var(--ink);
		height: 1.2em;
	}
	@media (max-width: 700px) {
		.sheet {
			padding: var(--space-4);
		}
		.visit {
			grid-template-columns: auto 1fr;
		}
	}
	@media print {
		:global(body) {
			background: #fff;
		}
		.toolbar {
			display: none;
		}
		.sheet {
			box-shadow: none;
			margin: 0;
			padding: 0;
			max-width: none;
		}
		@page {
			margin: 0.6in;
		}
	}
</style>
