<script lang="ts">
	// Language picker (D48) for My settings, Practice, first-run setup and the sign-in page. Each language
	// is listed by its own name; a draft is marked "(draft translation)" in the current language.
	import { useI18n } from '#lib/i18n/context.ts';
	import { LOCALES, localeInfo, type LocaleCode, type LocaleInfo } from '#lib/i18n/locales.ts';

	let {
		id,
		label,
		value,
		hint = '',
		error = '',
		practiceDefault = null,
		onchange
	}: {
		id: string;
		label: string;
		value: string;
		hint?: string;
		error?: string;
		/** Set on My settings: the first option is "Practice default (<name>)" with the value 'practice'. */
		practiceDefault?: LocaleCode | null;
		/** Optional: called with the new value when the choice changes (the sign-in page switches at once). */
		onchange?: (value: string) => void;
	} = $props();

	const { t } = useI18n();
	const name = (l: LocaleInfo) => (l.status === 'draft' ? t('common.draftLanguage', { name: l.name }) : l.name);
	const describedBy = $derived([error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="field">
	<label for={id}>{label}</label>
	<select
		{id}
		name={id}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		onchange={onchange ? (e) => onchange(e.currentTarget.value) : undefined}
	>
		{#if practiceDefault}
			<option value="practice" selected={value === 'practice'}>
				{t('common.practiceDefaultLanguage', { name: name(localeInfo(practiceDefault)) })}
			</option>
		{/if}
		{#each LOCALES as l (l.code)}
			<option value={l.code} selected={value === l.code}>{name(l)}</option>
		{/each}
	</select>
	{#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
	{#if error}<p class="err" id="{id}-err">{error}</p>{/if}
</div>
