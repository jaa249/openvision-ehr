<script lang="ts">
	// First-run tips tour: five short steps on the first exam a user opens (shorthand bar, section
	// keys, quick picks, Normal / copy, Sign). Skippable at any step; keyboard operable (Next / Back /
	// Skip, Escape skips); focus moves into the step card and returns where it was afterwards. Steps whose
	// control is not on screen (no quick picks for this section, no Sign for a technician) are left out.
	// Seen = the per-user pref "tourSeen", saved as soon as the tour first shows, so it appears once per user
	// even if they leave mid-way; My settings can reset it ("Show the tour again"). Never starts under
	// automation (navigator.webdriver), with ?notour, or localStorage openvision.noTour = "1" (tourAllowed).
	import { onMount, tick } from 'svelte';
	import { loadPrefs, savePref } from '#lib/prefs/client.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import { tipPosition } from './ui/tooltip.ts';
	import { tourAllowed, tourSteps, type TourStep } from './tour.ts';

	let { disabled = false }: { /** Read-only / signed exams never start the tour. */ disabled?: boolean } = $props();
	const { t } = useI18n();

	const TEXT: Record<TourStep['id'], { title: MessageKey; body: MessageKey }> = {
		shorthand: { title: 'tips.tourShorthandTitle', body: 'tips.tourShorthand' },
		keys: { title: 'tips.tourKeysTitle', body: 'tips.tourKeys' },
		qp: { title: 'tips.tourQpTitle', body: 'tips.tourQp' },
		normal: { title: 'tips.tourNormalTitle', body: 'tips.tourNormal' },
		sign: { title: 'tips.tourSignTitle', body: 'tips.tourSign' }
	};

	let steps = $state<{ step: TourStep; el: HTMLElement }[]>([]);
	let index = $state(-1);
	let card = $state<HTMLElement | null>(null);
	let pos = $state({ top: 0, left: 0 });
	let returnTo: HTMLElement | null = null;
	const open = $derived(index >= 0 && index < steps.length);
	const current = $derived(open ? steps[index] : null);

	onMount(() => {
		let cancelled = false;
		// Let the page settle (prefs, panels) before looking for the controls.
		const timer = setTimeout(async () => {
			if (disabled || !tourAllowed({ webdriver: navigator.webdriver, search: location.search, noTour: readNoTour() })) return;
			const prefs = await loadPrefs();
			if (cancelled || prefs.tourSeen) return;
			steps = tourSteps()
				.map((step) => ({ step, el: document.querySelector<HTMLElement>(step.selector) }))
				.filter((s): s is { step: TourStep; el: HTMLElement } => !!s.el && s.el.getClientRects().length > 0);
			if (!steps.length) return;
			returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			void savePref('tourSeen', true);
			await go(0);
		}, 800);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			mark(null);
		};
	});

	function readNoTour(): string | null {
		try {
			return localStorage.getItem('openvision.noTour');
		} catch {
			return null;
		}
	}

	function mark(el: HTMLElement | null) {
		document.querySelectorAll('[data-tour-target]').forEach((e) => e.removeAttribute('data-tour-target'));
		el?.setAttribute('data-tour-target', '');
	}

	async function go(i: number) {
		index = i;
		const s = steps[i];
		if (!s) return;
		s.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		mark(s.el);
		await tick();
		place();
		card?.querySelector<HTMLElement>('[data-tour-primary]')?.focus();
	}

	function place() {
		if (!card || !current) return;
		const a = current.el.getBoundingClientRect();
		const r = card.getBoundingClientRect();
		const vv = window.visualViewport;
		const vp = vv ? { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height } : { top: 0, left: 0, width: innerWidth, height: innerHeight };
		const rtl = getComputedStyle(current.el).direction === 'rtl';
		const p = tipPosition({ top: a.top, left: a.left, width: a.width, height: a.height }, { width: r.width, height: r.height }, vp, current.step.placement, rtl, 10);
		pos = { top: p.top, left: p.left };
	}

	function finish() {
		index = -1;
		mark(null);
		const back = returnTo?.isConnected ? returnTo : document.getElementById('exam');
		back?.focus();
	}

	// Escape closes the tour wherever focus is (unless something else, e.g. a tooltip or dialog, took it).
	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && !e.defaultPrevented) {
			e.preventDefault();
			e.stopPropagation();
			finish();
		}
	}
</script>

<svelte:window onresize={place} onscrollcapture={place} {onkeydown} />

{#if open && current}
	<!-- Non-modal: the page stays usable; the card names itself and is the first thing focus lands on. -->
	<div
		class="tour"
		role="dialog"
		aria-modal="false"
		aria-labelledby="tour-title"
		aria-describedby="tour-body"
		tabindex="-1"
		bind:this={card}
		style:top="{pos.top}px"
		style:left="{pos.left}px"
	>
		<p class="step">{t('tips.tourTitle')} · {t('tips.tourStep', { n: index + 1, count: steps.length })}</p>
		<h2 id="tour-title">{t(TEXT[current.step.id].title)}</h2>
		<p id="tour-body">{t(TEXT[current.step.id].body)}</p>
		<div class="actions">
			<button type="button" class="skip" onclick={finish}>{t('tips.tourSkip')}</button>
			<span class="nav">
				{#if index > 0}<button type="button" onclick={() => go(index - 1)}>{t('tips.tourBack')}</button>{/if}
				{#if index < steps.length - 1}
					<button type="button" class="primary" data-tour-primary onclick={() => go(index + 1)}>{t('tips.tourNext')}</button>
				{:else}
					<button type="button" class="primary" data-tour-primary onclick={finish}>{t('tips.tourDone')}</button>
				{/if}
			</span>
		</div>
	</div>
{/if}

<style>
	.tour {
		position: fixed;
		z-index: 900;
		width: min(22rem, calc(100vw - 16px));
		padding: var(--space-3) var(--space-4);
		background: var(--surface-3);
		color: var(--text-1);
		border: 1px solid var(--accent);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
	}
	.step {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	h2 {
		margin: var(--space-1) 0;
		font-size: var(--text-md);
	}
	#tour-body {
		margin: 0 0 var(--space-3);
	}
	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.nav {
		display: inline-flex;
		gap: var(--space-2);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	:global([data-tour-target]) {
		outline: 3px solid var(--accent) !important;
		outline-offset: 3px;
	}
	@media (forced-colors: active) {
		:global([data-tour-target]) {
			outline-color: Highlight !important;
		}
	}
</style>
