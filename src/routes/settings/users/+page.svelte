<script lang="ts">
	import { enhance } from '$app/forms';
	import { PASSWORD_HINT } from '#lib/components/settings/rules.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const ROLES = [
		['provider', 'Provider: exams, signs own exams'],
		['tech', 'Technician: exam entry, no settings'],
		['admin', 'Admin: settings and users']
	] as const;
	const ROLE_SHORT: Record<string, string> = { admin: 'Admin', provider: 'Provider', tech: 'Technician' };
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

<svelte:head><title>Users · Settings · OpenVision</title></svelte:head>

<h2>Users</h2>
<p class="lead">
	One account per person; never share a sign-in. Deactivated users cannot sign in and are signed out at once. Any admin can reset any password
	(emergency access); if no admin can sign in, run <code>node scripts/reset-admin.mjs &lt;username&gt;</code> on the server.
</p>

{#if data.demoStillOpen.length}
	<p class="demo" role="alert">
		The demo accounts {data.demoStillOpen.join(', ')} still use the public demo password. Deactivate them or reset their passwords before real use.
	</p>
{/if}

<div class="ov-form">
	<form method="POST" action="?/create" novalidate use:enhance={submit('create', true)}>
		<fieldset>
			<legend>Add a user</legend>
			<div class="grid">
				<div class="field">
					<label for="username">Username</label>
					<input id="username" name="username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="32" value={cv?.username ?? ''}
						aria-invalid={cErr.username ? 'true' : undefined} aria-describedby={desc(cErr, 'username')} />
					{#if cErr.username}<p class="err" id="username-err">{cErr.username}</p>{/if}
				</div>
				<div class="field">
					<label for="displayName">Display name</label>
					<input id="displayName" name="displayName" autocomplete="off" maxlength="60" value={cv?.displayName ?? ''}
						aria-invalid={cErr.displayName ? 'true' : undefined} aria-describedby={desc(cErr, 'displayName')} />
					{#if cErr.displayName}<p class="err" id="displayName-err">{cErr.displayName}</p>{/if}
				</div>
				<div class="field">
					<label for="role">Role</label>
					<select id="role" name="role" aria-invalid={cErr.role ? 'true' : undefined} aria-describedby={desc(cErr, 'role')}>
						{#each ROLES as [v, label] (v)}<option value={v} selected={(cv?.role ?? 'provider') === v}>{label}</option>{/each}
					</select>
					{#if cErr.role}<p class="err" id="role-err">{cErr.role}</p>{/if}
				</div>
				<div class="field">
					<label for="password">Temporary password</label>
					<input id="password" name="password" type="password" autocomplete="new-password"
						aria-invalid={cErr.password ? 'true' : undefined} aria-describedby={desc(cErr, 'password', true)} />
					<p class="hint" id="password-hint">{PASSWORD_HINT} They must change it at first sign-in.</p>
					{#if cErr.password}<p class="err" id="password-err">{cErr.password}</p>{/if}
				</div>
			</div>
			<div class="actions">
				<button type="submit" class="primary" disabled={busy === 'create'}>{busy === 'create' ? 'Adding…' : 'Add user'}</button>
				{#if form?.section === 'create' && form.ok}<p class="saved" role="status">{form.message}</p>{/if}
			</div>
		</fieldset>
	</form>

	<section class="card" aria-labelledby="list-h">
		<h3 id="list-h">All users ({data.users.length})</h3>
		<ul class="users">
			{#each data.users as u (u.id)}
				{@const msg = rowMsg(u.id)}
				{@const self = u.id === data.meId}
				<li class:inactive={!u.active}>
					<div class="who">
						<strong>{u.displayName}</strong>
						<span class="meta">
							{u.username ?? 'no sign-in'} · {ROLE_SHORT[u.role]}
							{#if !u.active}· <span class="off">deactivated</span>{/if}
							{#if u.mustChangePassword}· temporary password{/if}
							{#if self}· you{/if}
						</span>
					</div>
					<div class="acts">
						<form method="POST" action="?/role" use:enhance={submit(`role${u.id}`)} class="inline">
							<input type="hidden" name="id" value={u.id} />
							<label class="visually-hidden" for="role-{u.id}">Role for {u.displayName}</label>
							<select id="role-{u.id}" name="role" disabled={self}>
								{#each ROLES as [v] (v)}<option value={v} selected={u.role === v}>{ROLE_SHORT[v]}</option>{/each}
							</select>
							<button type="submit" disabled={self || busy === `role${u.id}`}>Change role<span class="visually-hidden"> for {u.displayName}</span></button>
						</form>
						<form method="POST" action={u.active ? '?/deactivate' : '?/reactivate'} use:enhance={submit(`act${u.id}`)} class="inline">
							<input type="hidden" name="id" value={u.id} />
							<button type="submit" class:danger={u.active} disabled={self || busy === `act${u.id}`}>
								{u.active ? 'Deactivate' : 'Reactivate'}<span class="visually-hidden"> {u.displayName}</span>
							</button>
						</form>
						<details>
							<summary>Reset password<span class="visually-hidden"> for {u.displayName}</span></summary>
							<form method="POST" action="?/reset" novalidate use:enhance={submit(`reset${u.id}`, true)} class="reset">
								<input type="hidden" name="id" value={u.id} />
								<div class="field">
									<label for="reset-{u.id}">New temporary password</label>
									<input id="reset-{u.id}" name="password" type="password" autocomplete="new-password"
										aria-invalid={msg?.errors?.password ? 'true' : undefined}
										aria-describedby={msg?.errors?.password ? `reset-${u.id}-err` : undefined} />
									{#if msg?.errors?.password}<p class="err" id="reset-{u.id}-err">{msg.errors.password}</p>{/if}
								</div>
								<button type="submit" disabled={busy === `reset${u.id}`}>Set temporary password</button>
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
