<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	const v = $derived(form?.values ?? data.practice);
	let busy = $state(false);
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
