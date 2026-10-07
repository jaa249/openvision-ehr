// Tooltips: one small, dependency-free Svelte action for the whole app.
//   <button use:tip={t('exam.clear')}>…</button>
//   <button use:tip={{ text, placement: 'bottom', describe: false }}>…</button>
// Behaviour (WCAG 1.4.13 content on hover or focus):
//   - mouse hover: shows after HOVER_DELAY_MS (instantly while another tip was just open, "warm");
//     the pointer may move onto the tip without it closing (hoverable);
//   - keyboard focus (:focus-visible only, not a mouse click): shows at once;
//   - touch / pen long-press (LONG_PRESS_MS): shows and swallows the click that follows, so a
//     long-press explains a button without pressing it; the next tap anywhere closes it;
//   - Escape closes it without moving focus (and without closing a surrounding dialog);
//   - one tip at a time; positioned on screen by the same rules as menus (place.ts), RTL aware;
//   - inside a native <dialog> the tip goes into the top layer (popover) so the modal never hides it;
//   - the text is also the control's accessible description (aria-describedby on a hidden node),
//     unless it would only repeat the accessible name;
//   - the per-user `tooltips` pref (My settings) turns hover and focus popups off; long-press and
//     the accessible description stay, so nothing is lost;
//   - reduced motion: no fade (tooltip.css).
// The pure parts (delays, describe rule, geometry, long-press slop) are exported and unit-tested.
import { computePlacement, type Box } from './place.ts';
import './tooltip.css';

export type TipPlacement = 'top' | 'bottom' | 'start' | 'end';
export interface TipOptions {
	text: string;
	/** Preferred side; default 'top'. start/end follow the text direction. */
	placement?: TipPlacement;
	/** Also set the text as the accessible description. Default: yes, unless it equals the accessible name. */
	describe?: boolean;
	/**
	 * For a non-focusable child such as <abbr> inside a button (or inside a radio's <label>): also show
	 * the tip when that control gets keyboard focus, and describe it (unless it has its own tip).
	 */
	host?: boolean;
	/** Long-press shows the tip (default). false where a long-press already does something (motility cells). */
	press?: boolean;
}
/** A string, an options object, or nothing (no tip; handy for conditional tips). */
export type TipParam = string | TipOptions | null | undefined | false;

export const HOVER_DELAY_MS = 400;
export const LONG_PRESS_MS = 500;
/** After a tip closes, another hover within this window shows at once (moving along a toolbar). */
export const WARM_MS = 600;
/** Time the pointer has to travel from the control onto the tip. */
export const HIDE_GRACE_MS = 120;
/** A finger that moves farther than this is scrolling, not long-pressing. */
export const PRESS_SLOP_PX = 10;

export type TipSource = 'hover' | 'focus' | 'press';

export interface NormalTip {
	text: string;
	placement: TipPlacement;
	describe?: boolean;
	host: boolean;
	press: boolean;
}

/** Normalises the action's parameter; null = no tip. */
export function normaliseTip(param: TipParam): NormalTip | null {
	if (!param) return null;
	const o = typeof param === 'string' ? { text: param } : param;
	const text = (o.text ?? '').trim();
	if (!text) return null;
	return { text, placement: o.placement ?? 'top', describe: o.describe, host: !!o.host, press: o.press !== false };
}

/**
 * How long to wait before showing a tip, or null when it must not show.
 * `enabled` is the user's tooltips pref; it only governs hover and focus (long-press always works).
 */
export function showDelay(source: TipSource, enabled: boolean, now: number, lastHiddenAt: number): number | null {
	if (source === 'press') return 0;
	if (!enabled) return null;
	if (source === 'focus') return 0;
	return now - lastHiddenAt < WARM_MS ? 0 : HOVER_DELAY_MS;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Describe unless told otherwise, or when the tip only repeats the accessible name. */
export function shouldDescribe(text: string, accessibleName: string, explicit?: boolean): boolean {
	if (explicit !== undefined) return explicit;
	return squash(text) !== squash(accessibleName);
}

/** True when a press has moved far enough to be a scroll or drag. */
export function movedTooFar(dx: number, dy: number): boolean {
	return Math.hypot(dx, dy) > PRESS_SLOP_PX;
}

/**
 * Where the tip goes: on the preferred side, flipped to the opposite side when it does not fit,
 * centred on the control and kept `margin` inside the viewport. start/end are left/right in LTR
 * and swapped in RTL; when neither side has room they fall back to above/below.
 */
export function tipPosition(
	anchor: Box,
	size: { width: number; height: number },
	viewport: Box,
	placement: TipPlacement = 'top',
	rtl = false,
	gap = 6,
	margin = 8
): { top: number; left: number; side: 'top' | 'bottom' | 'left' | 'right' } {
	const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
	if (placement === 'start' || placement === 'end') {
		const wantLeft = (placement === 'start') !== rtl;
		const roomLeft = anchor.left - gap - viewport.left - margin;
		const roomRight = viewport.left + viewport.width - margin - (anchor.left + anchor.width + gap);
		const fitsLeft = size.width <= roomLeft;
		const fitsRight = size.width <= roomRight;
		const side = wantLeft ? (fitsLeft ? 'left' : fitsRight ? 'right' : null) : fitsRight ? 'right' : fitsLeft ? 'left' : null;
		if (side) {
			const left = side === 'left' ? anchor.left - gap - size.width : anchor.left + anchor.width + gap;
			const top = clamp(anchor.top + anchor.height / 2 - size.height / 2, viewport.top + margin, viewport.top + viewport.height - margin - size.height);
			return { top, left, side };
		}
		placement = 'top';
	}
	const v = computePlacement(anchor, size, viewport, { placement: `${placement}-start`, margin, gap });
	const left = clamp(anchor.left + anchor.width / 2 - size.width / 2, viewport.left + margin, viewport.left + viewport.width - margin - size.width);
	return { top: v.top, left, side: v.side };
}

// ---------------------------------------------------------------- the user's pref

let enabled = true;
let prefsAsked = false;

/** My settings calls this when the "Show tooltips" switch changes (the pref itself is saved there). */
export function setTooltipsEnabled(on: boolean): void {
	enabled = on;
	prefsAsked = true;
	if (!on && active && activeSource !== 'press') hideActive();
}

/** Reads the pref once per page load, on the first tooltip interaction (not on pages that never use one). */
function askPrefs(): void {
	if (prefsAsked || typeof window === 'undefined') return;
	prefsAsked = true;
	import('#lib/prefs/client.ts')
		.then(({ loadPrefs }) => loadPrefs())
		.then((p) => setTooltipsEnabled(p.tooltips))
		.catch(() => {
			/* keep the default (on) */
		});
}

// ---------------------------------------------------------------- the one bubble

let bubble: HTMLDivElement | null = null;
let active: Controller | null = null;
let activeSource: TipSource | null = null;
let lastHiddenAt = -Infinity;
let frame = 0;
let seq = 0;

interface Controller {
	anchor: TipTarget;
	text: () => string;
	placement: () => TipPlacement;
}

function supportsPopover(el: HTMLElement): boolean {
	return typeof (el as HTMLElement & { showPopover?: unknown }).showPopover === 'function';
}

function getBubble(): HTMLDivElement {
	if (bubble) return bubble;
	const b = document.createElement('div');
	b.className = 'ov-tip';
	// The text reaches assistive technology through aria-describedby; the bubble itself is visual only.
	b.setAttribute('aria-hidden', 'true');
	if (supportsPopover(b)) b.setAttribute('popover', 'manual');
	b.addEventListener('pointerenter', () => cancelHide());
	b.addEventListener('pointerleave', (e) => {
		if (e.pointerType === 'mouse') scheduleHide();
	});
	bubble = b;
	return b;
}

let hideTimer: ReturnType<typeof setTimeout> | undefined;
function cancelHide() {
	clearTimeout(hideTimer);
	hideTimer = undefined;
}
function scheduleHide() {
	cancelHide();
	hideTimer = setTimeout(hideActive, HIDE_GRACE_MS);
}

function viewportBox(): Box {
	const vv = window.visualViewport;
	if (vv) return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
	return { top: 0, left: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}

function position() {
	frame = 0;
	if (!active || !bubble || !bubble.isConnected) return;
	if (!active.anchor.isConnected) return hideActive();
	const b = bubble;
	const zoom = (b as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
	const a = active.anchor.getBoundingClientRect();
	const r = b.getBoundingClientRect();
	const rtl = getComputedStyle(active.anchor).direction === 'rtl';
	const p = tipPosition({ top: a.top, left: a.left, width: a.width, height: a.height }, { width: r.width, height: r.height }, viewportBox(), active.placement(), rtl);
	b.dataset.side = p.side;
	let top = p.top / zoom;
	let left = p.left / zoom;
	b.style.top = `${top}px`;
	b.style.left = `${left}px`;
	// A transformed ancestor (or the top layer vs. a zoomed page) shifts "fixed": measure and correct.
	const got = b.getBoundingClientRect();
	const dx = got.left - p.left;
	const dy = got.top - p.top;
	if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
		left -= dx / zoom;
		top -= dy / zoom;
		b.style.top = `${top}px`;
		b.style.left = `${left}px`;
	}
}
function schedulePosition() {
	if (!frame) frame = requestAnimationFrame(position);
}

function onDocKey(e: KeyboardEvent) {
	if (e.key !== 'Escape' || !active) return;
	// Escape closes the tip only; a surrounding dialog or menu stays open (press Escape again for it).
	e.preventDefault();
	e.stopPropagation();
	dismissed = active.anchor;
	hideActive();
}
function onDocPointerDown(e: PointerEvent) {
	if (active && activeSource === 'press' && !active.anchor.contains(e.target as Node)) hideActive();
}
/** The control whose tip was closed with Escape stays quiet until the pointer or focus leaves it. */
let dismissed: TipTarget | null = null;

function showFor(c: Controller, source: TipSource) {
	cancelHide();
	if (active && active !== c) hideActive(false);
	const b = getBubble();
	b.textContent = c.text();
	// Inside a dialog the tip lives in that dialog (top layer); elsewhere in <body>.
	const container = c.anchor.closest('dialog') ?? document.body;
	const wasOpen = active === c && b.isConnected;
	if (b.parentElement !== container) {
		if (b.isConnected && b.matches(':popover-open')) b.hidePopover();
		container.appendChild(b);
	}
	if (supportsPopover(b)) {
		try {
			// Re-show so it is above a dialog opened after it was first shown.
			if (b.matches(':popover-open')) b.hidePopover();
			b.showPopover();
		} catch {
			/* not connected / already shown: the fixed position below still applies */
		}
	}
	b.dataset.open = '';
	active = c;
	activeSource = source;
	if (!wasOpen) {
		document.addEventListener('keydown', onDocKey, true);
		document.addEventListener('pointerdown', onDocPointerDown, true);
		window.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
		window.addEventListener('resize', schedulePosition);
	}
	position();
}

function hideActive(remember = true) {
	cancelHide();
	if (frame) cancelAnimationFrame(frame);
	frame = 0;
	if (!active) return;
	active = null;
	activeSource = null;
	if (remember) lastHiddenAt = performance.now();
	document.removeEventListener('keydown', onDocKey, true);
	document.removeEventListener('pointerdown', onDocPointerDown, true);
	window.removeEventListener('scroll', schedulePosition, { capture: true });
	window.removeEventListener('resize', schedulePosition);
	if (bubble) {
		delete bubble.dataset.open;
		if (supportsPopover(bubble) && bubble.matches(':popover-open')) {
			try {
				bubble.hidePopover();
			} catch {
				/* already hidden */
			}
		}
	}
}

// ---------------------------------------------------------------- accessible description

function accessibleName(el: TipTarget): string {
	const label = el.getAttribute('aria-label');
	if (label) return label;
	const by = el.getAttribute('aria-labelledby');
	if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
		return [...(el.labels ?? [])].map((l) => l.textContent ?? '').join(' ');
	}
	return el.textContent ?? '';
}

/** Hidden nodes that hold the descriptions, one holder per root (body, or each dialog). */
function descriptionHolder(near: TipTarget): HTMLElement {
	const root = near.closest('dialog') ?? document.body;
	let holder = root.querySelector<HTMLElement>(':scope > .ov-tip-descs');
	if (!holder) {
		holder = document.createElement('div');
		holder.className = 'ov-tip-descs';
		holder.hidden = true;
		root.appendChild(holder);
	}
	return holder;
}

function addToken(el: TipTarget, attr: string, token: string) {
	const list = (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean);
	if (!list.includes(token)) el.setAttribute(attr, [...list, token].join(' '));
}
function removeToken(el: TipTarget, attr: string, token: string) {
	const list = (el.getAttribute(attr) ?? '').split(/\s+/).filter((x) => x && x !== token);
	if (list.length) el.setAttribute(attr, list.join(' '));
	else el.removeAttribute(attr);
}

/** HTML controls, and SVG marks / labels in charts. */
export type TipTarget = HTMLElement | SVGElement;

const FOCUSABLE_HOST = 'button, a[href], summary, [tabindex], [role="button"], [role="radio"], [role="tab"], [role="option"], [role="menuitem"]';

// ---------------------------------------------------------------- the action

export function tip(node: TipTarget, param: TipParam) {
	let opts = normaliseTip(param);
	const id = `ov-tip-${++seq}`;
	let desc: HTMLElement | null = null;
	let describedEl: TipTarget | null = null;
	let host: TipTarget | null = null;
	const c: Controller = { anchor: node, text: () => opts?.text ?? '', placement: () => opts?.placement ?? 'top' };

	// A native title would show a second, unstyled tooltip.
	if (node.hasAttribute('title')) node.removeAttribute('title');
	node.dataset.tip = '';

	function syncDescription() {
		if (describedEl) {
			removeToken(describedEl, 'aria-describedby', id);
			describedEl = null;
		}
		if (!opts) {
			desc?.remove();
			desc = null;
			return;
		}
		const target = host ?? node;
		if (!shouldDescribe(opts.text, accessibleName(target), opts.describe)) {
			desc?.remove();
			desc = null;
			return;
		}
		if (!desc) {
			desc = document.createElement('span');
			desc.id = id;
		}
		desc.textContent = opts.text;
		if (!desc.isConnected) descriptionHolder(target).appendChild(desc);
		addToken(target, 'aria-describedby', id);
		describedEl = target;
	}

	function findHost() {
		host = null;
		if (!opts?.host) return;
		// The nearest focusable ancestor, or the control of the <label> it sits in (a radio's text).
		const h = node.parentElement?.closest<HTMLElement>(FOCUSABLE_HOST) ?? node.closest('label')?.control ?? null;
		// A host with its own tip keeps it; the child's tip is then hover / long-press only.
		if (h && !h.hasAttribute('data-tip')) host = h;
	}

	let showTimer: ReturnType<typeof setTimeout> | undefined;
	function request(source: TipSource) {
		if (!opts) return;
		askPrefs();
		if (dismissed === node) return;
		const delay = showDelay(source, enabled, performance.now(), lastHiddenAt);
		clearTimeout(showTimer);
		if (delay === null) return;
		if (delay === 0) showFor(c, source);
		else showTimer = setTimeout(() => showFor(c, source), delay);
	}
	function release(immediate: boolean) {
		clearTimeout(showTimer);
		if (active !== c) return;
		if (immediate) hideActive();
		else scheduleHide();
	}

	// ---- mouse
	function onEnter(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		if (active === c) return cancelHide();
		request('hover');
	}
	function onLeave(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		if (dismissed === node) dismissed = null;
		// Keyboard focus keeps its tip when the mouse passes by.
		if (activeSource === 'focus' && active === c) return;
		release(false);
	}
	// ---- keyboard
	function onFocus(e: FocusEvent) {
		const el = e.currentTarget as Element;
		let visible = false;
		try {
			visible = el.matches(':focus-visible');
		} catch {
			visible = true;
		}
		if (visible) request('focus');
	}
	function onBlur() {
		if (dismissed === node) dismissed = null;
		if (activeSource !== 'press') release(true);
	}
	// ---- touch / pen
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressX = 0;
	let pressY = 0;
	let swallowClick = false;
	function onDown(e: PointerEvent) {
		if (!opts) return;
		if (e.pointerType === 'mouse') {
			// A click hides a hover tip (it is in the way of what the click opens).
			clearTimeout(showTimer);
			if (active === c && activeSource === 'hover') hideActive();
			return;
		}
		clearTimeout(pressTimer);
		if (!opts.press) return;
		pressX = e.clientX;
		pressY = e.clientY;
		pressTimer = setTimeout(() => {
			pressTimer = undefined;
			swallowClick = true;
			request('press');
		}, LONG_PRESS_MS);
	}
	function onMove(e: PointerEvent) {
		if (pressTimer && movedTooFar(e.clientX - pressX, e.clientY - pressY)) {
			clearTimeout(pressTimer);
			pressTimer = undefined;
		}
	}
	function onUp() {
		clearTimeout(pressTimer);
		pressTimer = undefined;
	}
	function onClick(e: MouseEvent) {
		if (!swallowClick) return;
		swallowClick = false;
		e.preventDefault();
		e.stopImmediatePropagation();
	}
	function onContextMenu(e: Event) {
		// The long-press already explained the control; no system menu on top of it.
		if (swallowClick || pressTimer) e.preventDefault();
	}

	function listen(el: TipTarget, on: boolean) {
		const m = on ? 'addEventListener' : 'removeEventListener';
		el[m]('focus', onFocus as EventListener);
		el[m]('blur', onBlur);
	}

	(node as HTMLElement).addEventListener('pointerenter', onEnter);
	(node as HTMLElement).addEventListener('pointerleave', onLeave);
	(node as HTMLElement).addEventListener('pointerdown', onDown);
	(node as HTMLElement).addEventListener('pointermove', onMove);
	(node as HTMLElement).addEventListener('pointerup', onUp);
	(node as HTMLElement).addEventListener('pointercancel', onUp);
	(node as HTMLElement).addEventListener('click', onClick, true);
	(node as HTMLElement).addEventListener('contextmenu', onContextMenu);
	listen(node, true);
	findHost();
	if (host) listen(host, true);
	syncDescription();

	return {
		update(next: TipParam) {
			const before = opts;
			opts = normaliseTip(next);
			if (before?.text === opts?.text && before?.describe === opts?.describe && before?.host === opts?.host && before?.press === opts?.press) {
				return;
			}
			if (host) listen(host, false);
			findHost();
			if (host) listen(host, true);
			syncDescription();
			if (active === c) {
				if (!opts) hideActive();
				else if (bubble) {
					bubble.textContent = opts.text;
					position();
				}
			}
		},
		destroy() {
			clearTimeout(showTimer);
			clearTimeout(pressTimer);
			if (active === c) hideActive();
			if (dismissed === node) dismissed = null;
			(node as HTMLElement).removeEventListener('pointerenter', onEnter);
			(node as HTMLElement).removeEventListener('pointerleave', onLeave);
			(node as HTMLElement).removeEventListener('pointerdown', onDown);
			(node as HTMLElement).removeEventListener('pointermove', onMove);
			(node as HTMLElement).removeEventListener('pointerup', onUp);
			(node as HTMLElement).removeEventListener('pointercancel', onUp);
			(node as HTMLElement).removeEventListener('click', onClick, true);
			(node as HTMLElement).removeEventListener('contextmenu', onContextMenu);
			listen(node, false);
			if (host) listen(host, false);
			if (describedEl) removeToken(describedEl, 'aria-describedby', id);
			desc?.remove();
			delete node.dataset.tip;
		}
	};
}

/** Test hook: the open tip's text, or null. */
export function openTipText(): string | null {
	return active ? (bubble?.textContent ?? null) : null;
}
