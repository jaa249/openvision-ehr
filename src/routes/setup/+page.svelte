<script lang="ts">
	import { enhance } from '$app/forms';
	import '#lib/components/settings/forms.css';
	import { PASSWORD_HINT } from '#lib/components/settings/rules.ts';
	import type { FullAutoFill } from 'svelte/elements';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	let busy = $state(false);
</script>

<svelte:head><title>First-run setup · OpenVision</title></svelte:head>

<main>
	<h1>Welcome to OpenVision</h1>
	<p class="sub">No one can sign in yet. Create the first administrator account. You can add providers and technicians afterwards in Settings → Users.</p>

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
			<legend>Administrator</legend>
			{#if errors.form}<p class="summary" role="alert">{errors.form}</p>{/if}
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
			{@render field('username', 'Username', 'text', 'username', form?.values?.username ?? '', '3-32 letters, numbers, dots, hyphens or underscores.')}
			{@render field('displayName', 'Display name', 'text', 'name', form?.values?.displayName ?? '', 'Shown in the header and on records, e.g. "Office Manager".')}
			{@render field('password', 'Password', 'password', 'new-password', '', PASSWORD_HINT)}
			{@render field('confirm', 'Confirm password', 'password', 'new-password', '')}
			<div class="actions">
				<button type="submit" class="primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin and sign in'}</button>
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
