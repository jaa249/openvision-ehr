<script lang="ts">
	import type { SectionDef } from '#lib/exam/catalog.ts';
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

	const prior = $derived(priors[index]);
	const v = (id: string) => prior?.findings[id]?.value ?? '';
	const rows = $derived(
		prior
			? sec.rows.filter((r) => v(r.od) || v(r.os)).map((r) => ({ label: r.label, unit: r.measure, od: v(r.od), os: v(r.os) }))
			: []
	);
	const hertel = $derived(sec.hertel && prior ? [v('ODHERTEL'), v('HERTELBASE'), v('OSHERTEL')] : null);
	const comments = $derived(prior ? v(sec.comments.field) : '');

	function fmt(date: string) {
		return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<section class="priors" aria-label="Prior visits">
	{#if priors.length === 0}
		<p class="empty">No earlier visits for this patient.</p>
	{:else}
		<div class="nav">
			<button type="button" onclick={() => (index = priors.length - 1)} disabled={index === priors.length - 1} aria-label="Oldest visit">⏮</button>
			<button type="button" onclick={() => index++} disabled={index === priors.length - 1} aria-label="Older visit">◀</button>
			<select bind:value={index} aria-label="Choose a prior visit">
				{#each priors as p, i (p.id)}
					<option value={i}>{fmt(p.date)}</option>
				{/each}
			</select>
			<button type="button" onclick={() => index--} disabled={index === 0} aria-label="Newer visit">▶</button>
			<button type="button" onclick={() => (index = 0)} disabled={index === 0} aria-label="Newest visit">⏭</button>
		</div>
		<p class="meta">{prior.visitType} · {prior.provider} · {index + 1} of {priors.length} earlier {priors.length === 1 ? 'visit' : 'visits'}</p>

		<div class="actions">
			<button type="button" class="primary" onclick={() => oncopysection(prior)} disabled={!rows.length && !comments && !hertel?.some(Boolean)}>
				Copy {sec.title.split(' (')[0]} forward
			</button>
			<button type="button" onclick={() => oncopyall(prior)}>Copy whole exam forward</button>
		</div>

		{#if rows.length || comments || hertel?.some(Boolean)}
			<table>
				<thead>
					<tr><th scope="col"><span class="visually-hidden">Finding</span></th><th scope="col" class="od">OD</th><th scope="col" class="os">OS</th></tr>
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
							<th scope="row">Hertel (base {hertel[1] || '–'})</th>
							<td>{hertel[0] || '–'}</td>
							<td>{hertel[2] || '–'}</td>
						</tr>
					{/if}
				</tbody>
			</table>
			{#if comments}<p class="comments">{comments}</p>{/if}
		{:else}
			<p class="empty">Nothing recorded in this section at that visit.</p>
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
