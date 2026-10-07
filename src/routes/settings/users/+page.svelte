<script lang="ts">
	import { enhance } from '$app/forms';
	import { PASSWORD_MAX, PASSWORD_MIN } from '#lib/components/settings/rules.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();
	const ROLES = [
		['provider', 'settings.roleProviderLong'],
		['tech', 'settings.roleTechLong'],
		['admin', 'settings.roleAdminLong']
	] as const satisfies readonly (readonly [string, MessageKey])[];
	const ROLE_SHORT: Record<string, MessageKey> = { admin: 'common.roleAdmin', provider: 'common.roleProvider', tech: 'common.roleTech' };
	const roleShort = (r: string) => (ROLE_SHORT[r] ? t(ROLE_SHORT[r]) : r);
	const cErr = $derived<Record<string, string>>(form?.section === 'create' ? (form.errors ?? {}) : {});
	const cv = $derived(form?.section === 'create' && form.values ? form.values : null);
	const rowMsg = (id: number) => (form?.section === 'row' && form.id === id ? form : null);
	let busy = $state('');
	const submit =
		(name: string, reset = false) =>
		() => {
			busy = name;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				await update({ reset });
				busy = '';
			};
		};
	const desc = (errs: Record<string, string>, id: string, hint = false) =>
		[errs[id] ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
</script>

<svelte:head><title>{t('settings.usersTitle')}</title></svelte:head>

<h2>{t('settings.usersHeading')}</h2>
<p class="lead">
	<Msg key="settings.usersLead">
		{#snippet command()}<code>node scripts/reset-admin.mjs &lt;username&gt;</code>{/snippet}
	</Msg>
</p>

{#if data.demoStillOpen.length}
	<p class="demo" role="alert">
		{t('settings.usersDemoOpen', { names: data.demoStillOpen.join(', ') })}
	</p>
{/if}

<div class="ov-form">
	<form method="POST" action="?/create" novalidate use:enhance={submit('create', true)}>
		<fieldset>
			<legend>{t('settings.addUserLegend')}</legend>
			<div class="grid">
				<div class="field">
					<label for="username">{t('settings.username')}</label>
					<input id="username" name="username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="32" value={cv?.username ?? ''}
						aria-invalid={cErr.username ? 'true' : undefined} aria-describedby={desc(cErr, 'username')} />
					{#if cErr.username}<p class="err" id="username-err">{cErr.username}</p>{/if}
				</div>
				<div class="field">
					<label for="displayName">{t('common.displayName')}</label>
					<input id="displayName" name="displayName" autocomplete="off" maxlength="60" value={cv?.displayName ?? ''}
						aria-invalid={cErr.displayName ? 'true' : undefined} aria-describedby={desc(cErr, 'displayName')} />
					{#if cErr.displayName}<p class="err" id="displayName-err">{cErr.displayName}</p>{/if}
				</div>
				<div class="field">
					<label for="role">{t('settings.role')}</label>
					<select id="role" name="role" aria-invalid={cErr.role ? 'true' : undefined} aria-describedby={desc(cErr, 'role')}>
						{#each ROLES as [v, label] (v)}<option value={v} selected={(cv?.role ?? 'provider') === v}>{t(label)}</option>{/each}
					</select>
					{#if cErr.role}<p class="err" id="role-err">{cErr.role}</p>{/if}
				</div>
				<div class="field">
					<label for="password">{t('settings.temporaryPassword')}</label>
					<input id="password" name="password" type="password" autocomplete="new-password"
						aria-invalid={cErr.password ? 'true' : undefined} aria-describedby={desc(cErr, 'password', true)} />
					<p class="hint" id="password-hint">{t('common.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX })} {t('settings.mustChangeAtFirstSignIn')}</p>
					{#if cErr.password}<p class="err" id="password-err">{cErr.password}</p>{/if}
				</div>
			</div>
			<div class="actions">
				<button type="submit" class="primary" disabled={busy === 'create'}>{busy === 'create' ? t('settings.addingUser') : t('settings.addUser')}</button>
				{#if form?.section === 'create' && form.ok}<p class="saved" role="status">{form.message}</p>{/if}
			</div>
		</fieldset>
	</form>

	<section class="card" aria-labelledby="list-h">
		<h3 id="list-h">{t('settings.allUsers', { n: data.users.length })}</h3>
		<ul class="users">
			{#each data.users as u (u.id)}
				{@const msg = rowMsg(u.id)}
				{@const self = u.id === data.meId}
				<li class:inactive={!u.active}>
					<div class="who">
						<strong>{u.displayName}</strong>
						<span class="meta">
							{u.username ?? t('settings.userNoSignIn')} · {roleShort(u.role)}
							{#if !u.active}· <span class="off">{t('settings.userDeactivated')}</span>{/if}
							{#if u.mustChangePassword}· {t('settings.userTemporaryPassword')}{/if}
							{#if self}· {t('settings.userYou')}{/if}
						</span>
					</div>
					<div class="acts">
						<form method="POST" action="?/role" use:enhance={submit(`role${u.id}`)} class="inline">
							<input type="hidden" name="id" value={u.id} />
							<label class="visually-hidden" for="role-{u.id}">{t('settings.roleFor', { name: u.displayName })}</label>
							<select id="role-{u.id}" name="role" disabled={self}>
								{#each ROLES as [v] (v)}<option value={v} selected={u.role === v}>{roleShort(v)}</option>{/each}
							</select>
							<button type="submit" disabled={self || busy === `role${u.id}`} aria-label={t('settings.changeRoleFor', { name: u.displayName })}>{t('settings.changeRole')}</button>
						</form>
						<form method="POST" action={u.active ? '?/deactivate' : '?/reactivate'} use:enhance={submit(`act${u.id}`)} class="inline">
							<input type="hidden" name="id" value={u.id} />
							<button
								type="submit"
								class:danger={u.active}
								disabled={self || busy === `act${u.id}`}
								aria-label={u.active ? t('settings.deactivateUser', { name: u.displayName }) : t('settings.reactivateUser', { name: u.displayName })}
							>
								{u.active ? t('settings.deactivate') : t('settings.reactivate')}
							</button>
						</form>
						<details>
							<summary aria-label={t('settings.resetPasswordFor', { name: u.displayName })}>{t('settings.resetPassword')}</summary>
							<form method="POST" action="?/reset" novalidate use:enhance={submit(`reset${u.id}`, true)} class="reset">
								<input type="hidden" name="id" value={u.id} />
								<div class="field">
									<label for="reset-{u.id}">{t('settings.newTemporaryPassword')}</label>
									<input id="reset-{u.id}" name="password" type="password" autocomplete="new-password"
										aria-invalid={msg?.errors?.password ? 'true' : undefined}
										aria-describedby={msg?.errors?.password ? `reset-${u.id}-err` : undefined} />
									{#if msg?.errors?.password}<p class="err" id="reset-{u.id}-err">{msg.errors.password}</p>{/if}
								</div>
								<button type="submit" disabled={busy === `reset${u.id}`}>{t('settings.setTemporaryPassword')}</button>
							</form>
						</details>
					</div>
					{#if msg?.errors?.form || msg?.errors?.role}<p class="err" role="alert">{msg.errors.form ?? msg.errors.role}</p>{/if}
					{#if msg?.ok}<p class="saved" role="status">{msg.message}</p>{/if}
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	form:not(.inline):not(.reset) {
		display: contents;
	}
	h3 {
		margin: 0;
		font-size: var(--text-md);
	}
	.demo {
		margin: 0 0 var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--warn);
		border-radius: var(--radius-2);
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	code {
		font-family: var(--font-mono);
	}
	.users {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.users li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--hairline);
	}
	.users li > p {
		flex-basis: 100%;
	}
	.inactive .who strong {
		color: var(--text-3);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 12em;
	}
	.meta {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.off {
		color: var(--danger);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.inline {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}
	.inline select {
		width: auto;
	}
	summary {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
		padding: 0 var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		cursor: pointer;
		background: var(--surface-1);
	}
	.reset {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
		max-width: 20em;
	}
</style>
