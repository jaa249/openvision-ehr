<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();
	const addErr = $derived(form?.section === 'add' ? (form.errors?.name ?? form.errors?.form) : undefined);
	const rowErr = (id: number) => (form && form.section !== 'add' && form.id === id ? (form.errors?.name ?? form.errors?.form) : undefined);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>{t('settings.visitTypesTitle')}</title></svelte:head>

<h2>{t('settings.visitTypesHeading')}</h2>
<p class="lead">{t('settings.visitTypesLead')}</p>

<div class="ov-form">
	<form method="POST" action="?/add" novalidate use:enhance class="card add">
		<div class="field">
			<label for="new-type">{t('settings.newVisitType')}</label>
			<input id="new-type" name="name" maxlength="40" autocomplete="off" value={form?.section === 'add' && !form.ok ? (form.name ?? '') : ''}
				aria-invalid={addErr ? 'true' : undefined} aria-describedby={addErr ? 'new-type-err' : undefined} />
			{#if addErr}<p class="err" id="new-type-err">{addErr}</p>{/if}
		</div>
		<button type="submit" class="primary">{t('common.add')}</button>
	</form>

	<ol class="card types">
		{#each data.types as vt, i (vt.id)}
			{@const err = rowErr(vt.id)}
			<li class:hidden={!vt.active}>
				<form method="POST" action="?/rename" novalidate use:enhance={keep} class="rename">
					<input type="hidden" name="id" value={vt.id} />
					<label class="visually-hidden" for="vt-{vt.id}">{t('settings.visitTypeName', { n: i + 1 })}</label>
					<input id="vt-{vt.id}" name="name" maxlength="40" value={vt.name} aria-invalid={err ? 'true' : undefined}
						aria-describedby={err ? `vt-${vt.id}-err` : undefined} />
					<button type="submit" aria-label={t('settings.renameItem', { name: vt.name })}>{t('settings.rename')}</button>
				</form>
				<div class="row-acts">
					{#if !vt.active}<span class="tag">{t('settings.visitTypeHidden')}</span>{/if}
					<form method="POST" action="?/up" use:enhance><input type="hidden" name="id" value={vt.id} /><button type="submit" disabled={i === 0} aria-label={t('settings.moveUp', { name: vt.name })}>↑</button></form>
					<form method="POST" action="?/down" use:enhance><input type="hidden" name="id" value={vt.id} /><button type="submit" disabled={i === data.types.length - 1} aria-label={t('settings.moveDown', { name: vt.name })}>↓</button></form>
					<form method="POST" action={vt.active ? '?/hide' : '?/show'} use:enhance>
						<input type="hidden" name="id" value={vt.id} />
						<button type="submit" aria-label={vt.active ? t('settings.hideItem', { name: vt.name }) : t('settings.showItem', { name: vt.name })}>{vt.active ? t('settings.hide') : t('settings.show')}</button>
					</form>
				</div>
				{#if err}<p class="err" id="vt-{vt.id}-err" role="alert">{err}</p>{/if}
			</li>
		{/each}
	</ol>
</div>

<style>
	.add {
		flex-direction: row;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.add .field {
		flex: 1 1 14em;
	}
	.types {
		list-style: none;
		margin: 0;
		padding: var(--space-2) var(--space-4);
		gap: 0;
	}
	.types li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--hairline);
	}
	.types li:first-child {
		border-top: 0;
	}
	.types li > p {
		flex-basis: 100%;
	}
	.rename {
		display: flex;
		gap: var(--space-2);
		flex: 1 1 16em;
	}
	.row-acts {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}
	.hidden input {
		color: var(--text-3);
	}
	.tag {
		font-size: var(--text-xs);
		color: var(--text-3);
		margin-right: var(--space-2);
	}
</style>
