<script lang="ts">
	import type { EncounterInfo, PatientHeader } from '#lib/exam/types.ts';
	import type { Saver } from '#lib/exam/saver.svelte.ts';
	import type { ExamLock } from '#lib/exam/lock.svelte.ts';
	import ThemeToggle from './ThemeToggle.svelte';
	import { historyBus } from '#lib/history/bus.svelte.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { keepInView } from './ui/place.ts';
	import { tip } from './ui/tooltip.ts';
	import { menu, menuButtonKeydown, type MenuFocus } from './ui/menu.ts';

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
	// Dates and times in the page language (D48), never the computer's own locale.
	const i18n = useI18n();
	const { t } = i18n;
	const time = (d: Date) => i18n.time(d);
	const day = (iso: string) => i18n.date(iso);

	// ---------- Download menu (D46: the visit goes into another chart as a PDF or FHIR) ----------
	// A menu button (APG, ui/menu.ts): Enter/Space/ArrowDown open it on the first item, ArrowUp on
	// the last; arrows, Home/End and letters move; Escape closes and returns focus to the button;
	// Tab or a click outside closes it.
	let downloadOpen = $state(false);
	let downloadFocus = $state<MenuFocus>('first');
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
	function openDownload(focus: MenuFocus) {
		downloadFocus = focus;
		downloadOpen = true;
	}
	function onWindowPointer(e: PointerEvent) {
		if (downloadOpen && downloadWrap && !downloadWrap.contains(e.target as Node)) closeDownload(false);
	}
	function onWrapFocusOut(e: FocusEvent) {
		if (downloadOpen && downloadWrap && !downloadWrap.contains(e.relatedTarget as Node | null)) downloadOpen = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointer} />

<header class="banner" aria-label={t('exam.bannerLabel')}>
	{#if patient.photoUrl}
		<img class="avatar" src={patient.photoUrl} alt="" />
	{:else}
		<div class="avatar" aria-hidden="true">{initials}</div>
	{/if}
	<div class="who">
		<!-- The page's one <h1>: the patient, plus the visit for screen readers (the visit type and
		     date stay where they are on screen and are hidden there, so nothing is read twice). -->
		<h1 class="name">
			<a class="chart" href="/patients/{patient.id}" use:tip={{ text: t('exam.bannerOpenChart'), placement: 'bottom' }}>{patient.name}</a>
			{#if patient.name !== patient.legalName}<span class="legal">{t('exam.bannerLegalName', { name: patient.legalName })}</span>{/if}
			<span class="visually-hidden">{t('exam.bannerHeadingVisit', { type: encounter.visitType, date: encounter.date })}</span>
		</h1>
		<div class="meta num">{t('exam.bannerAge', { age: patient.age })} · {t('exam.bannerDob', { dob: patient.dob })} · {t('exam.bannerMrn', { mrn: patient.mrn })}</div>
	</div>
	<!-- Three states (never "empty = no allergies"): listed (red), confirmed none, not recorded (amber). -->
	<div
		class="allergy"
		data-kind={allergies.kind}
		use:tip={{
			text: allergies.kind === 'listed' ? t('tips.allergyListed') : allergies.kind === 'none' ? t('tips.allergyNone') : t('tips.allergyNotRecorded'),
			placement: 'bottom'
		}}
	>
		{#if allergies.kind === 'listed'}
			<span aria-hidden="true">⚠</span> {t('exam.bannerAllergies', { list: allergies.allergies.map((a) => a.title).join(', ') })}
		{:else if allergies.kind === 'none'}
			{t('exam.bannerNoAllergies')}
		{:else}
			<span aria-hidden="true">!</span> {t('exam.bannerAllergiesNotRecorded')}
		{/if}
	</div>
	<div class="meta">
		<span aria-hidden="true">{encounter.visitType} ·</span>
		{#if onstaff}
			<button type="button" class="staff" onclick={onstaff} use:tip={{ text: t('exam.bannerChangeStaff'), placement: 'bottom' }}>
				{encounter.provider}{#if encounter.technician}<span class="tech">{` · ${t('exam.bannerTech', { name: encounter.technician })}`}</span>{/if}
			</button>
		{:else}
			{encounter.provider}{#if encounter.technician}<span class="tech">{` · ${t('exam.bannerTech', { name: encounter.technician })}`}</span>{/if}
		{/if}
		<span aria-hidden="true">· <span class="num">{encounter.date}</span></span>
	</div>
	<div class="spacer"></div>
	{#if lock?.mode === 'signed' && lock.signature}
		<div class="state signed" use:tip={{ text: t('exam.bannerSignedTitle'), placement: 'bottom' }}>
			<span aria-hidden="true">✓</span> {t('exam.bannerSignedBy', { name: lock.signature.signedBy, date: day(lock.signature.signedAt) })}
		</div>
	{:else if lock?.mode === 'readonly'}
		<div class="state readonly">
			{#if lock.holder}
				<span aria-hidden="true">🔒</span> {t('exam.bannerBeingEdited', { name: lock.holder.holderName, time: time(new Date(lock.holder.acquiredAt)) })}
				{#if ontakeover}<button type="button" onclick={ontakeover} disabled={lock.busy}>{t('exam.bannerTakeOver')}</button>{/if}
			{:else}
				{t('exam.bannerReadOnly')}
				{#if onedit}<button type="button" onclick={onedit} disabled={lock.busy}>{t('exam.bannerEditExam')}</button>{/if}
			{/if}
		</div>
	{/if}
	<div class="save" role="status" aria-live="polite" data-status={saver.status}>
		{#if saver.status === 'locked'}
			{#if saver.lostFields.length}{t('exam.saveNotSavedReadOnly')}{/if}
		{:else if saver.signedOut}
			{t('exam.saveSignedOut')}
		{:else if saver.status === 'error'}
			{t('exam.saveRetrying')}
		{:else if saver.showSaving}
			{t('common.saving')}
		{:else if saver.savedAt}
			{t('exam.saveSavedAt', { time: time(saver.savedAt) })}
		{/if}
	</div>
	{#if cansign && onsign && lock && (lock.mode === 'editing' || lock.mode === 'starting')}
		<!-- While saving: aria-disabled (not disabled) so focus stays here and the tip can say why. -->
		<button
			type="button"
			class="sign"
			onclick={() => !signing && onsign()}
			aria-disabled={signing ? 'true' : undefined}
			use:tip={{ text: signing ? t('tips.signSaving') : t('exam.bannerSignTitle'), placement: 'bottom' }}
		>
			{signing ? t('common.saving') : t('exam.bannerSign')}
		</button>
	{/if}
	<button type="button" class="print" onclick={onprint} use:tip={{ text: t('exam.bannerPrintTitle'), placement: 'bottom' }}>{t('exam.bannerPrint')}</button>
	{#if ondownloadpdf || ondownloadfhir}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="download" bind:this={downloadWrap} onfocusout={onWrapFocusOut}>
			<button
				type="button"
				bind:this={downloadButton}
				aria-haspopup="menu"
				aria-expanded={downloadOpen}
				aria-controls="download-menu"
				use:tip={{ text: t('exam.bannerDownloadTitle'), placement: 'bottom' }}
				onclick={() => (downloadOpen ? closeDownload(false) : openDownload('first'))}
				onkeydown={(e) => menuButtonKeydown(e, openDownload)}
			>
				{t('exam.bannerDownload')} <span aria-hidden="true">▾</span>
			</button>
			{#if downloadOpen}
				<!-- Fixed-positioned next to the button and kept fully on screen (portrait tablets, phones, RTL). -->
				<ul
					id="download-menu"
					class="menu"
					role="menu"
					use:keepInView={{ anchor: downloadButton, placement: 'bottom-end' }}
					use:menu={{ onclose: closeDownload, focus: downloadFocus }}
					aria-label={t('exam.bannerDownloadMenu')}
				>
					{#if ondownloadpdf}
						<li role="none">
							<button type="button" role="menuitem" data-label="PDF" onclick={() => pick(ondownloadpdf)} aria-describedby="download-pdf-hint">
								<span class="item">PDF</span>
								<span class="hint" id="download-pdf-hint" aria-hidden="true">{t('exam.bannerDownloadPdfHint')}</span>
							</button>
						</li>
					{/if}
					{#if ondownloadfhir}
						<li role="none">
							<button type="button" role="menuitem" data-label={t('exam.bannerDownloadFhir')} onclick={() => pick(ondownloadfhir)} aria-describedby="download-fhir-hint">
								<span class="item">{t('exam.bannerDownloadFhir')}</span>
								<span class="hint" id="download-fhir-hint" aria-hidden="true">{t('exam.bannerDownloadFhirHint')}</span>
							</button>
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	{/if}
	<ThemeToggle />
	<a class="close" href="/">{t('exam.bannerPatients')}</a>
	<!-- The exam has no top bar, so signing out is offered here too (a POST, like the top bar's). -->
	<form class="signout" method="POST" action="/logout">
		<button type="submit">{t('shell.signOut')}</button>
	</form>
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
		margin: 0;
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
		text-align: end;
	}
	.save[data-status='error'],
	.save[data-status='locked'] {
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	.signout {
		margin: 0;
	}
	.signout button {
		min-height: var(--target-min);
	}
	.close {
		min-height: var(--target-min);
		display: inline-flex;
		align-items: center;
	}
	.download {
		position: relative;
	}
	/* Placed by keepInView (position: fixed, top/left, max-height + scroll when it cannot fit). */
	.menu {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 30;
		list-style: none;
		margin: 0;
		padding: var(--space-1);
		min-width: min(17rem, calc(100vw - 16px));
		width: max-content;
		max-width: min(22rem, calc(100vw - 16px));
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
		text-align: start;
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
		.download,
		.signout {
			display: none;
		}
	}
</style>
