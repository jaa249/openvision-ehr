<script lang="ts">
	import type { EncounterInfo, PatientHeader } from '#lib/exam/types.ts';
	import type { Saver } from '#lib/exam/saver.svelte.ts';
	import type { ExamLock } from '#lib/exam/lock.svelte.ts';
	import ThemeToggle from './ThemeToggle.svelte';
	import { historyBus } from '#lib/history/bus.svelte.ts';

	let {
		patient,
		encounter,
		saver,
		lock,
		cansign = false,
		signing = false,
		onprint,
		ondownloadpdf,
		ondownloadfhir,
		onsign,
		ontakeover,
		onedit,
		onstaff
	}: {
		patient: PatientHeader;
		encounter: EncounterInfo;
		saver: Saver;
		/** Edit lock / signature state of this exam (spec §15.1); omitted = plain editing banner. */
		lock?: ExamLock;
		/** This user may sign: the visit's own provider. */
		cansign?: boolean;
		signing?: boolean;
		onprint: () => void;
		/** Download as PDF: opens the print view (the browser's Save as PDF; no PDF engine, D17). */
		ondownloadpdf?: () => void;
		/** Download as FHIR R4 JSON for another EHR (D47). */
		ondownloadfhir?: () => void;
		onsign?: () => void;
		/** Read-only because someone else holds the lock: take it over (the page confirms first). */
		ontakeover?: () => void;
		/** Read-only and nobody holds the lock now: start editing. */
		onedit?: () => void;
		/** Change the visit's provider / technician (only while this page may edit). */
		onstaff?: () => void;
	} = $props();

	const initials = $derived(
		patient.name
			.split(' ')
			.map((p) => p[0])
			.slice(0, 2)
			.join('')
	);
	// The history panel publishes changes made during the visit; otherwise the page's copy.
	const allergies = $derived(historyBus.allergy?.patientId === patient.id ? historyBus.allergy.status : patient.allergyStatus);
	const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

	// ---------- Download menu (D46: the visit goes into another chart as a PDF or FHIR) ----------
	// A disclosure (button + list of buttons): Tab moves through the items, Escape closes and
	// returns focus to the button, a click outside closes it.
	let downloadOpen = $state(false);
	let downloadButton = $state<HTMLButtonElement | null>(null);
	let downloadWrap = $state<HTMLDivElement | null>(null);
	function closeDownload(refocus = true) {
		downloadOpen = false;
		if (refocus) downloadButton?.focus();
	}
	function pick(fn: (() => void) | undefined) {
		closeDownload();
		fn?.();
	}
	function onDownloadKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && downloadOpen) {
			e.stopPropagation();
			closeDownload();
		}
	}
	function onWindowPointer(e: PointerEvent) {
		if (downloadOpen && downloadWrap && !downloadWrap.contains(e.target as Node)) closeDownload(false);
	}
	function onWrapFocusOut(e: FocusEvent) {
		if (downloadOpen && downloadWrap && !downloadWrap.contains(e.relatedTarget as Node | null)) downloadOpen = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointer} />

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
	<!-- Three states (never "empty = no allergies"): listed (red), confirmed none, not recorded (amber). -->
	<div class="allergy" data-kind={allergies.kind}>
		{#if allergies.kind === 'listed'}
			<span aria-hidden="true">⚠</span> Allergies: {allergies.allergies.map((a) => a.title).join(', ')}
		{:else if allergies.kind === 'none'}
			No known allergies
		{:else}
			<span aria-hidden="true">!</span> Allergies not recorded
		{/if}
	</div>
	<div class="meta">
		{encounter.visitType} ·
		{#if onstaff}
			<button type="button" class="staff" onclick={onstaff} title="Change the provider or technician">
				{encounter.provider}{#if encounter.technician}<span class="tech">{` · Tech: ${encounter.technician}`}</span>{/if}
			</button>
		{:else}
			{encounter.provider}{#if encounter.technician}<span class="tech">{` · Tech: ${encounter.technician}`}</span>{/if}
		{/if}
		· <span class="num">{encounter.date}</span>
	</div>
	<div class="spacer"></div>
	{#if lock?.mode === 'signed' && lock.signature}
		<div class="state signed" title="Signed exams are read-only for everyone; corrections go in an addendum.">
			<span aria-hidden="true">✓</span> Signed by {lock.signature.signedBy} on {day(lock.signature.signedAt)}
		</div>
	{:else if lock?.mode === 'readonly'}
		<div class="state readonly">
			{#if lock.holder}
				<span aria-hidden="true">🔒</span> Being edited by {lock.holder.holderName} since {time(new Date(lock.holder.acquiredAt))}
				{#if ontakeover}<button type="button" onclick={ontakeover} disabled={lock.busy}>Take over</button>{/if}
			{:else}
				Read-only
				{#if onedit}<button type="button" onclick={onedit} disabled={lock.busy}>Edit exam</button>{/if}
			{/if}
		</div>
	{/if}
	<div class="save" role="status" aria-live="polite" data-status={saver.status}>
		{#if saver.status === 'locked'}
			{#if saver.lostFields.length}Not saved: read-only{/if}
		{:else if saver.signedOut}
			Signed out
		{:else if saver.status === 'error'}
			Not saved, retrying…
		{:else if saver.showSaving}
			Saving…
		{:else if saver.savedAt}
			Saved {time(saver.savedAt)}
		{/if}
	</div>
	{#if cansign && onsign && lock && (lock.mode === 'editing' || lock.mode === 'starting')}
		<button type="button" class="sign" onclick={onsign} disabled={signing} title="Finalize this exam (it becomes read-only)">
			{signing ? 'Saving…' : 'Sign exam'}
		</button>
	{/if}
	<button type="button" class="print" onclick={onprint} title="Print this exam (Ctrl+P)">Print</button>
	{#if ondownloadpdf || ondownloadfhir}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="download" bind:this={downloadWrap} onkeydown={onDownloadKey} onfocusout={onWrapFocusOut}>
			<button
				type="button"
				bind:this={downloadButton}
				aria-expanded={downloadOpen}
				aria-controls="download-menu"
				title="Download this visit to add it to another chart"
				onclick={() => (downloadOpen = !downloadOpen)}
			>
				Download <span aria-hidden="true">▾</span>
			</button>
			{#if downloadOpen}
				<ul id="download-menu" class="menu" aria-label="Download this visit">
					{#if ondownloadpdf}
						<li>
							<button type="button" onclick={() => pick(ondownloadpdf)} aria-describedby="download-pdf-hint">
								<span class="item">PDF</span>
								<span class="hint" id="download-pdf-hint">Opens the report: choose Save as PDF in the print dialog</span>
							</button>
						</li>
					{/if}
					{#if ondownloadfhir}
						<li>
							<button type="button" onclick={() => pick(ondownloadfhir)} aria-describedby="download-fhir-hint">
								<span class="item">FHIR (for another EHR)</span>
								<span class="hint" id="download-fhir-hint">FHIR R4 JSON file with the findings and impression/plan</span>
							</button>
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	{/if}
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
	/* Provider / technician: reads as text, underlined on hover and focus to show it can be changed. */
	.staff {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
		min-height: var(--target-min);
		cursor: pointer;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.staff:hover {
		color: var(--text-1);
		text-decoration-style: solid;
	}
	.allergy {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.allergy[data-kind='none'] {
		color: var(--text-2);
		font-weight: var(--weight-regular);
	}
	.allergy[data-kind='unknown'] {
		color: var(--warn);
	}
	.spacer {
		flex: 1;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: var(--weight-semibold);
	}
	.state.readonly {
		color: var(--warn);
	}
	.state.signed {
		color: var(--ok);
	}
	.sign {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.save {
		color: var(--ok);
		min-width: 7em;
		text-align: right;
	}
	.save[data-status='error'],
	.save[data-status='locked'] {
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	.close {
		min-height: var(--target-min);
		display: inline-flex;
		align-items: center;
	}
	.download {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 30;
		list-style: none;
		margin: 0;
		padding: var(--space-1);
		min-width: 17rem;
		max-width: min(22rem, calc(100vw - 2 * var(--space-4)));
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
		display: grid;
		gap: 2px;
	}
	.menu button {
		display: grid;
		gap: 2px;
		width: 100%;
		min-height: max(var(--target-min), 44px);
		text-align: left;
		border: 0;
		background: none;
		padding: var(--space-2);
	}
	.menu button:hover,
	.menu button:focus-visible {
		background: var(--accent-soft);
	}
	.menu .item {
		font-weight: var(--weight-semibold);
	}
	.menu .hint {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	@media print {
		.download {
			display: none;
		}
	}
</style>
