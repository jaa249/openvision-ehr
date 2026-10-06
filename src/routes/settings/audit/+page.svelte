<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const pageHref = (n: number) => {
		const p = new URLSearchParams(Object.entries(data.raw).filter(([, v]) => v));
		p.set('page', String(n));
		return `?${p}`;
	};
	const when = (iso: string) => iso.replace('T', ' ').slice(0, 19) + ' UTC';
</script>

<svelte:head><title>Audit log · Settings · OpenVision</title></svelte:head>

<h2>Audit log</h2>
<p class="lead">Sign-ins, account and settings changes, chart and exam views, signing and lock events. Read-only: entries can never be edited or deleted.</p>

<form method="GET" class="ov-form filters" role="search" aria-label="Filter the audit log">
	<div class="card">
		<div class="grid">
			<div class="field">
				<label for="f-user">User</label>
				<select id="f-user" name="user">
					<option value="">Anyone</option>
					{#each data.users as u (u.id)}<option value={u.id} selected={data.raw.user === String(u.id)}>{u.label}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-patient">Patient (MRN or id)</label>
				<input id="f-patient" name="patient" value={data.raw.patient} autocomplete="off" aria-invalid={data.errors.patient ? 'true' : undefined} aria-describedby={data.errors.patient ? 'f-patient-err' : undefined} />
				{#if data.errors.patient}<p class="err" id="f-patient-err">{data.errors.patient}</p>{/if}
			</div>
			<div class="field">
				<label for="f-action">Action</label>
				<select id="f-action" name="action">
					<option value="">Any</option>
					{#each data.actions as a (a)}<option value={a} selected={data.raw.action === a}>{a}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-from">From (UTC date)</label>
				<input id="f-from" name="from" type="date" value={data.raw.from} aria-invalid={data.errors.from ? 'true' : undefined} aria-describedby={data.errors.from ? 'f-from-err' : undefined} />
				{#if data.errors.from}<p class="err" id="f-from-err">{data.errors.from}</p>{/if}
			</div>
			<div class="field">
				<label for="f-to">To (UTC date)</label>
				<input id="f-to" name="to" type="date" value={data.raw.to} aria-invalid={data.errors.to ? 'true' : undefined} aria-describedby={data.errors.to ? 'f-to-err' : undefined} />
				{#if data.errors.to}<p class="err" id="f-to-err">{data.errors.to}</p>{/if}
			</div>
		</div>
		<div class="actions">
			<button type="submit" class="primary">Filter</button>
			<a class="btn" href="/settings/audit">Clear filters</a>
		</div>
	</div>
</form>

<p class="count" role="status">{data.total} {data.total === 1 ? 'entry' : 'entries'}{data.pages > 1 ? ` · page ${data.page} of ${data.pages}` : ''}</p>

{#if data.rows.length}
	<div class="scroll" role="region" aria-label="Audit entries">
		<table>
			<thead>
				<tr><th scope="col">When</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Patient</th><th scope="col">Visit</th><th scope="col">Detail</th></tr>
			</thead>
			<tbody>
				{#each data.rows as r (r.id)}
					<tr>
						<td class="num nowrap">{when(r.at)}</td>
						<td>{r.user ?? '—'}</td>
						<td class="nowrap"><code>{r.action}</code></td>
						<td>{#if r.patientId}<a href="/patients/{r.patientId}">{r.patient ?? `#${r.patientId}`}</a>{:else}—{/if}</td>
						<td class="num">{r.encounterId ?? '—'}</td>
						<td class="detail">{r.detail}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="empty">No entries match these filters.</p>
{/if}

{#if data.pages > 1}
	<nav class="pager" aria-label="Pages">
		{#if data.page > 1}<a href={pageHref(data.page - 1)} rel="prev">← Newer</a>{/if}
		{#if data.page < data.pages}<a href={pageHref(data.page + 1)} rel="next">Older →</a>{/if}
	</nav>
{/if}

<style>
	.count,
	.empty {
		color: var(--text-2);
		margin: var(--space-3) 0;
	}
	.scroll {
		overflow-x: auto;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--text-sm);
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
	}
	th {
		position: sticky;
		top: 0;
		background: var(--surface-2);
		font-weight: var(--weight-semibold);
	}
	.nowrap {
		white-space: nowrap;
	}
	.detail {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-2);
		overflow-wrap: anywhere;
		min-width: 14em;
	}
	code {
		font-family: var(--font-mono);
	}
	.pager {
		display: flex;
		gap: var(--space-4);
		margin-top: var(--space-3);
	}
	.pager a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
	}
</style>
