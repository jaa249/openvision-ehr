<script lang="ts">
	import { enhance } from '$app/forms';
	import { EXAM_MODES, EXAM_MODE_LABEL_KEY, type ExamMode } from '#lib/prefs/keys.ts';
	import { PASSWORD_MAX, PASSWORD_MIN } from '#lib/components/settings/rules.ts';
	import LanguageSelect from '#lib/components/settings/LanguageSelect.svelte';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { FullAutoFill } from 'svelte/elements';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const pErr = $derived<Record<string, string>>(form?.section === 'profile' ? (form.errors ?? {}) : {});
	const pwErr = $derived<Record<string, string>>(form?.section === 'password' ? (form.errors ?? {}) : {});
	const pv = $derived(form?.section === 'profile' && 'values' in form ? form.values : null);
	const { t } = useI18n();
	const roleLabel = (r: string) =>
		r === 'admin' ? t('common.roleAdmin') : r === 'provider' ? t('common.roleProvider') : r === 'tech' ? t('common.roleTech') : r;
	const modeLabel = (m: ExamMode) => t(EXAM_MODE_LABEL_KEY[m]);
	let busy = $state('');

	const submit = (name: string) => () => {
		busy = name;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: name === 'password' });
			busy = '';
		};
	};
	const describe = (errs: Record<string, string>, id: string, hint = false) =>
		[errs[id] ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
</script>

<svelte:head><title>{t('settings.meTitle')}</title></svelte:head>

<h2>{t('shell.mySettings')}</h2>
<p class="lead">
	<Msg key="settings.signedInAs" params={{ role: roleLabel(data.me.role) }}>
		{#snippet username()}<strong>{data.me.username}</strong>{/snippet}
	</Msg>
</p>

{#if data.required}
	<p class="required" role="alert">{t('settings.temporaryPasswordNotice')}</p>
{/if}

<div class="ov-form">
	{#if !data.required}
		<form method="POST" action="?/profile" novalidate use:enhance={submit('profile')}>
			<fieldset>
				<legend>{t('settings.profileLegend')}</legend>
				<div class="field">
					<label for="displayName">{t('common.displayName')}</label>
					<input
						id="displayName"
						name="displayName"
						autocomplete="name"
						maxlength="60"
						value={pv?.displayName ?? data.me.displayName}
						aria-invalid={pErr.displayName ? 'true' : undefined}
						aria-describedby={describe(pErr, 'displayName', true)}
					/>
					<p class="hint" id="displayName-hint">{t('settings.displayNameHint')}</p>
					{#if pErr.displayName}<p class="err" id="displayName-err">{pErr.displayName}</p>{/if}
				</div>
				<fieldset class="radios" aria-describedby={describe(pErr, 'cylinder', true)}>
					<legend class="label">{t('settings.cylinderConvention')}</legend>
					{#each [['+', t('settings.plusCylinder')], ['-', t('settings.minusCylinder')]] as [v, label] (v)}
						<label class="check"><input type="radio" name="cylinder" value={v} checked={(pv?.cylinder ?? data.cylinder) === v} />{label}</label>
					{/each}
					<p class="hint" id="cylinder-hint">{t('settings.cylinderHint')}</p>
					{#if pErr.cylinder}<p class="err" id="cylinder-err">{pErr.cylinder}</p>{/if}
				</fieldset>
				<div class="field">
					<label for="examMode">{t('settings.defaultPanel')}</label>
					<select id="examMode" name="examMode" aria-invalid={pErr.examMode ? 'true' : undefined} aria-describedby={describe(pErr, 'examMode')}>
						{#each EXAM_MODES as m (m)}
							<option value={m} selected={(pv?.examMode ?? data.examMode) === m}>{modeLabel(m)}</option>
						{/each}
					</select>
					{#if pErr.examMode}<p class="err" id="examMode-err">{pErr.examMode}</p>{/if}
				</div>
				<LanguageSelect
					id="locale"
					label={t('common.language')}
					value={pv?.locale ?? data.locale}
					practiceDefault={data.practiceLocale}
					hint={t('settings.myLanguageHint')}
					error={pErr.locale}
				/>
				<div class="actions">
					<button type="submit" class="primary" disabled={busy === 'profile'}>{busy === 'profile' ? t('common.saving') : t('common.save')}</button>
					{#if form?.section === 'profile' && 'ok' in form}<p class="saved" role="status">{t('common.saved')}</p>{/if}
				</div>
			</fieldset>
		</form>
	{/if}

	<form method="POST" action="?/password" novalidate use:enhance={submit('password')}>
		<fieldset>
			<legend>{t('settings.changePassword')}</legend>
			{#snippet pw(id: string, label: string, autocomplete: FullAutoFill, hint = '')}
				<div class="field">
					<label for={id}>{label}</label>
					<input
						{id}
						name={id}
						type="password"
						{autocomplete}
						aria-invalid={pwErr[id] ? 'true' : undefined}
						aria-describedby={describe(pwErr, id, !!hint)}
					/>
					{#if hint}<p class="hint" id="{id}-hint">{hint}</p>{/if}
					{#if pwErr[id]}<p class="err" id="{id}-err">{pwErr[id]}</p>{/if}
				</div>
			{/snippet}
			{@render pw('current', data.required ? t('settings.temporaryPassword') : t('settings.currentPassword'), 'current-password')}
			{@render pw('next', t('settings.newPassword'), 'new-password', t('common.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX }))}
			{@render pw('confirm', t('settings.confirmNewPassword'), 'new-password')}
			<div class="actions">
				<button type="submit" class="primary" disabled={busy === 'password'}>{busy === 'password' ? t('common.saving') : t('settings.changePassword')}</button>
				{#if form?.section === 'password' && 'ok' in form}<p class="saved" role="status">{t('settings.passwordChanged')}</p>{/if}
			</div>
		</fieldset>
	</form>
</div>

<style>
	.required {
		margin: 0 0 var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--warn);
		border-radius: var(--radius-2);
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	form {
		display: contents;
	}
</style>
