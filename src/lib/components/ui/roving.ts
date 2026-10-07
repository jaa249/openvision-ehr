// Roving tabindex (WAI-ARIA APG "managing focus within composites"): a list, toolbar, grid or menu
// is ONE Tab stop; arrow keys, Home/End and typing letters move focus inside it.
//   Pure helpers (unit-tested in roving.test.ts): nextInList, nextInGrid, matchTypeahead, Typeahead.
//   roving: a Svelte action that applies them to real elements and keeps exactly one item at
//   tabindex=0 (the last one used), so Tab leaves the composite and Shift+Tab comes back to it.
// Used by the quick-pick list and modifier toolbar, the section rail and the Download menu.

export type Orientation = 'vertical' | 'horizontal' | 'both';

export interface StepOptions {
	/** Which arrows move: up/down, left/right, or both (default). */
	orientation?: Orientation;
	/** Right-to-left: Left/Right swap meaning (Right = previous). */
	rtl?: boolean;
	/** Past the last item go to the first (and back). Default false. */
	wrap?: boolean;
}

/** Index after pressing `key` in a list of `count` items, or null when the key does not move. */
export function nextInList(index: number, count: number, key: string, opts: StepOptions = {}): number | null {
	if (count <= 0) return null;
	const orientation = opts.orientation ?? 'both';
	const vertical = orientation !== 'horizontal';
	const horizontal = orientation !== 'vertical';
	let delta = 0;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	if (vertical && key === 'ArrowDown') delta = 1;
	else if (vertical && key === 'ArrowUp') delta = -1;
	else if (horizontal && key === 'ArrowRight') delta = opts.rtl ? -1 : 1;
	else if (horizontal && key === 'ArrowLeft') delta = opts.rtl ? 1 : -1;
	else return null;
	const from = index < 0 ? (delta > 0 ? -1 : count) : index;
	const to = from + delta;
	if (to < 0) return opts.wrap ? count - 1 : 0;
	if (to >= count) return opts.wrap ? 0 : count - 1;
	return to;
}

export interface Cell {
	row: number;
	col: number;
}

/**
 * Grid movement. `rows[i]` is the number of cells in row i (rows may differ in length).
 * Up/Down: previous/next row, same column (clamped to that row's length).
 * Left/Right: previous/next cell in the row (no wrapping; RTL swaps them).
 * Home/End: first/last cell of the row; Ctrl+Home/End: first/last row (same column).
 * Returns null when the key does not move.
 */
export function nextInGrid(cell: Cell, rows: number[], key: string, opts: { rtl?: boolean; ctrl?: boolean } = {}): Cell | null {
	if (!rows.length || rows.every((n) => n <= 0)) return null;
	const clampCol = (r: number, c: number) => Math.max(0, Math.min(c, rows[r] - 1));
	const row = Math.max(0, Math.min(cell.row, rows.length - 1));
	const col = clampCol(row, cell.col);
	const findRow = (from: number, step: number) => {
		for (let r = from + step; r >= 0 && r < rows.length; r += step) if (rows[r] > 0) return r;
		return -1;
	};
	switch (key) {
		case 'ArrowDown':
		case 'ArrowUp': {
			const r = findRow(row, key === 'ArrowDown' ? 1 : -1);
			return r < 0 ? { row, col } : { row: r, col: clampCol(r, cell.col) };
		}
		case 'ArrowRight':
		case 'ArrowLeft': {
			const step = (key === 'ArrowRight') !== !!opts.rtl ? 1 : -1;
			return { row, col: clampCol(row, col + step) };
		}
		case 'Home':
		case 'End': {
			if (opts.ctrl) {
				const r = key === 'Home' ? findRow(-1, 1) : findRow(rows.length, -1);
				return { row: r, col: clampCol(r, cell.col) };
			}
			return { row, col: key === 'Home' ? 0 : rows[row] - 1 };
		}
		default:
			return null;
	}
}

/**
 * Typeahead: the first label (searching forward from `from`, wrapping) that starts with `query`
 * (case- and accent-insensitive; leading spaces ignored). With a one-letter query the search
 * starts AFTER `from`, so pressing the same letter again cycles through the matches; a longer
 * query may stay on `from`. Returns -1 when nothing matches.
 */
export function matchTypeahead(labels: readonly string[], from: number, query: string): number {
	const q = fold(query);
	if (!q || !labels.length) return -1;
	const n = labels.length;
	// A run of one repeated letter ("ppp") cycles like a single "p".
	const single = [...q].every((c) => c === q[0]);
	const needle = single ? q[0] : q;
	const start = single ? from + 1 : Math.max(from, 0);
	for (let i = 0; i < n; i++) {
		const k = (((start + i) % n) + n) % n;
		if (fold(labels[k]).startsWith(needle)) return k;
	}
	return -1;
}

function fold(s: string): string {
	return s.trimStart().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/** Collects typed characters into one query; a pause longer than `ms` starts a new one. */
export class Typeahead {
	private buffer = '';
	private last = -Infinity;
	constructor(
		private ms = 600,
		private now: () => number = () => Date.now()
	) {}
	/** Adds one character; returns the query so far. */
	push(ch: string): string {
		const t = this.now();
		if (t - this.last > this.ms) this.buffer = '';
		this.last = t;
		this.buffer += ch;
		return this.buffer;
	}
	reset(): void {
		this.buffer = '';
		this.last = -Infinity;
	}
}

/**
 * A printable single character typed without modifiers (Space excluded: it activates). Shift is
 * excluded too, so page shortcuts such as Shift+D (dim room) and ? (help) keep working in a list.
 */
export function isTypeaheadKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'> & { shiftKey?: boolean }): boolean {
	return e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
}

// ---------------------------------------------------------------- the action

export interface RovingOptions {
	/** CSS selector of the items, relative to the container. */
	items: string;
	/**
	 * 'list' (default): one dimension. 'grid': items carry data-row (and are in DOM order within a
	 * row); Up/Down change row, Left/Right move inside it.
	 */
	mode?: 'list' | 'grid';
	orientation?: Orientation;
	wrap?: boolean;
	/** Text used by typeahead (default: the item's text). In a grid, the row's first item's text. */
	label?: (el: HTMLElement) => string;
	/** Off: letters are left to the page (e.g. the exam's section number keys). Default true. */
	typeahead?: boolean;
	/** Changing this re-applies the tabindex (e.g. a new section's picks). */
	key?: unknown;
}

const rtlOf = (el: Element) => getComputedStyle(el).direction === 'rtl';

/**
 * Svelte action: `<div use:roving={{ items: 'button' }}>`. One item has tabindex=0, the rest -1;
 * the item focused last (by keys, click or programmatic focus) keeps the 0. Items that are
 * disabled or hidden are skipped. Enter/Space are left to the items (native buttons activate).
 */
export function roving(node: HTMLElement, options: RovingOptions) {
	let opts = options;
	const ta = new Typeahead();
	let active: HTMLElement | null = null;

	const items = () =>
		[...node.querySelectorAll<HTMLElement>(opts.items)].filter(
			(el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0
		);

	function sync() {
		const all = [...node.querySelectorAll<HTMLElement>(opts.items)];
		// Nothing laid out yet (e.g. a panel still hidden): keep the first enabled item reachable.
		let usable = items();
		if (!usable.length) usable = all.filter((el) => !(el as HTMLButtonElement).disabled);
		if (!active || !usable.includes(active)) {
			// Start on the selected item (current section, checked or pressed option), else the first.
			const current = usable.find((el) => ['aria-current', 'aria-checked', 'aria-pressed'].some((a) => el.getAttribute(a) === 'true'));
			active = current ?? usable[0] ?? null;
		}
		for (const el of all) el.tabIndex = el === active ? 0 : -1;
	}

	function move(to: HTMLElement | undefined) {
		if (!to) return;
		active = to;
		sync();
		to.focus();
	}

	function rowsOf(list: HTMLElement[]) {
		const rows: HTMLElement[][] = [];
		let key: string | null = null;
		for (const el of list) {
			const r = el.dataset.row ?? '';
			if (r !== key) {
				rows.push([]);
				key = r;
			}
			rows[rows.length - 1].push(el);
		}
		return rows;
	}

	function onkeydown(e: KeyboardEvent) {
		const list = items();
		const target = (e.target as HTMLElement).closest<HTMLElement>(opts.items);
		if (!target || !list.includes(target)) return;
		const rtl = rtlOf(node);
		if (opts.mode === 'grid') {
			const rows = rowsOf(list);
			const r = rows.findIndex((row) => row.includes(target));
			const c = rows[r].indexOf(target);
			const next = nextInGrid({ row: r, col: c }, rows.map((x) => x.length), e.key, { rtl, ctrl: e.ctrlKey || e.metaKey });
			if (next && !e.altKey) {
				e.preventDefault();
				// Plain Home/End in a list of findings go to the first/last finding (same column).
				if ((e.key === 'Home' || e.key === 'End') && !(e.ctrlKey || e.metaKey)) {
					const rr = e.key === 'Home' ? 0 : rows.length - 1;
					move(rows[rr][Math.min(c, rows[rr].length - 1)]);
				} else move(rows[next.row][next.col]);
				return;
			}
			if (opts.typeahead !== false && isTypeaheadKey(e)) {
				const labels = rows.map((row) => (opts.label ?? text)(row[0]));
				const hit = matchTypeahead(labels, r, ta.push(e.key));
				if (hit >= 0) {
					e.preventDefault();
					e.stopPropagation();
					move(rows[hit][Math.min(c, rows[hit].length - 1)]);
				}
			}
			return;
		}
		const i = list.indexOf(target);
		const next = e.altKey ? null : nextInList(i, list.length, e.key, { orientation: opts.orientation, rtl, wrap: opts.wrap });
		if (next != null) {
			e.preventDefault();
			move(list[next]);
			return;
		}
		if (opts.typeahead !== false && isTypeaheadKey(e)) {
			const hit = matchTypeahead(list.map(opts.label ?? text), i, ta.push(e.key));
			if (hit >= 0) {
				e.preventDefault();
				e.stopPropagation();
				move(list[hit]);
			}
		}
	}

	function onfocusin(e: FocusEvent) {
		const el = (e.target as HTMLElement).closest<HTMLElement>(opts.items);
		if (el && node.contains(el) && el !== active) {
			active = el;
			sync();
		}
	}

	const observer = new MutationObserver(() => sync());
	observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'aria-current', 'aria-checked', 'aria-pressed'] });
	node.addEventListener('keydown', onkeydown);
	node.addEventListener('focusin', onfocusin);
	sync();

	return {
		update(next: RovingOptions) {
			const changed = next.key !== opts.key;
			opts = next;
			if (changed) active = null;
			sync();
		},
		destroy() {
			observer.disconnect();
			node.removeEventListener('keydown', onkeydown);
			node.removeEventListener('focusin', onfocusin);
		}
	};
}

const text = (el: HTMLElement) => (el.dataset.label ?? el.textContent ?? '').trim();
