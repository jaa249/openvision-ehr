// Keeps a dropdown / menu / suggestion list on screen (spec: menus and popovers always stay on screen).
// One dependency-free helper for every floating panel in the app:
//   computePlacement(): pure geometry, unit-tested in place.test.ts.
//   keepInView: a Svelte action that applies it with position: fixed (so overflow:hidden/auto
//   ancestors cannot clip the panel) and keeps it right as the page scrolls, resizes, rotates,
//   pinch-zooms or the on-screen keyboard opens (the VISUAL viewport is what the user sees).
// The panel stays where it is in the DOM, so focus order, aria-* links, Escape and focus-out
// handling in the owning component work unchanged.

export type Side = 'bottom' | 'top';
export type Align = 'start' | 'end';
export type Placement = `${Side}-${Align}`;

export interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface PlaceOptions {
	/** Preferred side and edge; default 'bottom-start'. "start" is the anchor's left in LTR, right in RTL. */
	placement?: Placement;
	/** Right-to-left layout: start/end swap sides. */
	rtl?: boolean;
	/** Distance kept from every viewport edge, px. Default 8. */
	margin?: number;
	/** Space between anchor and panel, px. Default 4. */
	gap?: number;
}

export interface PlaceResult {
	top: number;
	left: number;
	/** The height the panel may use on the chosen side (cap it with max-height, let it scroll). */
	maxHeight: number;
	/** The width the panel may use (viewport minus margins). */
	maxWidth: number;
	side: Side;
}

/**
 * Where to put a panel of `panel` size next to `anchor` inside `viewport` (all in the same
 * coordinate space, e.g. getBoundingClientRect() + visualViewport offsets).
 * Below by default; above when below does not fit and above does; when neither fits, the
 * bigger side with maxHeight capped to it. Horizontally aligned to the anchor's start edge
 * and shifted to stay `margin` inside the viewport; never wider than the viewport.
 */
export function computePlacement(
	anchor: Box,
	panel: { width: number; height: number },
	viewport: Box,
	opts: PlaceOptions = {}
): PlaceResult {
	const margin = opts.margin ?? 8;
	const gap = opts.gap ?? 4;
	const [prefSide, prefAlign] = (opts.placement ?? 'bottom-start').split('-') as [Side, Align];

	// ---- vertical ----
	const vpTop = viewport.top + margin;
	const vpBottom = viewport.top + viewport.height - margin;
	const anchorBottom = anchor.top + anchor.height;
	const space: Record<Side, number> = {
		bottom: Math.max(0, vpBottom - (anchorBottom + gap)),
		top: Math.max(0, anchor.top - gap - vpTop)
	};
	const other: Side = prefSide === 'bottom' ? 'top' : 'bottom';
	let side: Side;
	if (panel.height <= space[prefSide]) side = prefSide;
	else if (panel.height <= space[other]) side = other;
	else side = space[other] > space[prefSide] ? other : prefSide;
	const maxHeight = Math.floor(space[side]);
	const height = Math.min(panel.height, maxHeight);
	const top = side === 'bottom' ? anchorBottom + gap : anchor.top - gap - height;

	// ---- horizontal ----
	const maxWidth = Math.max(0, Math.floor(viewport.width - 2 * margin));
	const width = Math.min(panel.width, maxWidth);
	// Physical edge to line up with: start = left in LTR, right in RTL.
	const alignLeftEdge = (prefAlign === 'start') !== !!opts.rtl;
	let left = alignLeftEdge ? anchor.left : anchor.left + anchor.width - width;
	const minLeft = viewport.left + margin;
	const maxLeft = viewport.left + viewport.width - margin - width;
	left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));

	return { top, left, maxHeight, maxWidth, side };
}

export interface KeepInViewParams {
	/** The trigger / input the panel belongs to. */
	anchor: HTMLElement | null | undefined;
	placement?: Placement;
	margin?: number;
	gap?: number;
	/** Make the panel exactly as wide as this element (e.g. a combobox's whole row). */
	matchWidth?: HTMLElement | null;
}

function visualViewportBox(): Box {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	if (vv) return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
	return { top: 0, left: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}

/** A computed length in px; 'none' (or anything unparsable) = no limit. */
function cssPx(v: string): number {
	const n = parseFloat(v);
	return Number.isFinite(n) ? n : Infinity;
}

/**
 * Svelte action: `<ul use:keepInView={{ anchor: button }}>`. Put it on the element that only
 * exists while the menu is open ({#if open}); it positions on mount and cleans up on destroy.
 */
export function keepInView(node: HTMLElement, params: KeepInViewParams) {
	let p = params;
	// The panel's own CSS max-height / max-width (e.g. 18rem) still apply: we only ever cap below them.
	const cs = getComputedStyle(node);
	const cssMaxHeight = cssPx(cs.maxHeight);
	const cssMaxWidth = cssPx(cs.maxWidth);
	node.style.position = 'fixed';
	node.style.margin = '0';
	node.style.right = 'auto';
	node.style.bottom = 'auto';
	node.style.boxSizing = 'border-box';
	node.style.overflowY = 'auto';
	node.style.overscrollBehavior = 'contain';

	let frame = 0;
	function update() {
		frame = 0;
		const anchor = p.anchor;
		if (!anchor || !node.isConnected) return;
		const margin = p.margin ?? 8;
		// Rects and the visual viewport are in screen CSS px; the panel's own lengths (inline styles,
		// scrollHeight, computed max-height) are multiplied by any CSS zoom on the page. The app has
		// none today (large text scales rem), but a zoom must not throw the panel off screen.
		const zoom = (node as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
		const vp = visualViewportBox();
		const a = anchor.getBoundingClientRect();
		if (p.matchWidth) node.style.width = `${p.matchWidth.getBoundingClientRect().width / zoom}px`;
		node.style.maxWidth = `${Math.min(Math.max(0, vp.width - 2 * margin) / zoom, cssMaxWidth)}px`;
		const width = node.getBoundingClientRect().width;
		// Natural height = the content's height (not the current, possibly capped, box), within the CSS cap.
		const ncs = getComputedStyle(node);
		const borderY = (parseFloat(ncs.borderTopWidth) || 0) + (parseFloat(ncs.borderBottomWidth) || 0);
		const natural = Math.min(node.scrollHeight + borderY, cssMaxHeight) * zoom;
		const res = computePlacement(
			{ top: a.top, left: a.left, width: a.width, height: a.height },
			{ width, height: natural },
			vp,
			{ placement: p.placement, rtl: getComputedStyle(anchor).direction === 'rtl', margin, gap: p.gap }
		);
		node.style.maxHeight = `${Math.min(res.maxHeight / zoom, cssMaxHeight)}px`;
		node.dataset.side = res.side;
		let top = res.top / zoom;
		let left = res.left / zoom;
		node.style.top = `${top}px`;
		node.style.left = `${left}px`;
		// A transformed / filtered / contained ancestor makes "fixed" relative to that ancestor:
		// measure where the panel actually landed and correct by the difference.
		const got = node.getBoundingClientRect();
		const dx = got.left - res.left;
		const dy = got.top - res.top;
		if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
			left -= dx / zoom;
			top -= dy / zoom;
			node.style.top = `${top}px`;
			node.style.left = `${left}px`;
		}
	}
	function schedule() {
		if (!frame) frame = requestAnimationFrame(update);
	}

	update();
	const vv = window.visualViewport;
	window.addEventListener('resize', schedule);
	window.addEventListener('orientationchange', schedule);
	// Scrolling of ANY ancestor (or the page) moves the anchor.
	window.addEventListener('scroll', schedule, { capture: true, passive: true });
	vv?.addEventListener('resize', schedule);
	vv?.addEventListener('scroll', schedule);
	const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
	ro?.observe(node);
	if (p.anchor) ro?.observe(p.anchor);

	return {
		update(next: KeepInViewParams) {
			if (next.anchor !== p.anchor && ro) {
				if (p.anchor) ro.unobserve(p.anchor);
				if (next.anchor) ro.observe(next.anchor);
			}
			p = next;
			schedule();
		},
		destroy() {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener('resize', schedule);
			window.removeEventListener('orientationchange', schedule);
			window.removeEventListener('scroll', schedule, { capture: true });
			vv?.removeEventListener('resize', schedule);
			vv?.removeEventListener('scroll', schedule);
			ro?.disconnect();
		}
	};
}
