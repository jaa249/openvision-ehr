<script lang="ts">
	import { enhance } from '$app/forms';
	import { CODE_SET_IDS, ICD11_CITATION, ICD11_LICENCE, ICD11_RELEASE, type CodeSetId } from '#lib/codesets/index.ts';
	import LanguageSelect from '#lib/components/settings/LanguageSelect.svelte';
	import { downloadSet } from '#lib/codesets/admin_client.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	const v = $derived(form?.values ?? data.practice);
	let busy = $state(false);
	let codesBusy = $state(false);
	const codesErrors = $derived<Record<string, string>>(form?.codesErrors ?? {});
	let localeBusy = $state(false);
	const localeErrors = $derived<Record<string, string>>(form?.localeErrors ?? {});
	// The radio follows the saved value until the admin picks another (so the citation shows at once).
	let picked = $state<CodeSetId | null>(null);
	const codeSet = $derived(picked ?? data.codes.codeSet);
	const FIELDS = $derived([
		{ id: 'name', label: t('settings.practiceName'), max: 100, auto: 'organization', hint: t('settings.practiceNameHint') },
		{ id: 'address', label: t('settings.address'), max: 200, auto: 'street-address', hint: t('settings.addressHint') },
		{ id: 'phone', label: t('settings.phone'), max: 30, auto: 'tel', hint: '' },
		{ id: 'fax', label: t('settings.fax'), max: 30, auto: 'off', hint: '' }
	] as const);
	const codeSetLabel = (id: CodeSetId) => (id === 'icd11' ? t('codes.setIcd11') : t('codes.setIcd10cm'));
	// Code sets are downloaded by the practice (D49): the chosen set says so when it is not, with Download.
	let available = $state<Partial<Record<CodeSetId, boolean>>>({});
	const isAvailable = (id: CodeSetId) => available[id] ?? data.available[id];
	let dlBusy = $state(false);
	let dlError = $state('');
	async function download(id: CodeSetId) {
		dlBusy = true;
		dlError = '';
		const r = await downloadSet(id);
		dlBusy = false;
		if (r.ok) available[id] = r.state.rows > 0;
		else dlError = r.message || (r.status ? t('settings.codeSetsFailed', { status: r.status }) : t('settings.codeSetsNoConnection'));
	}
</script>

<svelte:head><title>{t('settings.practiceTitle')}</title></svelte:head>

<h2>{t('settings.practiceHeading')}</h2>
<p class="lead">{t('settings.practiceLead')}</p>
{#if data.welcome}
	<p class="lead" role="status"><strong>{t('settings.adminReady')}</strong> {t('settings.adminReadyNext')}</p>
{/if}

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
	<fieldset>
		<legend>{t('settings.practiceDetails')}</legend>
		<div class="grid">
			{#each FIELDS as f (f.id)}
				<div class="field">
					<label for={f.id}>{f.id === 'name' ? f.label : t('common.optional', { label: f.label })}</label>
					<input
						id={f.id}
						name={f.id}
						maxlength={f.max}
						autocomplete={f.auto}
						type={f.id === 'phone' || f.id === 'fax' ? 'tel' : 'text'}
						value={v[f.id]}
						aria-invalid={errors[f.id] ? 'true' : undefined}
						aria-describedby={[errors[f.id] ? `${f.id}-err` : '', f.hint ? `${f.id}-hint` : ''].filter(Boolean).join(' ') || undefined}
					/>
					{#if f.hint}<p class="hint" id="{f.id}-hint">{f.hint}</p>{/if}
					{#if errors[f.id]}<p class="err" id="{f.id}-err">{errors[f.id]}</p>{/if}
				</div>
			{/each}
		</div>
		<div class="actions">
			<button type="submit" class="primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
			{#if form?.ok}<p class="saved" role="status">{t('common.saved')}</p>{/if}
		</div>
	</fieldset>
</form>

<form
	class="ov-form codes"
	method="POST"
	novalidate
	use:enhance={() => {
		codesBusy = true;
		return async ({ update }) => {
			await update({ reset: false });
			codesBusy = false;
			picked = null;
		};
	}}
>
	<input type="hidden" name="form" value="codes" />
	<fieldset>
		<legend>{t('settings.codesLegend')}</legend>
		<fieldset class="radios" aria-describedby="codeset-hint">
			<legend class="label">{t('settings.diagnosisCodeSet')}</legend>
			{#each CODE_SET_IDS as id (id)}
				<label class="check">
					<input type="radio" name="codeSet" value={id} checked={codeSet === id} onchange={() => (picked = id)} />
					{codeSetLabel(id)}
				</label>
			{/each}
		</fieldset>
		<p class="hint" id="codeset-hint">{t('settings.codeSetHint')}</p>
		{#if codesErrors.codeSet}<p class="err">{codesErrors.codeSet}</p>{/if}
		{#if !isAvailable(codeSet)}
			<div class="missing" role="status">
				<p class="hint">{codeSetLabel(codeSet)}: {t('settings.codeSetsNotDownloadedPractice')}</p>
				<button type="button" disabled={dlBusy} onclick={() => download(codeSet)}>{dlBusy ? t('settings.codeSetsDownloading') : t('settings.codeSetsDownload')}</button>
				<a href="/settings/code-sets">{t('settings.codeSetsManage')}</a>
				{#if dlError}<p class="err">{dlError}</p>{/if}
			</div>
		{/if}
		{#if codeSet === 'icd11'}
			<p class="hint cite">{t('settings.icd11Citation', { citation: ICD11_CITATION, licence: ICD11_LICENCE, release: ICD11_RELEASE })}</p>
		{/if}
		<label class="check">
			<input type="checkbox" name="usBilling" checked={data.codes.usBilling} aria-describedby="usbilling-hint" />
			{t('settings.usSuggestions')}
		</label>
		<p class="hint" id="usbilling-hint">{t('settings.usSuggestionsHint')}</p>
		{#if codesErrors.usBilling}<p class="err">{codesErrors.usBilling}</p>{/if}
		<div class="actions">
			<button type="submit" class="primary" disabled={codesBusy}>{codesBusy ? t('common.saving') : t('common.save')}</button>
			{#if form?.codesOk}<p class="saved" role="status">{t('common.saved')}</p>{/if}
		</div>
	</fieldset>
</form>

<form
	class="ov-form codes"
	method="POST"
	novalidate
	use:enhance={() => {
		localeBusy = true;
		return async ({ update }) => {
			await update({ reset: false });
			localeBusy = false;
		};
	}}
>
	<input type="hidden" name="form" value="locale" />
	<fieldset>
		<legend>{t('common.language')}</legend>
		<LanguageSelect
			id="locale"
			label={t('settings.defaultLanguage')}
			value={data.locale}
			hint={t('settings.defaultLanguageHint')}
			error={localeErrors.locale}
		/>
		<div class="actions">
			<button type="submit" class="primary" disabled={localeBusy}>{localeBusy ? t('common.saving') : t('common.save')}</button>
			{#if form?.localeOk}<p class="saved" role="status">{t('common.saved')}</p>{/if}
		</div>
	</fieldset>
</form>

<style>
	.codes {
		margin-top: var(--space-4);
	}
	.cite {
		max-width: 60ch;
	}
	.missing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-2) 0;
	}
	.missing .hint {
		flex-basis: 100%;
		margin: 0;
		color: var(--warn);
	}
</style>
