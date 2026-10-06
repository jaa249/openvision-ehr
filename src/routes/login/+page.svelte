<script lang="ts">
	import { enhance } from '$app/forms';
	import '#lib/components/settings/forms.css';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	let busy = $state(false);
	const ROLE: Record<string, string> = { admin: 'admin: settings and users', provider: 'provider: exams and signing', tech: 'technician: exam entry' };
</script>

<svelte:head><title>Sign in · OpenVision</title></svelte:head>

<main>
	<h1>OpenVision</h1>
	<p class="sub">Sign in to continue.</p>

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
		<div class="card">
			{#if form?.message}<p class="summary" role="alert">{form.message}</p>{/if}
			<div class="field">
				<label for="username">Username</label>
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
				<label for="password">Password</label>
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
				<button type="submit" class="primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
			</div>
		</div>
	</form>

	{#if data.demo.length}
		<section class="demo" aria-labelledby="demo-h">
			<h2 id="demo-h">Demo accounts</h2>
			<p>This install still has the fictional demo accounts with their public password. All demo data is made up.</p>
			<dl>
				{#each data.demo as d (d.username)}
					<div><dt><code>{d.username}</code></dt><dd>{ROLE[d.role] ?? d.role}</dd></div>
				{/each}
			</dl>
			<p>Password for each: <code>openvision-demo</code></p>
			<p class="warn">Before real use, an admin should deactivate these accounts or change their passwords (Settings → Users). This box then disappears.</p>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 420px;
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
	.wide {
		flex: 1;
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
