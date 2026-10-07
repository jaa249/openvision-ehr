<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import '#lib/components/settings/forms.css';
	import LanguageSelect from '#lib/components/settings/LanguageSelect.svelte';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	let busy = $state(false);
	const { t } = useI18n();
	// Without JavaScript the language menu is a GET form with a "Change" button; once the page runs,
	// a change applies at once and the button is not shown.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});
	function changeLanguage(lang: string) {
		const q = new URLSearchParams({ lang });
		if (data.next !== '/') q.set('next', data.next);
		goto(`/login?${q}`, { refreshAll: true, replace: true, reset: false });
	}
	const role = (r: string) =>
		r === 'admin' ? t('auth.demoRoleAdmin') : r === 'provider' ? t('auth.demoRoleProvider') : r === 'tech' ? t('auth.demoRoleTech') : r;
</script>

<svelte:head><title>{t('auth.loginTitle')}</title></svelte:head>

<main>
	<form class="ov-form lang" method="GET" action="/login">
		{#if data.next !== '/'}<input type="hidden" name="next" value={data.next} />{/if}
		<LanguageSelect id="lang" label={t('auth.language')} value={data.locale} onchange={changeLanguage} />
		{#if !hydrated}<button type="submit">{t('auth.changeLanguage')}</button>{/if}
	</form>

	<h1>{t('common.appName')}</h1>
	<p class="sub">{t('auth.signInToContinue')}</p>

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
		<input type="hidden" name="next" value={data.next} />
		<input type="hidden" name="langChosen" value={data.langChosen ? '1' : ''} />
		<div class="card">
			{#if form?.message}<p class="summary" role="alert">{form.message}</p>{/if}
			<div class="field">
				<label for="username">{t('auth.username')}</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="username"
					name="username"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					autofocus
					value={form?.username ?? ''}
					aria-invalid={errors.username ? 'true' : undefined}
					aria-describedby={errors.username ? 'username-err' : undefined}
				/>
				{#if errors.username}<p class="err" id="username-err">{errors.username}</p>{/if}
			</div>
			<div class="field">
				<label for="password">{t('auth.password')}</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					aria-invalid={errors.password ? 'true' : undefined}
					aria-describedby={errors.password ? 'password-err' : undefined}
				/>
				{#if errors.password}<p class="err" id="password-err">{errors.password}</p>{/if}
			</div>
			<div class="actions">
				<button type="submit" class="primary wide" disabled={busy}>{busy ? t('auth.signingIn') : t('auth.signIn')}</button>
			</div>
		</div>
	</form>

	<details class="forgot">
		<summary>{t('auth.forgotSummary')}</summary>
		<p>{t('auth.forgotAskAdmin')}</p>
		<p>{t('auth.forgotNoAdmin')}</p>
		<ol>
			<li>{t('auth.forgotStep1')}</li>
			<li>
				<Msg key="auth.forgotStep2">
					{#snippet command()}<code>node scripts/reset-admin.mjs <var>username</var></code>{/snippet}
				</Msg>
			</li>
			<li>{t('auth.forgotStep3')}</li>
		</ol>
		<p>{t('auth.forgotNote')}</p>
	</details>

	{#if data.demo.length}
		<section class="demo" aria-labelledby="demo-h">
			<h2 id="demo-h">{t('auth.demoHeading')}</h2>
			<p>{t('auth.demoIntro')}</p>
			<dl>
				{#each data.demo as d (d.username)}
					<div><dt><code>{d.username}</code></dt><dd>{role(d.role)}</dd></div>
				{/each}
			</dl>
			<p>
				<Msg key="auth.demoPassword">
					{#snippet password()}<code>openvision-demo</code>{/snippet}
				</Msg>
			</p>
			<p class="warn">{t('auth.demoWarn')}</p>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 420px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
	}
	.lang {
		flex-direction: row;
		align-items: flex-end;
		justify-content: flex-end;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		font-size: var(--text-sm);
	}
	.lang :global(select) {
		width: auto;
	}
	.lang :global(label) {
		font-weight: var(--weight-regular);
		color: var(--text-2);
	}
	.lang button {
		padding: 0 var(--space-3);
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
	.wide {
		flex: 1;
	}
	.forgot {
		margin-top: var(--space-4);
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.forgot summary {
		cursor: pointer;
		color: var(--accent);
		padding: var(--space-1) 0;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.forgot p,
	.forgot ol {
		margin: var(--space-2) 0;
	}
	.forgot ol {
		padding-left: 1.4em;
	}
	.demo {
		margin-top: var(--space-5);
		padding: var(--space-3) var(--space-4);
		border: 1px dashed var(--warn);
		border-radius: var(--radius-2);
		background: var(--surface-1);
	}
	.demo h2 {
		font-size: var(--text-md);
		margin: 0 0 var(--space-2);
	}
	.demo p {
		margin: var(--space-2) 0;
		color: var(--text-2);
	}
	dl {
		margin: 0;
		display: grid;
		gap: var(--space-1);
	}
	dl div {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-3);
	}
	dt {
		min-width: 9em;
	}
	dd {
		margin: 0;
		color: var(--text-2);
	}
	code {
		font-family: var(--font-mono);
	}
	.warn {
		color: var(--warn) !important;
		font-size: var(--text-xs);
	}
</style>
