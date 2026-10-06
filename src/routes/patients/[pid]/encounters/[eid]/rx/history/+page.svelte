<script lang="ts">
	// Dispensed (printed) glasses and contact lens Rx for this patient, newest first (spec §12.6).
	import { enhance } from '$app/forms';
	import { METHOD_LABEL, RX_TYPES, rxTable } from '#lib/exam/sections/refraction.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let confirming = $state<number | null>(null);
	const p = $derived(data.patient);
	const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const today = new Date().toISOString().slice(0, 10);
</script>

<svelte:head><title>Dispensed Rx · {p.legalName} · OpenVision</title></svelte:head>

<div class="page">
	<nav class="crumbs">
		<a href="/patients/{p.id}/encounters/{data.encounter.id}">← Exam</a>
	</nav>
	<h1>Dispensed Rx <span class="who">{p.legalName} · DOB {p.dob} · MRN {p.mrn}</span></h1>

	<p class="status" role="status" aria-live="polite">
		{#if form?.message}<span class="error">{form.message}</span>{:else if form?.deleted}Record deleted.{/if}
	</p>

	{#if data.records.length === 0}
		<div class="empty">
			<p>No glasses or contact lens prescriptions have been printed for this patient yet.</p>
			<p>Use <strong>Print Rx</strong> on a refraction in the exam; each printed Rx is listed here.</p>
		</div>
	{:else}
		<ol class="list">
			{#each data.records as r (r.id)}
				{@const t = rxTable(r.kind, r.values)}
				{@const expired = r.expiresOn < today}
				<li class="card">
					<div class="top">
						<div>
							<h2>
								{METHOD_LABEL[r.kind]}{r.kind === 'W' ? ` #${r.source.slice(1)}` : ''}
								{#if r.rxType !== '' && r.kind !== 'CTL'}<span class="type">{RX_TYPES[Number(r.rxType)]}</span>{/if}
							</h2>
							<dl class="meta">
								<div><dt>Printed</dt><dd>{when(r.printedAt)}</dd></div>
								<div><dt>Visit</dt><dd><a href="/patients/{p.id}/encounters/{r.encounterId}">{r.visitDate}</a></dd></div>
								<div><dt>Expires</dt><dd class:expired>{r.expiresOn}{expired ? ' (expired)' : ''}</dd></div>
								<div><dt>Provider</dt><dd>{r.provider}</dd></div>
							</dl>
						</div>
						<div class="actions">
							{#if confirming === r.id}
								<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => { confirming = null; await update(); }}>
									<input type="hidden" name="id" value={r.id} />
									<span class="ask">Delete this record?</span>
									<button type="submit" class="danger">Delete</button>
									<button type="button" onclick={() => (confirming = null)}>Cancel</button>
								</form>
							{:else}
								<button type="button" onclick={() => (confirming = r.id)} aria-label="Delete record printed {when(r.printedAt)}">Delete</button>
							{/if}
						</div>
					</div>
					<div class="scroll">
						<table>
							<thead><tr>{#each t.head as h, i (i)}<th scope="col">{h}</th>{/each}</tr></thead>
							<tbody>
								{#each t.body as row, ri (ri)}
									<tr>{#each row as c, i (i)}{#if i === 0}<th scope="row">{c}</th>{:else}<td>{c || '–'}</td>{/if}{/each}</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if r.values.BPDD || r.values.BPDN || r.values.LENS_MATERIAL || r.values.LENS_TREATMENTS}
						<p class="extra">
							{#if r.values.BPDD}PD {r.values.BPDD}{r.values.BPDN ? ` / ${r.values.BPDN}` : ''}.{/if}
							{#if r.values.LENS_MATERIAL}Material: {r.values.LENS_MATERIAL}.{/if}
							{#if r.values.LENS_TREATMENTS}Treatments: {r.values.LENS_TREATMENTS.split('|').join(', ')}.{/if}
						</p>
					{/if}
					{#if r.values.COMMENTS}<p class="extra">{r.values.COMMENTS}</p>{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-4);
	}
	.crumbs a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
	}
	h1 {
		font-size: var(--text-lg);
		margin: var(--space-2) 0;
	}
	.who {
		display: block;
		font-size: var(--text-sm);
		font-weight: var(--weight-regular);
		color: var(--text-2);
	}
	.status {
		min-height: 1.4em;
		color: var(--text-2);
	}
	.error {
		color: var(--danger);
	}
	.empty {
		color: var(--text-2);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-4);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-3);
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-3);
	}
	.top {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	h2 {
		font-size: var(--text-md);
		margin: 0;
	}
	.type {
		font-size: var(--text-sm);
		font-weight: var(--weight-regular);
		color: var(--text-2);
		margin-left: var(--space-2);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
	}
	.meta div {
		display: flex;
		gap: var(--space-1);
	}
	.meta dt {
		color: var(--text-3);
	}
	.meta dd {
		margin: 0;
	}
	.expired {
		color: var(--abnormal);
	}
	.actions form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.ask {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.danger {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--accent-text);
	}
	.scroll {
		overflow-x: auto;
		margin-top: var(--space-2);
	}
	table {
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
		font-size: var(--text-sm);
	}
	th,
	td {
		text-align: left;
		padding: 2px var(--space-3) 2px 0;
		white-space: nowrap;
	}
	thead th {
		color: var(--text-3);
		font-weight: var(--weight-regular);
		font-size: var(--text-xs);
	}
	.extra {
		margin: var(--space-2) 0 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		white-space: pre-wrap;
	}
</style>
