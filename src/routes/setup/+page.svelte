<script lang="ts">
	import { enhance } from '$app/forms';
	import '#lib/components/settings/forms.css';
	import { PASSWORD_MAX, PASSWORD_MIN } from '#lib/components/settings/rules.ts';
	import { CODE_SET_IDS, ICD11_CITATION, ICD11_LICENCE, type CodeSetId } from '#lib/codesets/index.ts';
	import LanguageSelect from '#lib/components/settings/LanguageSelect.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { FullAutoFill } from 'svelte/elements';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();
	const codeSetLabel = (id: CodeSetId) => (id === 'icd11' ? t('codes.setIcd11') : t('codes.setIcd10cm'));
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	let busy = $state(false);
	// Default ICD-10-CM; after a refused submit the earlier choice comes back from the form values.
	let picked = $state<string | null>(null);
	const codeSet = $derived(picked ?? (form?.values?.codeSet === 'icd11' ? 'icd11' : 'icd10cm'));
</script>

<svelte:head><title>{t('auth.setupTitle')}</title></svelte:head>

<main>
	<h1>{t('auth.setupWelcome')}</h1>
	<p class="sub">{t('auth.setupIntro')}</p>

	<form
		class="ov-form"
		method="POST"
		novalidate
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		{#if errors.form}<p class="summary" role="alert">{errors.form}</p>{/if}
		<LanguageSelect
			id="locale"
			label={t('common.language')}
			value={form?.values?.locale ?? data.locale}
			hint={t('auth.setupLanguageHint')}
			error={errors.locale}
		/>
		<fieldset>
			<legend>{t('auth.administrator')}</legend>
			{#snippet field(id: string, label: string, type: string, autocomplete: FullAutoFill, value: string, hint = '')}
				<div class="field">
					<label for={id}>{label}</label>
					<input
						{id}
						name={id}
						{type}
						{autocomplete}
						{value}
						autocapitalize={id === 'username' ? 'none' : undefined}
						aria-invalid={errors[id] ? 'true' : undefined}
						aria-describedby={[errors[id] ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined}
					/>
					{#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
					{#if errors[id]}<p class="err" id="{id}-err">{errors[id]}</p>{/if}
				</div>
			{/snippet}
			{@render field('username', t('auth.username'), 'text', 'username', form?.values?.username ?? '', t('auth.usernameHint'))}
			{@render field('displayName', t('common.displayName'), 'text', 'name', form?.values?.displayName ?? '', t('auth.displayNameHint'))}
			{@render field('password', t('auth.password'), 'password', 'new-password', '', t('common.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX }))}
			{@render field('confirm', t('auth.confirmPassword'), 'password', 'new-password', '')}
		</fieldset>
		<fieldset>
			<legend>{t('auth.diagnosisCodes')}</legend>
			<fieldset class="radios" aria-describedby="codeset-hint">
				<legend class="label">{t('auth.codeSet')}</legend>
				{#each CODE_SET_IDS as id (id)}
					<label class="check"><input type="radio" name="codeSet" value={id} checked={codeSet === id} onchange={() => (picked = id)} /> {codeSetLabel(id)}</label>
				{/each}
			</fieldset>
			<p class="hint" id="codeset-hint">{t('auth.codeSetHint')}</p>
			{#if errors.codeSet}<p class="err">{errors.codeSet}</p>{/if}
			{#if codeSet === 'icd11'}<p class="hint">{t('auth.icd11Licence', { citation: ICD11_CITATION, licence: ICD11_LICENCE })}</p>{/if}
			<div class="actions">
				<button type="submit" class="primary" disabled={busy}>{busy ? t('auth.creating') : t('auth.createAdmin')}</button>
			</div>
		</fieldset>
	</form>
</main>

<style>
	main {
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
	}
	h1 {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: 0 0 var(--space-1);
	}
	.sub {
		color: var(--text-2);
		margin: 0 0 var(--space-4);
	}
</style>
