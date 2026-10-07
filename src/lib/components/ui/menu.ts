// Menu button pattern (WAI-ARIA APG "menu button"), shared by every drop-down menu in the app.
//   Button: aria-haspopup="menu", aria-expanded, aria-controls; Enter/Space/ArrowDown open the menu
//   on the first item, ArrowUp on the last (menuButtonKeydown).
//   Menu (the `menu` action on role="menu"): items are role="menuitem" with tabindex=-1; ArrowUp/Down
//   (wrapping), Home/End and typing the first letters move focus; Escape closes and returns focus to
//   the button; Tab closes and lets focus move on; Enter/Space activate the item (native buttons).
// The key maths is nextInList / matchTypeahead from roving.ts (unit-tested there).
import { isTypeaheadKey, matchTypeahead, nextInList, Typeahead } from './roving.ts';

export type MenuFocus = 'first' | 'last';

/** On the menu button: opens with the arrow keys (Enter/Space open through the click). */
export function menuButtonKeydown(e: KeyboardEvent, open: (focus: MenuFocus) => void): void {
	if (e.altKey || e.ctrlKey || e.metaKey) return;
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		e.preventDefault();
		open(e.key === 'ArrowDown' ? 'first' : 'last');
	}
}

export interface MenuOptions {
	/** Close the menu; refocus = move focus back to the menu button. */
	onclose: (refocus: boolean) => void;
	/** Item focused when the menu opens. Default 'first'. */
	focus?: MenuFocus;
}

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

export function menu(node: HTMLElement, options: MenuOptions) {
	let opts = options;
	const ta = new Typeahead();
	const items = () => [...node.querySelectorAll<HTMLElement>(ITEMS)].filter((el) => !(el as HTMLButtonElement).disabled);
	for (const el of node.querySelectorAll<HTMLElement>(ITEMS)) el.tabIndex = -1;
	// Wait one frame: the menu is placed (keepInView) before focus scrolls anything.
	const raf = requestAnimationFrame(() => {
		const list = items();
		(opts.focus === 'last' ? list[list.length - 1] : list[0])?.focus();
	});

	function onkeydown(e: KeyboardEvent) {
		const list = items();
		const i = list.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			opts.onclose(true);
			return;
		}
		if (e.key === 'Tab') {
			opts.onclose(false);
			return;
		}
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		const next = nextInList(i, list.length, e.key, { orientation: 'vertical', wrap: true });
		if (next != null) {
			e.preventDefault();
			list[next]?.focus();
			return;
		}
		if (isTypeaheadKey(e)) {
			const hit = matchTypeahead(
				list.map((el) => (el.dataset.label ?? el.textContent ?? '').trim()),
				i,
				ta.push(e.key)
			);
			e.preventDefault();
			e.stopPropagation();
			if (hit >= 0) list[hit].focus();
		}
	}

	node.addEventListener('keydown', onkeydown);
	return {
		update(next: MenuOptions) {
			opts = next;
		},
		destroy() {
			cancelAnimationFrame(raf);
			node.removeEventListener('keydown', onkeydown);
		}
	};
}
