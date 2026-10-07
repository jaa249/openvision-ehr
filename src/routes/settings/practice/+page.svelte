<script lang="ts">
	import { enhance } from '$app/forms';
	import { CODE_SETS, CODE_SET_IDS, ICD11_CITATION, ICD11_LICENCE, type CodeSetId } from '#lib/codesets/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	const v = $derived(form?.values ?? data.practice);
	let busy = $state(false);
	let codesBusy = $state(false);
	const codesErrors = $derived<Record<string, string>>(form?.codesErrors ?? {});
	// The radio follows the saved value until the admin picks another (so the citation shows at once).
	let picked = $state<CodeSetId | null>(null);
	const codeSet = $derived(picked ?? data.codes.codeSet);
	const FIELDS = [
		{ id: 'name', label: 'Practice name', max: 100, auto: 'organization', hint: 'Printed at the top of reports and prescriptions.' },
		{ id: 'address', label: 'Address', max: 200, auto: 'street-address', hint: 'One line, e.g. "100 Main Street, Anytown, ST 00000".' },
		{ id: 'phone', label: 'Phone', max: 30, auto: 'tel', hint: '' },
		{ id: 'fax', label: 'Fax', max: 30, auto: 'off', hint: '' }
	] as const;
</script>

<svelte:head><title>Practice · Settings · OpenVision</title></svelte:head>

<h2>Practice</h2>
<p class="lead">Used on printed reports and spectacle / contact lens prescriptions.</p>
{#if data.welcome}
	<p class="lead" role="status"><strong>Your admin account is ready.</strong> Fill in your practice details, then add users in Users.</p>
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
		<legend>Practice details</legend>
		<div class="grid">
			{#each FIELDS as f (f.id)}
				<div class="field">
					<label for={f.id}>{f.label}{f.id === 'name' ? '' : ' (optional)'}</label>
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
			<button type="submit" class="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
			{#if form?.ok}<p class="saved" role="status">Saved.</p>{/if}
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
		<legend>Diagnosis codes and billing</legend>
		<fieldset class="radios" aria-describedby="codeset-hint">
			<legend class="label">Diagnosis code set</legend>
			{#each CODE_SET_IDS as id (id)}
				<label class="check">
					<input type="radio" name="codeSet" value={id} checked={codeSet === id} onchange={() => (picked = id)} />
					{CODE_SETS[id].label}
				</label>
			{/each}
		</fieldset>
		<p class="hint" id="codeset-hint">
			Existing impression items and history entries keep the codes they have; only codes added from now on use the new set.
		</p>
		{#if codesErrors.codeSet}<p class="err">{codesErrors.codeSet}</p>{/if}
		{#if codeSet === 'icd11'}
			<p class="hint cite">{ICD11_CITATION}. Licence: {ICD11_LICENCE}. Release 2026-01, English, as published by WHO.</p>
		{/if}
		<label class="check">
			<input type="checkbox" name="usBilling" checked={data.codes.usBilling} aria-describedby="usbilling-hint" />
			US billing (CPT coding and superbill)
		</label>
		<p class="hint" id="usbilling-hint">
			Off: the Coding section (key 0) and the superbill are not offered. Nothing already saved is deleted; switching it back on shows it again.
		</p>
		{#if codesErrors.usBilling}<p class="err">{codesErrors.usBilling}</p>{/if}
		<div class="actions">
			<button type="submit" class="primary" disabled={codesBusy}>{codesBusy ? 'Saving…' : 'Save'}</button>
			{#if form?.codesOk}<p class="saved" role="status">Saved.</p>{/if}
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
</style>
