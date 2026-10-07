<script lang="ts">
	import { enhance } from '$app/forms';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();
	const keep = (confirmText?: string) => ({ cancel }: { cancel: () => void }) => {
		if (confirmText && !confirm(confirmText)) cancel();
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	};
	const errsFor = (id: string): Record<string, string> => (form?.section === id && form.errors ? form.errors : {});
	const valueFor = (sec: string, field: string, saved: string) => {
		const v = form?.section === sec ? ((form as { values?: Record<string, string> }).values ?? null) : null;
		return v && field in v ? v[field] : saved;
	};
</script>

<svelte:head><title>{t('settings.normalsTitle')}</title></svelte:head>

<h2>{t('settings.normalsHeading')}</h2>
<p class="lead">
	<Msg key="settings.normalsLead">
		{#snippet shorthand()}<kbd>D</kbd>{/snippet}
	</Msg>
</p>

<nav class="jump" aria-label={t('settings.normalsSections')}>
	{#each data.sections as s (s.id)}<a href="#sec-{s.id}">{s.label}</a>{/each}
</nav>

<div class="ov-form">
	{#each data.sections as s (s.id)}
		{@const errs = errsFor(s.id)}
		<form method="POST" action="?/save" novalidate  use:enhance={keep()}>
			<input type="hidden" name="section" value={s.id} />
			<fieldset id="sec-{s.id}">
				<legend>{s.label}</legend>
				{#if errs.form}<p class="err" role="alert">{errs.form}</p>{/if}
				<div class="grid">
					{#each s.fields as f (f.id)}
						<div class="field">
							<label for="n-{f.id}">{f.label}</label>
							<input
								id="n-{f.id}"
								name="f:{f.id}"
								maxlength={f.maxLength}
								autocomplete="off"
								value={valueFor(s.id, f.id, f.value)}
								aria-invalid={errs[f.id] ? 'true' : undefined}
								aria-describedby={[errs[f.id] ? `n-${f.id}-err` : '', f.seed !== null && f.seed !== f.value ? `n-${f.id}-hint` : ''].filter(Boolean).join(' ') || undefined}
							/>
							{#if f.seed !== null && f.seed !== f.value}<p class="hint" id="n-{f.id}-hint">{t('settings.normalsStarter', { value: f.seed })}</p>{/if}
							{#if errs[f.id]}<p class="err" id="n-{f.id}-err">{errs[f.id]}</p>{/if}
						</div>
					{/each}
				</div>
				<div class="actions">
					<button type="submit" class="primary">{t('settings.normalsSaveSection', { section: s.label })}</button>
					<button type="submit" formaction="?/reset" formnovalidate>{t('settings.normalsResetSection', { section: s.label })}</button>
					{#if form?.section === s.id && form.ok}<p class="saved" role="status">{form.message}</p>{/if}
				</div>
			</fieldset>
		</form>
	{/each}

	<form method="POST" action="?/reset" use:enhance={keep(t('settings.normalsResetAllConfirm'))} class="card">
		<input type="hidden" name="section" value="all" />
		<p class="hint">{t('settings.normalsResetAllHint')}</p>
		<div class="actions">
			<button type="submit" class="danger">{t('settings.normalsResetAll')}</button>
			{#if form?.section === 'all' && form.ok}<p class="saved" role="status">{form.message}</p>{/if}
		</div>
	</form>
</div>

<style>
	form:not(.card) {
		display: contents;
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0 0 var(--space-4);
	}
	.jump a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
	}
	fieldset {
		scroll-margin-top: var(--space-4);
	}
</style>
