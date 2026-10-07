<script lang="ts">
	// Dispensed (printed) glasses and contact lens Rx for this patient, newest first (spec §12.6).
	// Labels are in the reader's language (D48); the dispensed values stay as recorded.
	import { enhance } from '$app/forms';
	import { rxTable } from '#lib/exam/sections/refraction.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import { METHOD_KEY, RX_TABLE_HEAD_KEY, rxTypeKey } from '../labels.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t, dateTime } = useI18n();

	let confirming = $state<number | null>(null);
	const p = $derived(data.patient);
	const when = (iso: string) => dateTime(iso);
	const head = (h: string) => (RX_TABLE_HEAD_KEY[h] ? t(RX_TABLE_HEAD_KEY[h]) : h);
	const today = new Date().toISOString().slice(0, 10);
</script>

<svelte:head><title>{t('rx.historyPageTitle', { name: p.legalName })}</title></svelte:head>

<div class="page">
	<nav class="crumbs">
		<a href="/patients/{p.id}/encounters/{data.encounter.id}">{t('rx.backToExam')}</a>
	</nav>
	<h1>{t('rx.historyHeading')} <span class="who">{t('report.patientLine', { name: p.legalName, dob: p.dob, mrn: p.mrn })}</span></h1>

	<p class="status" role="status" aria-live="polite">
		{#if form?.message}<span class="error">{form.message}</span>{:else if form?.deleted}{t('rx.historyDeleted')}{/if}
	</p>

	{#if data.records.length === 0}
		<div class="empty">
			<p>{t('rx.historyEmpty')}</p>
			<p><Msg key="rx.historyEmptyHow">{#snippet printRx()}<strong>{t('rx.historyPrintRx')}</strong>{/snippet}</Msg></p>
		</div>
	{:else}
		<ol class="list">
			{#each data.records as r (r.id)}
				{@const table = rxTable(r.kind, r.values)}
				{@const expired = r.expiresOn < today}
				{@const typeKey = rxTypeKey(r.rxType)}
				<li class="card">
					<div class="top">
						<div>
							<h2>
								{r.kind === 'W' ? t('rx.historyGlassesNumber', { method: t(METHOD_KEY.W), number: r.source.slice(1) }) : t(METHOD_KEY[r.kind])}
								{#if r.rxType !== '' && r.kind !== 'CTL'}<span class="type">{typeKey ? t(typeKey) : ''}</span>{/if}
							</h2>
							<dl class="meta">
								<div><dt>{t('rx.historyPrinted')}</dt><dd>{when(r.printedAt)}</dd></div>
								<div><dt>{t('report.visit')}</dt><dd><a href="/patients/{p.id}/encounters/{r.encounterId}">{r.visitDate}</a></dd></div>
								<div><dt>{t('rx.historyExpires')}</dt><dd class:expired>{expired ? t('rx.historyExpired', { date: r.expiresOn }) : r.expiresOn}</dd></div>
								<div><dt>{t('report.provider')}</dt><dd>{r.provider}</dd></div>
							</dl>
						</div>
						<div class="actions">
							{#if confirming === r.id}
								<form method="POST" action="?/delete" use:enhance={() => async ({ update }) => { confirming = null; await update(); }}>
									<input type="hidden" name="id" value={r.id} />
									<span class="ask">{t('rx.historyConfirmDelete')}</span>
									<button type="submit" class="danger">{t('rx.historyDelete')}</button>
									<button type="button" onclick={() => (confirming = null)}>{t('rx.historyCancel')}</button>
								</form>
							{:else}
								<button type="button" onclick={() => (confirming = r.id)} aria-label={t('rx.historyDeleteAria', { when: when(r.printedAt) })}>{t('rx.historyDelete')}</button>
							{/if}
						</div>
					</div>
					<div class="scroll">
						<table>
							<thead><tr>{#each table.head as h, i (i)}<th scope="col">{head(h)}</th>{/each}</tr></thead>
							<tbody>
								{#each table.body as row, ri (ri)}
									<tr>{#each row as c, i (i)}{#if i === 0}<th scope="row">{c}</th>{:else}<td>{c || '–'}</td>{/if}{/each}</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if r.values.BPDD || r.values.BPDN || r.values.LENS_MATERIAL || r.values.LENS_TREATMENTS}
						<p class="extra">
							{#if r.values.BPDD}{r.values.BPDN ? t('rx.historyPdNear', { dist: r.values.BPDD, near: r.values.BPDN }) : t('rx.historyPd', { dist: r.values.BPDD })}{/if}
							{#if r.values.LENS_MATERIAL}{t('rx.historyMaterial', { material: r.values.LENS_MATERIAL })}{/if}
							{#if r.values.LENS_TREATMENTS}{t('rx.historyTreatments', { treatments: r.values.LENS_TREATMENTS.split('|').join(', ') })}{/if}
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
