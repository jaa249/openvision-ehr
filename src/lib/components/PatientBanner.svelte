<script lang="ts">
	import type { EncounterInfo, PatientHeader } from '#lib/exam/types.ts';
	import type { Saver } from '#lib/exam/saver.svelte.ts';
	import ThemeToggle from './ThemeToggle.svelte';

	let {
		patient,
		encounter,
		saver,
		onprint
	}: { patient: PatientHeader; encounter: EncounterInfo; saver: Saver; onprint: () => void } = $props();

	const initials = $derived(
		patient.name
			.split(' ')
			.map((p) => p[0])
			.slice(0, 2)
			.join('')
	);
	const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
</script>

<header class="banner" aria-label="Patient">
	{#if patient.photoUrl}
		<img class="avatar" src={patient.photoUrl} alt="" />
	{:else}
		<div class="avatar" aria-hidden="true">{initials}</div>
	{/if}
	<div class="who">
		<div class="name">
			<a class="chart" href="/patients/{patient.id}" title="Open patient chart">{patient.name}</a>
			{#if patient.name !== patient.legalName}<span class="legal">(legal: {patient.legalName})</span>{/if}
		</div>
		<div class="meta num">{patient.age} y · DOB {patient.dob} · MRN {patient.mrn}</div>
	</div>
	<div class="allergy" class:none={patient.allergies.length === 0}>
		{#if patient.allergies.length}
			<span aria-hidden="true">⚠</span> Allergies: {patient.allergies.map((a) => a.title).join(', ')}
		{:else}
			No known allergies
		{/if}
	</div>
	<div class="meta">{encounter.visitType} · {encounter.provider} · <span class="num">{encounter.date}</span></div>
	<div class="spacer"></div>
	<div class="save" role="status" aria-live="polite" data-status={saver.status}>
		{#if saver.status === 'error'}
			Not saved, retrying…
		{:else if saver.showSaving}
			Saving…
		{:else if saver.savedAt}
			Saved {time(saver.savedAt)}
		{/if}
	</div>
	<button type="button" class="print" onclick={onprint} title="Print this exam (Ctrl+P)">Print</button>
	<ThemeToggle />
	<a class="close" href="/">Patients</a>
</header>

<style>
	.banner {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	.avatar {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		display: grid;
		place-items: center;
		font-weight: var(--weight-semibold);
		flex: none;
		object-fit: cover;
	}
	.name {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		line-height: var(--leading-tight);
	}
	.chart {
		color: inherit;
		text-decoration: none;
	}
	.chart:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	.legal,
	.meta {
		color: var(--text-2);
		font-weight: var(--weight-regular);
	}
	.legal {
		font-size: var(--text-xs);
	}
	.allergy {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.allergy.none {
		color: var(--text-2);
		font-weight: var(--weight-regular);
	}
	.spacer {
		flex: 1;
	}
	.save {
		color: var(--ok);
		min-width: 7em;
		text-align: right;
	}
	.save[data-status='error'] {
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	.close {
		min-height: var(--target-min);
		display: inline-flex;
		align-items: center;
	}
</style>
