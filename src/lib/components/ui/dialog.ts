// Modal dialogs: initial focus and focus return (WCAG 2.4.3, APG dialog pattern).
// A native <dialog>.showModal() only gives focus back when the element that opened it still had
// focus at that moment. That fails when the opener was disabled while the page was busy (the Sign
// button while the exam saves), when the dialog opens from an async step, or when the opener is
// gone by the time the dialog closes (a deleted row). openModal() remembers the opener and puts focus
// back on it, or on a fallback, whenever the dialog closes (Escape, Cancel, a button, or code).

export interface OpenModalOptions {
	/** The control that opened the dialog. Default: whatever has focus now. */
	opener?: Element | null;
	/** Where focus goes when the opener is gone or cannot take focus (e.g. a heading or the page's <main>). */
	fallback?: () => HTMLElement | null | undefined;
}

/**
 * Opens `dialog` as a modal. Initial focus: the element marked `data-initial-focus` inside it if
 * any (e.g. Cancel on a confirmation), else the browser's choice (the first focusable control).
 */
export function openModal(dialog: HTMLDialogElement | null | undefined, opts: OpenModalOptions = {}): void {
	if (!dialog || dialog.open) return;
	const active = opts.opener !== undefined ? opts.opener : document.activeElement;
	const opener = active instanceof HTMLElement && active !== document.body ? active : null;
	dialog.addEventListener('close', () => returnFocus(dialog, opener, opts.fallback), { once: true });
	dialog.showModal();
	const first = dialog.querySelector<HTMLElement>('[data-initial-focus]');
	first?.focus();
	// Still disabled on this tick (the page re-enables it as it renders): try again next frame.
	if (first && document.activeElement !== first) requestAnimationFrame(() => dialog.open && first.focus());
}

/** The element that had focus before an async step, so a dialog opened afterwards can return there. */
export function currentFocus(): HTMLElement | null {
	const a = document.activeElement;
	return a instanceof HTMLElement && a !== document.body ? a : null;
}

function returnFocus(dialog: HTMLDialogElement, opener: HTMLElement | null, fallback?: () => HTMLElement | null | undefined) {
	// Wait for the page to settle (the opener may be re-enabled or re-rendered on the same tick).
	requestAnimationFrame(() => {
		const now = document.activeElement;
		// Something else already took focus on purpose (not the body, not inside the closed dialog): leave it.
		if (now && now !== document.body && !dialog.contains(now)) return;
		for (const target of [opener, fallback?.()]) {
			if (!target || !target.isConnected || (target as HTMLButtonElement).disabled) continue;
			if (target.closest('[inert]')) continue;
			// A heading or <main> as the fallback: focusable from script only.
			if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
			target.focus();
			if (document.activeElement === target) return;
		}
	});
}
