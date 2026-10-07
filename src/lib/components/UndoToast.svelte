<script lang="ts">
	// The exam's message strip: undo after a bulk change, history notes, and errors (spec §1.5).
	// Accessibility (WCAG 2.2.1, 2.4.11, 4.1.3):
	//   - the undo countdown pauses while the message is hovered or focused and while the window is
	//     hidden; its length is the per-user pref "Keep undo messages visible for" (10 s, 30 s, until
	//     dismissed), read from My settings;
	//   - announced politely through a live region that is always in the page (inserted live regions
	//     are often not read);
	//   - never covers the focused control: it moves to the end edge, then to the top, when focus is
	//     under it;
	//   - keys (handled by the exam page): Ctrl+Z outside text fields and Alt+U from anywhere undo;
	//     Alt+Shift+U moves focus to the message (focus()); Escape there dismisses it and goes back.
	import { onMount, tick } from 'svelte';
	import { loadPrefs } from '#lib/prefs/client.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { tip } from './ui/tooltip.ts';
	import { PausableTimer, pickPlacement, undoMs, type Rect } from './ui/toast.ts';

	let {
		undo,
		note = null,
		notice = null,
		onundo,
		ondismiss
	}: {
		/** The bulk change that can be undone; a new object restarts the countdown. */
		undo: { label: string } | null;
		/** A short note (e.g. history entries added); shown with the undo or on its own. */
		note?: string | null;
		/** An error: shown instead of the others, announced at once (role="alert"). */
		notice?: string | null;
		onundo: () => void;
		/** The countdown ended or the user dismissed the message. */
		ondismiss: () => void;
	} = $props();

	const { t } = useI18n();
	let ms = $state<number | null>(10_000);
	let box = $state<HTMLDivElement | null>(null);
	let undoButton = $state<HTMLButtonElement | null>(null);
	type Place = 'bottom' | 'bottom-end' | 'top-end';
	let place = $state<Place>('bottom');
	/** Where focus was before it moved into the message (Alt+Shift+U or Tab), to go back to. */
	let returnTo: HTMLElement | null = null;
	let timer: PausableTimer | null = null;
	let hovered = false;
	let focused = false;

	onMount(() => {
		loadPrefs()
			.then((p) => (ms = undoMs(p['undo.duration'])))
			.catch(() => {});
		const vis = () => (document.visibilityState === 'hidden' ? timer?.pause('hidden') : timer?.resume('hidden'));
		// At once (focus must never land under the message, even for a frame) and again after any scrolling.
		const reposition = () => {
			placeIt();
			requestAnimationFrame(placeIt);
		};
		document.addEventListener('visibilitychange', vis);
		document.addEventListener('focusin', reposition);
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		return () => {
			timer?.cancel();
			document.removeEventListener('visibilitychange', vis);
			document.removeEventListener('focusin', reposition);
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
		};
	});

	// A new undo entry (or a changed pref) starts a fresh countdown, already paused if the message is in use.
	$effect(() => {
		const entry = undo;
		const length = ms;
		timer?.cancel();
		timer = null;
		if (!entry) return;
		const tm = new PausableTimer(length, () => {
			if (undo === entry) ondismiss();
		});
		if (hovered) tm.pause('hover');
		if (focused) tm.pause('focus');
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') tm.pause('hidden');
		timer = tm;
		void tick().then(placeIt);
	});

	/** Picks the first spot that leaves the focused control visible. */
	function placeIt() {
		if (!box) return;
		const active = document.activeElement;
		const target = active && active !== document.body && !box.contains(active) ? active.getBoundingClientRect() : null;
		const candidates: { place: Place; rect: Rect }[] = [];
		const keep = place;
		for (const p of ['bottom', 'bottom-end', 'top-end'] as const) {
			box.dataset.place = p;
			candidates.push({ place: p, rect: box.getBoundingClientRect() });
		}
		box.dataset.place = keep;
		place = pickPlacement(candidates, target);
	}

	function onfocusin(e: FocusEvent) {
		const from = e.relatedTarget as HTMLElement | null;
		if (from && box && !box.contains(from)) returnTo = from;
		focused = true;
		timer?.pause('focus');
	}
	function onfocusout(e: FocusEvent) {
		if (box && box.contains(e.relatedTarget as Node | null)) return;
		focused = false;
		timer?.resume('focus');
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			dismiss();
		}
	}
	/** Focus that was inside the message goes back where it came from before the message closes. */
	function restoreFocus() {
		if (!box?.contains(document.activeElement)) return;
		const back = returnTo?.isConnected && !returnTo.closest('[inert]') ? returnTo : document.querySelector<HTMLElement>('main');
		back?.focus();
	}
	function dismiss() {
		restoreFocus();
		ondismiss();
	}
	function doUndo() {
		restoreFocus();
		onundo();
	}

	/** Alt+Shift+U: focus the Undo button (or the message itself). Returns false when nothing is shown. */
	export function focus(): boolean {
		if (undoButton) {
			undoButton.focus();
			return true;
		}
		if (box) {
			box.focus();
			return true;
		}
		return false;
	}

	const announce = $derived(
		undo ? `${undo.label}${note ? ` · ${note}` : ''}. ${t('exam.undoAnnounce')}` : (note ?? '')
	);
</script>

<!-- Always in the page so screen readers announce changes (an inserted live region is often missed). -->
<div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{notice ? '' : announce}</div>

{#if notice}
	<div class="toast error" role="alert" data-place={place} bind:this={box}>{notice}</div>
{:else if undo || note}
	<!-- Pointer and focus events only pause the countdown; Escape dismisses (the buttons do the rest). -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="toast"
		data-place={place}
		bind:this={box}
		tabindex="-1"
		role="group"
		aria-label={t('exam.undoRegion')}
		onpointerenter={() => {
			hovered = true;
			timer?.pause('hover');
		}}
		onpointerleave={() => {
			hovered = false;
			timer?.resume('hover');
		}}
		{onfocusin}
		{onfocusout}
		{onkeydown}
	>
		<span class="text"><bdi>{undo ? undo.label : note}</bdi>{#if undo && note}<span> · {note}</span>{/if}</span>
		{#if undo}
			<button
				type="button"
				bind:this={undoButton}
				onclick={doUndo}
				aria-keyshortcuts="Control+Z Alt+U"
				use:tip={{ text: t('exam.undoTip'), placement: 'top' }}
				><Msg key="exam.undoButton">{#snippet keys()}<kbd>Ctrl Z</kbd>{/snippet}</Msg></button
			>
			<button type="button" class="dismiss" onclick={dismiss} aria-label={t('exam.undoDismiss')} use:tip={{ text: t('exam.undoDismiss'), describe: false }}
				><span aria-hidden="true">×</span></button
			>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: min(40rem, calc(100vw - 2 * var(--space-4)));
		padding-block: var(--space-2);
		padding-inline: var(--space-4) var(--space-2);
		background: var(--surface-3);
		color: var(--text-1);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
		animation: toast-in var(--dur-panel-in) var(--ease-enter);
	}
	/* Default: bottom centre, above the shorthand bar. */
	.toast[data-place='bottom'] {
		left: 50%;
		bottom: calc(var(--target-min) + var(--space-6));
		transform: translateX(-50%);
	}
	/* Focus would be hidden under it: the end edge, then the top end. */
	.toast[data-place='bottom-end'] {
		inset-inline-end: var(--space-4);
		bottom: calc(var(--target-min) + var(--space-6));
	}
	.toast[data-place='top-end'] {
		inset-inline-end: var(--space-4);
		top: var(--space-4);
	}
	.text {
		min-width: 0;
	}
	.dismiss {
		min-width: max(28px, var(--target-min));
		min-height: max(28px, var(--target-min));
		padding: 0;
		border-color: transparent;
		background: transparent;
		font-size: var(--text-md);
		line-height: 1;
	}
	.toast.error {
		color: var(--danger);
		padding-inline-end: var(--space-4);
	}
	@keyframes toast-in {
		from {
			opacity: 0;
		}
	}
	@media print {
		.toast {
			display: none;
		}
	}
</style>
