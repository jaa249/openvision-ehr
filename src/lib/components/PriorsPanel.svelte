<script lang="ts">
	import { rowLabel, sectionTitle, type SectionDef } from '#lib/exam/catalog.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PriorVisit } from '#lib/exam/types.ts';

	let {
		sec,
		priors,
		index = $bindable(0),
		oncopysection,
		oncopyall
	}: {
		sec: SectionDef;
		/** Newest first. */
		priors: PriorVisit[];
		index: number;
		oncopysection: (prior: PriorVisit) => void;
		oncopyall: (prior: PriorVisit) => void;
	} = $props();

	const i18n = useI18n();
	const { t } = i18n;
	const prior = $derived(priors[index]);
	const v = (id: string) => prior?.findings[id]?.value ?? '';
	const rows = $derived(
		prior
			? sec.rows.filter((r) => v(r.od) || v(r.os)).map((r) => ({ label: rowLabel(r, t), unit: r.measure, od: v(r.od), os: v(r.os) }))
			: []
	);
	const hertel = $derived(sec.hertel && prior ? [v('ODHERTEL'), v('HERTELBASE'), v('OSHERTEL')] : null);
	const comments = $derived(prior ? v(sec.comments.field) : '');

	const fmt = (date: string) => i18n.date(date);
</script>

<section class="priors" aria-label={t('exam.priorsLabel')}>
	{#if priors.length === 0}
		<p class="empty">{t('exam.priorsNone')}</p>
	{:else}
		<div class="nav">
			<button type="button" onclick={() => (index = priors.length - 1)} disabled={index === priors.length - 1} aria-label={t('exam.priorsOldest')}>⏮</button>
			<button type="button" onclick={() => index++} disabled={index === priors.length - 1} aria-label={t('exam.priorsOlder')}>◀</button>
			<select bind:value={index} aria-label={t('exam.priorsChoose')}>
				{#each priors as p, i (p.id)}
					<option value={i}>{fmt(p.date)}</option>
				{/each}
			</select>
			<button type="button" onclick={() => index--} disabled={index === 0} aria-label={t('exam.priorsNewer')}>▶</button>
			<button type="button" onclick={() => (index = 0)} disabled={index === 0} aria-label={t('exam.priorsNewest')}>⏭</button>
		</div>
		<p class="meta">{prior.visitType} · {prior.provider} · {t('exam.priorsPosition', { index: index + 1, count: priors.length })}</p>

		<div class="actions">
			<button type="button" class="primary" onclick={() => oncopysection(prior)} disabled={!rows.length && !comments && !hertel?.some(Boolean)}>
				{t('exam.priorsCopySection', { section: sectionTitle(sec, t, true) })}
			</button>
			<button type="button" onclick={() => oncopyall(prior)}>{t('exam.priorsCopyAll')}</button>
		</div>

		{#if rows.length || comments || hertel?.some(Boolean)}
			<table>
				<thead>
					<tr><th scope="col"><span class="visually-hidden">{t('exam.finding')}</span></th><th scope="col" class="od">OD</th><th scope="col" class="os">OS</th></tr>
				</thead>
				<tbody>
					{#each rows as r (r.label)}
						<tr>
							<th scope="row">{r.label}</th>
							<td>{r.od || '–'}{r.od && r.unit ? ` ${r.unit}` : ''}</td>
							<td>{r.os || '–'}{r.os && r.unit ? ` ${r.unit}` : ''}</td>
						</tr>
					{/each}
					{#if hertel?.some(Boolean)}
						<tr>
							<th scope="row">{t('exam.priorsHertel', { base: hertel[1] || '–' })}</th>
							<td>{hertel[0] || '–'}</td>
							<td>{hertel[2] || '–'}</td>
						</tr>
					{/if}
				</tbody>
			</table>
			{#if comments}<p class="comments">{comments}</p>{/if}
		{:else}
			<p class="empty">{t('exam.priorsNothing')}</p>
		{/if}
	{/if}
</section>

<style>
	.priors {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
		align-content: start;
	}
	.nav {
		display: flex;
		gap: 4px;
	}
	.nav button {
		min-width: 36px;
		padding: 0;
	}
	select {
		flex: 1 1 0;
		width: 0;
		min-width: 0;
		min-height: var(--target-min);
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 0 var(--space-2);
	}
	.meta {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.primary:disabled {
		opacity: 0.5;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
		font-size: var(--text-sm);
	}
	th,
	td {
		text-align: left;
		padding: 6px var(--space-2);
		border-bottom: 1px solid var(--hairline);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	tbody th {
		font-weight: var(--weight-regular);
		color: var(--text-2);
		width: 36%;
	}
	thead .od {
		color: var(--od);
	}
	thead .os {
		color: var(--os);
	}
	.comments {
		font-size: var(--text-sm);
		color: var(--text-2);
		margin: 0;
		white-space: pre-wrap;
	}
	.empty {
		color: var(--text-3);
		font-size: var(--text-sm);
	}
</style>
