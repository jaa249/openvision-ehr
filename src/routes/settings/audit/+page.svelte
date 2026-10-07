<script lang="ts">
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';
	import { ACTION_LABEL_KEY } from './labels.ts';

	let { data }: PageProps = $props();
	const { t } = useI18n();
	const pageHref = (n: number) => {
		const p = new URLSearchParams(Object.entries(data.raw).filter(([, v]) => v));
		p.set('page', String(n));
		return `?${p}`;
	};
	/** The action's readable name in the page language, else its stored code. */
	const actionLabel = (a: string) => (ACTION_LABEL_KEY[a] ? t(ACTION_LABEL_KEY[a]) : a);
	const when = (iso: string) => t('settings.auditUtc', { time: iso.replace('T', ' ').slice(0, 19) });
</script>

<svelte:head><title>{t('settings.auditTitle')}</title></svelte:head>

<h2>{t('settings.auditHeading')}</h2>
<p class="lead">{t('settings.auditLead')}</p>

<form method="GET" class="ov-form filters" role="search" aria-label={t('settings.auditFilterLabel')}>
	<div class="card">
		<div class="grid">
			<div class="field">
				<label for="f-user">{t('settings.auditUser')}</label>
				<select id="f-user" name="user">
					<option value="">{t('settings.auditAnyone')}</option>
					{#each data.users as u (u.id)}<option value={u.id} selected={data.raw.user === String(u.id)}>{u.label}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-patient">{t('settings.auditPatientFilter')}</label>
				<input id="f-patient" name="patient" value={data.raw.patient} autocomplete="off" aria-invalid={data.errors.patient ? 'true' : undefined} aria-describedby={data.errors.patient ? 'f-patient-err' : undefined} />
				{#if data.errors.patient}<p class="err" id="f-patient-err">{data.errors.patient}</p>{/if}
			</div>
			<div class="field">
				<label for="f-action">{t('settings.auditAction')}</label>
				<select id="f-action" name="action">
					<option value="">{t('settings.auditAny')}</option>
					<option value="@output" selected={data.raw.action === '@output'}>{t('settings.auditGroupOutput')}</option>
					{#each data.actions as a (a)}<option value={a} selected={data.raw.action === a}>{actionLabel(a)}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="f-from">{t('settings.auditFrom')}</label>
				<input id="f-from" name="from" type="date" value={data.raw.from} aria-invalid={data.errors.from ? 'true' : undefined} aria-describedby={data.errors.from ? 'f-from-err' : undefined} />
				{#if data.errors.from}<p class="err" id="f-from-err">{data.errors.from}</p>{/if}
			</div>
			<div class="field">
				<label for="f-to">{t('settings.auditTo')}</label>
				<input id="f-to" name="to" type="date" value={data.raw.to} aria-invalid={data.errors.to ? 'true' : undefined} aria-describedby={data.errors.to ? 'f-to-err' : undefined} />
				{#if data.errors.to}<p class="err" id="f-to-err">{data.errors.to}</p>{/if}
			</div>
		</div>
		<div class="actions">
			<button type="submit" class="primary">{t('settings.auditFilter')}</button>
			<a class="btn" href="/settings/audit">{t('settings.auditClearFilters')}</a>
		</div>
	</div>
</form>

<p class="count" role="status">{data.pages > 1 ? t('settings.auditCountPaged', { count: data.total, page: data.page, pages: data.pages }) : t('settings.auditCount', { count: data.total })}</p>

{#if data.rows.length}
	<div class="scroll" role="region" aria-label={t('settings.auditEntries')}>
		<table>
			<thead>
				<tr><th scope="col">{t('settings.auditWhen')}</th><th scope="col">{t('settings.auditUser')}</th><th scope="col">{t('settings.auditAction')}</th><th scope="col">{t('settings.auditPatient')}</th><th scope="col">{t('settings.auditVisit')}</th><th scope="col">{t('settings.auditDetail')}</th></tr>
			</thead>
			<tbody>
				{#each data.rows as r (r.id)}
					<tr>
						<td class="num nowrap">{when(r.at)}</td>
						<td>{r.user ?? '—'}</td>
						<td>{actionLabel(r.action)}{#if ACTION_LABEL_KEY[r.action]}<br /><code class="code">{r.action}</code>{/if}</td>
						<td>{#if r.patientId}<a href="/patients/{r.patientId}">{r.patient ?? `#${r.patientId}`}</a>{:else}—{/if}</td>
						<td class="num">{r.encounterId ?? '—'}</td>
						<td class="detail">{r.detail}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="empty">{t('settings.auditEmpty')}</p>
{/if}

{#if data.pages > 1}
	<nav class="pager" aria-label={t('settings.auditPages')}>
		{#if data.page > 1}<a href={pageHref(data.page - 1)} rel="prev">{t('settings.auditNewer')}</a>{/if}
		{#if data.page < data.pages}<a href={pageHref(data.page + 1)} rel="next">{t('settings.auditOlder')}</a>{/if}
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
		text-align: start;
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
	.code {
		font-size: var(--text-xs);
		color: var(--text-2);
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
