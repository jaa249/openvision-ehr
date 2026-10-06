<script lang="ts">
	// Demographic fields shared by "New patient" and the chart's edit form.
	type Values = { legalFirst?: string; legalLast?: string; preferredName?: string; dob?: string; mrn?: string };
	let {
		values = {},
		errors = {},
		today,
		mrnRequired = false
	}: { values?: Values; errors?: Record<string, string>; today: string; mrnRequired?: boolean } = $props();
</script>

<div class="grid">
	<div class="field">
		<label for="legalFirst">Legal first name</label>
		<input
			id="legalFirst"
			name="legalFirst"
			value={values.legalFirst ?? ''}
			required
			maxlength="60"
			autocomplete="off"
			aria-invalid={errors.legalFirst ? 'true' : undefined}
			aria-describedby={errors.legalFirst ? 'legalFirst-err' : undefined}
		/>
		{#if errors.legalFirst}<p class="err" id="legalFirst-err">{errors.legalFirst}</p>{/if}
	</div>
	<div class="field">
		<label for="legalLast">Legal last name</label>
		<input
			id="legalLast"
			name="legalLast"
			value={values.legalLast ?? ''}
			required
			maxlength="60"
			autocomplete="off"
			aria-invalid={errors.legalLast ? 'true' : undefined}
			aria-describedby={errors.legalLast ? 'legalLast-err' : undefined}
		/>
		{#if errors.legalLast}<p class="err" id="legalLast-err">{errors.legalLast}</p>{/if}
	</div>
	<div class="field">
		<label for="preferredName">Preferred name <span class="opt">(optional)</span></label>
		<input
			id="preferredName"
			name="preferredName"
			value={values.preferredName ?? ''}
			maxlength="60"
			autocomplete="off"
			aria-invalid={errors.preferredName ? 'true' : undefined}
			aria-describedby="preferredName-hint{errors.preferredName ? ' preferredName-err' : ''}"
		/>
		<p class="hint" id="preferredName-hint">Shown on screen; reports use the legal name.</p>
		{#if errors.preferredName}<p class="err" id="preferredName-err">{errors.preferredName}</p>{/if}
	</div>
	<div class="field">
		<label for="dob">Date of birth</label>
		<input
			id="dob"
			name="dob"
			type="date"
			value={values.dob ?? ''}
			required
			min="1900-01-01"
			max={today}
			aria-invalid={errors.dob ? 'true' : undefined}
			aria-describedby={errors.dob ? 'dob-err' : undefined}
		/>
		{#if errors.dob}<p class="err" id="dob-err">{errors.dob}</p>{/if}
	</div>
	<div class="field">
		<label for="mrn">MRN {#if !mrnRequired}<span class="opt">(optional)</span>{/if}</label>
		<input
			id="mrn"
			name="mrn"
			value={values.mrn ?? ''}
			required={mrnRequired}
			maxlength="20"
			autocomplete="off"
			aria-invalid={errors.mrn ? 'true' : undefined}
			aria-describedby="mrn-hint{errors.mrn ? ' mrn-err' : ''}"
		/>
		<p class="hint" id="mrn-hint">{mrnRequired ? 'Letters, numbers and hyphens; must be unique.' : 'Leave blank to assign the next 6-digit number.'}</p>
		{#if errors.mrn}<p class="err" id="mrn-err">{errors.mrn}</p>{/if}
	</div>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 15em), 1fr));
		gap: var(--space-3) var(--space-4);
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
	.opt {
		color: var(--text-3);
		font-weight: var(--weight-regular);
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
	.hint,
	.err {
		margin: 0;
		font-size: var(--text-xs);
	}
	.hint {
		color: var(--text-3);
	}
	.err {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
</style>
