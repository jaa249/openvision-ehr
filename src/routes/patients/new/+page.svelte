<script lang="ts">
	import { enhance } from '$app/forms';
	import PatientFields from '#lib/components/PatientFields.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();

	let rows = $state<{ title: string; reaction: string }[]>([]);
	// Re-seed the rows from the server's copy after a failed submit; otherwise one blank row.
	$effect.pre(() => {
		rows = form?.allergies?.length ? form.allergies.map((a) => ({ title: a.title, reaction: a.reaction ?? '' })) : [{ title: '', reaction: '' }];
	});
	let nkda = $state(false);
	$effect.pre(() => {
		nkda = form?.noKnownAllergies ?? false;
	});
	const hasAllergy = $derived(rows.some((r) => r.title.trim() || r.reaction.trim()));
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	const errorList = $derived(Object.values(errors));
	let busy = $state(false);
</script>

<svelte:head><title>{t('patients.newTitle')}</title></svelte:head>

<main>
	<nav aria-label={t('patients.breadcrumb')}><a href="/">{t('patients.backToPatients')}</a></nav>
	<h1>{t('patients.newPatient')}</h1>
	<p class="note">{t('patients.newDemoNote')}</p>

	<form
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
		{#if errorList.length}
			<div class="summary" role="alert">
				<strong>{t('patients.fixProblems', { count: errorList.length })}</strong>
				<ul>
					{#each errorList as msg}<li>{msg}</li>{/each}
				</ul>
			</div>
		{/if}

		<fieldset>
			<legend>{t('patients.demographics')}</legend>
			<PatientFields values={form?.values ?? {}} {errors} today={data.today} />
		</fieldset>

		<fieldset>
			<legend>{t('patients.allergies')}</legend>
			<!-- Explicit choice: leaving everything blank records "not recorded", never "no known allergies". -->
			<label class="nkda">
				<input
					type="checkbox"
					name="nkda"
					value="1"
					bind:checked={nkda}
					disabled={hasAllergy}
					aria-describedby={errors.nkda ? 'nkda-err' : 'nkda-hint'}
				/>
				{t('patients.noKnownAllergies')}
			</label>
			{#if errors.nkda}<p class="err" id="nkda-err">{errors.nkda}</p>{/if}
			{#if !nkda}
				{#each rows as row, i (i)}
					<div class="arow">
						<div class="field">
							<label for="at{i}">{t('patients.substance')}</label>
							<input
								id="at{i}"
								name="allergy_title"
								bind:value={row.title}
								maxlength="80"
								autocomplete="off"
								aria-invalid={errors[`allergy${i}_title`] ? 'true' : undefined}
								aria-describedby={errors[`allergy${i}_title`] ? `at${i}-err` : undefined}
							/>
							{#if errors[`allergy${i}_title`]}<p class="err" id="at{i}-err">{errors[`allergy${i}_title`]}</p>{/if}
						</div>
						<div class="field">
							<label for="ar{i}">{t('patients.reaction')}</label>
							<input
								id="ar{i}"
								name="allergy_reaction"
								bind:value={row.reaction}
								maxlength="120"
								autocomplete="off"
								aria-invalid={errors[`allergy${i}_reaction`] ? 'true' : undefined}
								aria-describedby={errors[`allergy${i}_reaction`] ? `ar${i}-err` : undefined}
							/>
							{#if errors[`allergy${i}_reaction`]}<p class="err" id="ar{i}-err">{errors[`allergy${i}_reaction`]}</p>{/if}
						</div>
						{#if rows.length > 1}
							<button type="button" class="rm" onclick={() => rows.splice(i, 1)} aria-label={t('patients.removeAllergyRow', { n: i + 1 })}>{t('common.remove')}</button>
						{/if}
					</div>
				{/each}
				{#if rows.length < 20}
					<button type="button" class="add" onclick={() => rows.push({ title: '', reaction: '' })}>{t('patients.addAnotherAllergy')}</button>
				{/if}
			{/if}
			<p class="hint" id="nkda-hint">
				{#if hasAllergy}{t('patients.nkdaHintClear')}{:else}{t('patients.nkdaHintBlank')}{/if}
			</p>
		</fieldset>

		<div class="actions">
			<button type="submit" class="primary" disabled={busy}>{busy ? t('patients.creating') : t('patients.createPatient')}</button>
			<a href="/">{t('common.cancel')}</a>
		</div>
	</form>
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4);
	}
	nav a,
	.actions a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
	}
	h1 {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: var(--space-2) 0 var(--space-1);
	}
	.note,
	.hint {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-regular);
	}
	.note {
		margin: 0 0 var(--space-4);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	fieldset {
		margin: 0;
		min-width: 0;
		padding: var(--space-3) var(--space-4) var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	legend {
		font-weight: var(--weight-semibold);
		padding: 0 var(--space-2);
	}
	.summary {
		border: 1px solid var(--danger);
		border-radius: var(--radius-2);
		padding: var(--space-3) var(--space-4);
		color: var(--danger);
	}
	.summary ul {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-5);
	}
	.arow {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: var(--space-2) var(--space-3);
		align-items: start;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	label {
		font-weight: var(--weight-semibold);
	}
	input {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-height: var(--target-min);
		padding: 0 var(--space-2);
		width: 100%;
	}
	input[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.err {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.rm {
		align-self: end;
	}
	.nkda {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: max(40px, var(--target-min));
		align-self: flex-start;
	}
	.nkda input {
		width: 20px;
		height: 20px;
		min-height: 20px;
		margin: 0;
		accent-color: var(--accent);
	}
	.add {
		align-self: flex-start;
	}
	.hint {
		margin: 0;
	}
	.actions {
		display: flex;
		gap: var(--space-4);
		align-items: center;
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.primary:disabled {
		color: var(--accent-text);
		opacity: 0.6;
	}
	@media (max-width: 560px) {
		.arow {
			grid-template-columns: 1fr;
		}
		.rm {
			align-self: start;
		}
	}
</style>
