<script lang="ts">
	import { enhance } from '$app/forms';
	import { EXAM_MODES, EXAM_MODE_LABEL } from '#lib/prefs/keys.ts';
	import { PASSWORD_HINT } from '#lib/components/settings/rules.ts';
	import type { FullAutoFill } from 'svelte/elements';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const pErr = $derived<Record<string, string>>(form?.section === 'profile' ? (form.errors ?? {}) : {});
	const pwErr = $derived<Record<string, string>>(form?.section === 'password' ? (form.errors ?? {}) : {});
	const pv = $derived(form?.section === 'profile' && 'values' in form ? form.values : null);
	const ROLE: Record<string, string> = { admin: 'Admin', provider: 'Provider', tech: 'Technician' };
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

<svelte:head><title>My settings · OpenVision</title></svelte:head>

<h2>My settings</h2>
<p class="lead">Signed in as <strong>{data.me.username}</strong> ({ROLE[data.me.role]}).</p>

{#if data.required}
	<p class="required" role="alert">Your password is temporary. Choose a new password to continue.</p>
{/if}

<div class="ov-form">
	{#if !data.required}
		<form method="POST" action="?/profile" novalidate use:enhance={submit('profile')}>
			<fieldset>
				<legend>Profile and exam preferences</legend>
				<div class="field">
					<label for="displayName">Display name</label>
					<input
						id="displayName"
						name="displayName"
						autocomplete="name"
						maxlength="60"
						value={pv?.displayName ?? data.me.displayName}
						aria-invalid={pErr.displayName ? 'true' : undefined}
						aria-describedby={describe(pErr, 'displayName', true)}
					/>
					<p class="hint" id="displayName-hint">Shown in the header, on exams you sign and in the audit log.</p>
					{#if pErr.displayName}<p class="err" id="displayName-err">{pErr.displayName}</p>{/if}
				</div>
				<fieldset class="radios" aria-describedby={describe(pErr, 'cylinder', true)}>
					<legend class="label">Cylinder convention</legend>
					{#each [['+', 'Plus cylinder'], ['-', 'Minus cylinder']] as [v, label] (v)}
						<label class="check"><input type="radio" name="cylinder" value={v} checked={(pv?.cylinder ?? data.cylinder) === v} />{label}</label>
					{/each}
					<p class="hint" id="cylinder-hint">Unsigned cylinder entries in refraction get this sign.</p>
					{#if pErr.cylinder}<p class="err" id="cylinder-err">{pErr.cylinder}</p>{/if}
				</fieldset>
				<div class="field">
					<label for="examMode">Default exam helper panel</label>
					<select id="examMode" name="examMode" aria-invalid={pErr.examMode ? 'true' : undefined} aria-describedby={describe(pErr, 'examMode')}>
						{#each EXAM_MODES as m (m)}
							<option value={m} selected={(pv?.examMode ?? data.examMode) === m}>{EXAM_MODE_LABEL[m]}</option>
						{/each}
					</select>
					{#if pErr.examMode}<p class="err" id="examMode-err">{pErr.examMode}</p>{/if}
				</div>
				<div class="actions">
					<button type="submit" class="primary" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save'}</button>
					{#if form?.section === 'profile' && 'ok' in form}<p class="saved" role="status">Saved.</p>{/if}
				</div>
			</fieldset>
		</form>
	{/if}

	<form method="POST" action="?/password" novalidate use:enhance={submit('password')}>
		<fieldset>
			<legend>Change password</legend>
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
			{@render pw('current', data.required ? 'Temporary password' : 'Current password', 'current-password')}
			{@render pw('next', 'New password', 'new-password', PASSWORD_HINT)}
			{@render pw('confirm', 'Confirm new password', 'new-password')}
			<div class="actions">
				<button type="submit" class="primary" disabled={busy === 'password'}>{busy === 'password' ? 'Saving…' : 'Change password'}</button>
				{#if form?.section === 'password' && 'ok' in form}<p class="saved" role="status">Password changed. Your other sessions were signed out.</p>{/if}
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
