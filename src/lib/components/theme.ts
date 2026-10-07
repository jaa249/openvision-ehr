// Colour modes (DESIGN §3.1): light, dark, dim room. Shift+D turns dim room on and off (DESIGN §3.1),
// returning to the mode used before. Pure parts here so they are tested without a DOM.

export type ThemeMode = 'light' | 'dark' | 'dim';
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'dim'];
export const THEME_STORAGE_KEY = 'ov-theme';
/** The mode to go back to when Shift+D turns dim room off. */
export const BEFORE_DIM_STORAGE_KEY = 'ov-theme-before-dim';

export function isThemeMode(v: unknown): v is ThemeMode {
	return v === 'light' || v === 'dark' || v === 'dim';
}

/** Shift+D: dim room on, or back to the mode before it (dark if that is unknown). */
export function toggleDim(current: ThemeMode, before: unknown): ThemeMode {
	if (current !== 'dim') return 'dim';
	return isThemeMode(before) && before !== 'dim' ? before : 'dark';
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat'>;

/**
 * Shift+D, but never while typing (a capital D in a text box, the shorthand bar, a select) and never
 * with Ctrl, Alt or Cmd (Alt+D opens the drawing panel).
 */
export function isDimRoomKey(e: KeyLike, typing: boolean): boolean {
	return !typing && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && (e.key === 'D' || e.key === 'd');
}

/** Focus is somewhere a key press types text (or picks an option). */
export function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as Element | null;
	if (!el || typeof el.closest !== 'function') return false;
	if (el.closest('textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
	const input = el.closest('input');
	return !!input && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(input.type);
}
