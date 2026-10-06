<script lang="ts">
	import { enhance } from '$app/forms';
	import PatientFields from '#lib/components/PatientFields.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const p = $derived(data.patient);
	const display = $derived(p.preferredName || p.legalFirst);
	const legalName = $derived(`${p.legalFirst} ${p.legalLast}`);

	const errorsFor = (section: string): Record<string, string> =>
		form && form.section === section && 'errors' in form ? (form.errors ?? {}) : {};
	const valuesFor = <T,>(section: string): Partial<T> =>
		form && form.section === section && 'values' in form ? (form.values as unknown as Partial<T>) : {};

	const editErrors = $derived(errorsFor('update'));
	const allergyErrors = $derived(errorsFor('allergy'));
	const visitErrors = $derived(errorsFor('visit'));
	const editValues = $derived(
		Object.keys(editErrors).length
			? valuesFor<Record<string, string>>('update')
			: { legalFirst: p.legalFirst, legalLast: p.legalLast, preferredName: p.preferredName ?? '', dob: p.dob, mrn: p.mrn }
	);
	const allergyValues = $derived(valuesFor<{ title: string; reaction: string }>('allergy'));
	const visitValues = $derived(valuesFor<{ date: string; visitType: string }>('visit'));

	let editing = $state(false);
	$effect(() => {
		if (Object.keys(editErrors).length) editing = true;
	});
	let status = $state('');
</script>

<svelte:head><title>{display} {p.legalLast} · OpenVision</title></svelte:head>

<header class="top">
	<a href="/">← Patients</a>
	<ThemeToggle />
</header>

<main>
	<section class="head" aria-labelledby="who">
		<div class="avatar" aria-hidden="true">{display[0]}{p.legalLast[0]}</div>
		<div>
			<h1 id="who">{display} {p.legalLast}</h1>
			{#if display !== p.legalFirst}<p class="legal">Legal name: {legalName}</p>{/if}
			<p class="meta num">{p.age} y · DOB {p.dob} · MRN {p.mrn}</p>
		</div>
	</section>

	<p class="visually-hidden" role="status" aria-live="polite">{status}</p>

	<section class="card" aria-labelledby="demo-h">
		<div class="row">
			<h2 id="demo-h">Demographics</h2>
			{#if !editing}<button type="button" onclick={() => (editing = true)}>Edit</button>{/if}
		</div>
		{#if editing}
			<form
				method="POST"
				action="?/update"
				novalidate
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') {
							editing = false;
							status = 'Demographics saved.';
						}
					}}
			>
				{#if Object.keys(editErrors).length}
					<p class="err" role="alert">Please fix the highlighted fields.</p>
				{/if}
				<PatientFields values={editValues} errors={editErrors} today={data.today} mrnRequired />
				<div class="actions">
					<button type="submit" class="primary">Save changes</button>
					<button type="button" onclick={() => (editing = false)}>Cancel</button>
				</div>
			</form>
		{:else}
			<dl>
				<div><dt>Legal name</dt><dd>{legalName}</dd></div>
				<div><dt>Preferred name</dt><dd>{p.preferredName ?? 'None'}</dd></div>
				<div><dt>Date of birth</dt><dd class="num">{p.dob} ({p.age} y)</dd></div>
				<div><dt>MRN</dt><dd class="num">{p.mrn}</dd></div>
			</dl>
		{/if}
	</section>

	<section class="card" aria-labelledby="all-h">
		<h2 id="all-h">Allergies</h2>
		{#if p.allergies.length}
			<ul class="allergies">
				{#each p.allergies as a (a.id)}
					<li>
						<span><strong>{a.title}</strong>{#if a.reaction} <span class="reaction">· {a.reaction}</span>{/if}</span>
						<form method="POST" action="?/removeAllergy" use:enhance={() => async ({ update }) => { await update(); status = `Removed ${a.title}.`; }}>
							<input type="hidden" name="allergyId" value={a.id} />
							<button type="submit" aria-label="Remove allergy {a.title}">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No known allergies</p>
		{/if}
		<form
			method="POST"
			action="?/addAllergy"
			class="add"
			novalidate
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') status = 'Allergy added.';
				}}
		>
			<div class="field">
				<label for="al-title">Substance</label>
				<input
					id="al-title"
					name="title"
					value={allergyValues.title ?? ''}
					maxlength="80"
					autocomplete="off"
					aria-invalid={allergyErrors.title ? 'true' : undefined}
					aria-describedby={allergyErrors.title ? 'al-title-err' : undefined}
				/>
				{#if allergyErrors.title}<p class="err" id="al-title-err">{allergyErrors.title}</p>{/if}
			</div>
			<div class="field">
				<label for="al-reaction">Reaction <span class="opt">(optional)</span></label>
				<input
					id="al-reaction"
					name="reaction"
					value={allergyValues.reaction ?? ''}
					maxlength="120"
					autocomplete="off"
					aria-invalid={allergyErrors.reaction ? 'true' : undefined}
					aria-describedby={allergyErrors.reaction ? 'al-reaction-err' : undefined}
				/>
				{#if allergyErrors.reaction}<p class="err" id="al-reaction-err">{allergyErrors.reaction}</p>{/if}
			</div>
			<button type="submit" class="submit">Add allergy</button>
		</form>
	</section>

	<section class="card" aria-labelledby="new-visit-h">
		<h2 id="new-visit-h">New visit</h2>
		<form method="POST" action="?/newVisit" class="add" novalidate use:enhance>
			<div class="field">
				<label for="v-date">Date</label>
				<input
					id="v-date"
					name="date"
					type="date"
					value={visitValues.date ?? data.today}
					min={p.dob}
					max={data.today}
					required
					aria-invalid={visitErrors.date ? 'true' : undefined}
					aria-describedby={visitErrors.date ? 'v-date-err' : undefined}
				/>
				{#if visitErrors.date}<p class="err" id="v-date-err">{visitErrors.date}</p>{/if}
			</div>
			<div class="field">
				<label for="v-type">Visit type</label>
				<select
					id="v-type"
					name="visitType"
					aria-invalid={visitErrors.visitType ? 'true' : undefined}
					aria-describedby={visitErrors.visitType ? 'v-type-err' : undefined}
				>
					{#each data.visitTypes as t}
						<option value={t} selected={t === (visitValues.visitType ?? data.visitTypes[0])}>{t}</option>
					{/each}
				</select>
				{#if visitErrors.visitType}<p class="err" id="v-type-err">{visitErrors.visitType}</p>{/if}
			</div>
			<button type="submit" class="submit primary">Start visit</button>
			{#if visitErrors.provider}<p class="err">{visitErrors.provider}</p>{/if}
		</form>
	</section>

	<section class="card" aria-labelledby="visits-h">
		<h2 id="visits-h">Visits</h2>
		{#if p.visits.length}
			<ul class="visits">
				{#each p.visits as v (v.id)}
					<li>
						<div class="vmain">
							<span class="num vdate">{v.date}</span>
							<span>{v.visitType}</span>
							<span class="meta">{v.provider} · {v.findingsCount} {v.findingsCount === 1 ? 'finding' : 'findings'}</span>
						</div>
						<div class="vlinks">
							<a href="/patients/{p.id}/encounters/{v.id}">Open<span class="visually-hidden"> visit of {v.date}</span></a>
							<a href="/print?ids={v.id}" target="_blank" rel="noopener">Print<span class="visually-hidden"> visit of {v.date}</span></a>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No visits yet. Start one above.</p>
		{/if}
	</section>
</main>

<style>
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	.top a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
	}
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.head {
		display: flex;
		gap: var(--space-4);
		align-items: center;
	}
	.avatar {
		width: 56px;
		height: 56px;
		flex: none;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		display: grid;
		place-items: center;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}
	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
		overflow-wrap: anywhere;
	}
	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}
	.legal,
	.meta,
	.opt,
	.reaction {
		color: var(--text-2);
	}
	.legal,
	.meta {
		margin: var(--space-1) 0 0;
	}
	.opt {
		font-weight: var(--weight-regular);
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-3) var(--space-4) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12em), 1fr));
		gap: var(--space-3);
	}
	dt {
		color: var(--text-3);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.allergies li,
	.visits li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--row-height);
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--hairline);
	}
	.allergies li:last-child,
	.visits li:last-child {
		border-bottom: 0;
	}
	.allergies form {
		flex-direction: row;
	}
	.empty {
		margin: 0;
		color: var(--text-2);
	}
	.vmain {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-3);
		align-items: baseline;
		min-width: 0;
	}
	.vdate {
		font-weight: var(--weight-semibold);
	}
	.vlinks {
		display: flex;
		gap: var(--space-4);
		flex: none;
	}
	.vlinks a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
	}
	.add {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.add .field {
		flex: 1 1 12em;
	}
	.submit {
		align-self: flex-end;
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
	input,
	select {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-height: var(--target-min);
		padding: 0 var(--space-2);
		width: 100%;
	}
	input[aria-invalid='true'],
	select[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.err {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.actions {
		display: flex;
		gap: var(--space-3);
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
</style>
