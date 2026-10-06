<script lang="ts">
	import { MAX_PRINT } from '#lib/exam/print.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let selected = $state(new Set<number>());
	// A new search starts a fresh selection, so nothing hidden by the filter gets printed.
	$effect(() => {
		void data.encounters;
		selected = new Set();
	});

	const all = $derived(data.encounters.length > 0 && selected.size === data.encounters.length);
	const some = $derived(selected.size > 0 && !all);
	const tooMany = $derived(selected.size > MAX_PRINT);

	function toggle(id: number) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	function toggleAll() {
		selected = all ? new Set() : new Set(data.encounters.map((e) => e.id));
	}
	// Keep list order (newest first); the print page groups them by patient.
	const selectedIds = () => data.encounters.filter((e) => selected.has(e.id)).map((e) => e.id).join(',');
	function printSelected() {
		if (!selected.size || tooMany) return;
		window.open(`/print?auto=1&ids=${selectedIds()}`, '_blank');
	}
	/** Downloads a file; the page stays put. */
	function exportSelected(format: 'csv' | 'fhir') {
		if (selected.size) window.location.href = `/export/${format}?ids=${selectedIds()}`;
	}
	function setRange(days: number | null) {
		const f = document.getElementById('filters') as HTMLFormElement;
		// Local calendar date (toISOString would give tomorrow's date late in the evening).
		const iso = (d: Date) =>
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const today = new Date();
		(f.elements.namedItem('to') as HTMLInputElement).value = days === null ? '' : iso(today);
		(f.elements.namedItem('from') as HTMLInputElement).value =
			days === null ? '' : iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
		f.requestSubmit();
	}
</script>

<svelte:head><title>Encounters · OpenVision</title></svelte:head>

<main>
	<nav class="crumbs"><a href="/">← Patients</a></nav>
	<h1>Encounters</h1>
	<p class="sub">
		Find visits, tick the ones you need, then print them together (each report on its own page) or export them:
		<strong>CSV</strong> for spreadsheets, <strong>FHIR</strong> for other EHR systems.
	</p>

	<form id="filters" class="filters" method="GET">
		<label>From <input type="date" name="from" value={data.filter.from} /></label>
		<label>To <input type="date" name="to" value={data.filter.to} /></label>
		<label class="grow">Patient <input type="search" name="q" value={data.filter.query} placeholder="Name or MRN" /></label>
		<button type="submit">Search</button>
		<span class="quick" role="group" aria-label="Quick ranges">
			<button type="button" onclick={() => setRange(0)}>Today</button>
			<button type="button" onclick={() => setRange(7)}>Last 7 days</button>
			<button type="button" onclick={() => setRange(null)}>All</button>
		</span>
	</form>

	<div class="actions">
		<span class="count" aria-live="polite">
			{selected.size} of {data.encounters.length} selected
			{#if tooMany}<span class="warn">· at most {MAX_PRINT} per print job</span>{/if}
		</span>
		<span class="buttons">
			<button type="button" disabled={!selected.size} onclick={() => exportSelected('csv')}>Export CSV</button>
			<button type="button" disabled={!selected.size} onclick={() => exportSelected('fhir')}>Export FHIR</button>
			<button type="button" class="primary" disabled={!selected.size || tooMany} onclick={printSelected}>
				Print selected{selected.size ? ` (${selected.size})` : ''}
			</button>
		</span>
	</div>

	{#if data.encounters.length}
		<table>
			<thead>
				<tr>
					<th scope="col" class="check">
						<input type="checkbox" checked={all} indeterminate={some} onchange={toggleAll} aria-label="Select all shown" />
					</th>
					<th scope="col">Date</th>
					<th scope="col">Patient</th>
					<th scope="col">MRN</th>
					<th scope="col">Visit</th>
					<th scope="col">Provider</th>
					<th scope="col" class="num">Findings</th>
					<th scope="col"><span class="visually-hidden">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.encounters as e (e.id)}
					<tr class:on={selected.has(e.id)}>
						<td class="check">
							<input
								type="checkbox"
								checked={selected.has(e.id)}
								onchange={() => toggle(e.id)}
								aria-label="Select {e.patientName}, {e.date}"
							/>
						</td>
						<td class="num">{e.date}</td>
						<td>{e.patientName}</td>
						<td class="num">{e.mrn}</td>
						<td>{e.visitType}</td>
						<td>{e.provider}{#if e.technician}<span class="tech"><br />Tech: {e.technician}</span>{/if}</td>
						<td class="num">{e.findingCount || '–'}</td>
						<td class="links">
							<a href="/patients/{e.patientId}/encounters/{e.id}">Open</a>
							<a href="/print?ids={e.id}" target="_blank" rel="noopener">Print</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="empty">No encounters match. Try a wider date range.</p>
	{/if}
</main>

<style>
	main {
		max-width: 1080px;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4) var(--space-6);
	}
	.crumbs {
		font-size: var(--text-sm);
	}
	h1 {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: var(--space-2) 0 var(--space-1);
	}
	.sub {
		color: var(--text-2);
		margin: 0 0 var(--space-4);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
	}
	.filters label {
		display: grid;
		gap: 2px;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.filters .grow {
		flex: 1 1 200px;
	}
	.filters input {
		min-height: var(--target-min);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 0 var(--space-2);
	}
	.quick {
		display: inline-flex;
		gap: var(--space-1);
	}
	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin: var(--space-4) 0 var(--space-2);
	}
	.buttons {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: flex-end;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.count {
		color: var(--text-2);
	}
	.warn {
		color: var(--danger);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
	}
	th,
	td {
		text-align: left;
		padding: 0 var(--space-3);
		height: var(--row-height);
		border-bottom: 1px solid var(--hairline);
	}
	thead th {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-3);
		font-weight: var(--weight-semibold);
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	tr.on td {
		background: var(--accent-soft);
	}
	.check {
		width: 44px;
	}
	.check input {
		width: 20px;
		height: 20px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.links {
		white-space: nowrap;
		text-align: right;
	}
	.links a + a {
		margin-left: var(--space-3);
	}
	.empty {
		color: var(--text-3);
	}
	@media (max-width: 760px) {
		table thead th:nth-child(4),
		table td:nth-child(4),
		table thead th:nth-child(6),
		table td:nth-child(6),
		table thead th:nth-child(7),
		table td:nth-child(7) {
			display: none;
		}
		th,
		td {
			padding: 0 var(--space-2);
		}
	}
</style>
