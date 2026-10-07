// The exam page's keyboard shortcuts, in ONE place: the page's key handler asks matchShortcut() which
// one a key press is, and the keyboard help sheet lists the same entries, so the two cannot drift
// (shortcuts.test.ts checks every entry is matched and handled). Section keys 1-0 come from SECTIONS.

import type { MessageKey } from '#lib/i18n/catalog.ts';
import { SECTIONS, type SectionId } from './catalog.ts';

export type ShortcutId =
	| 'shorthand'
	| 'modeText'
	| 'modeQp'
	| 'modePriors'
	| 'modeDraw'
	| 'print'
	| 'undo'
	| 'undoAnywhere'
	| 'focusMessage'
	| 'help'
	| 'helpF1'
	| 'dimRoom';

export interface Shortcut {
	id: ShortcutId;
	/** Keys as shown, e.g. ['Alt', 'K']; also the aria-keyshortcuts value joined with "+". */
	keys: string[];
	label: MessageKey;
	group: 'typing' | 'panels' | 'actions';
	/** Also works while the cursor is in a text box. */
	whileTyping: boolean;
	/** Handled outside the exam page (listed here so the help sheet shows it), e.g. the theme toggle's Shift+D. */
	elsewhere?: true;
}

/** The subset of KeyboardEvent the matcher reads (so tests need no DOM). */
export type KeyLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** Alt+letter helper panels; the exam page's MODES take their keys from here. */
export const MODE_KEYS = { text: 't', qp: 'b', priors: 'p', draw: 'd' } as const;
export type ModeId = keyof typeof MODE_KEYS;
export const MODE_SHORTCUT: Record<ModeId, ShortcutId> = { text: 'modeText', qp: 'modeQp', priors: 'modePriors', draw: 'modeDraw' };

export const SHORTCUTS: readonly Shortcut[] = [
	{ id: 'shorthand', keys: ['Alt', 'K'], label: 'keys.kShorthand', group: 'typing', whileTyping: true },
	{ id: 'modeText', keys: ['Alt', 'T'], label: 'keys.kModeText', group: 'panels', whileTyping: true },
	{ id: 'modeQp', keys: ['Alt', 'B'], label: 'keys.kModeQp', group: 'panels', whileTyping: true },
	{ id: 'modePriors', keys: ['Alt', 'P'], label: 'keys.kModePriors', group: 'panels', whileTyping: true },
	{ id: 'modeDraw', keys: ['Alt', 'D'], label: 'keys.kModeDraw', group: 'panels', whileTyping: true },
	{ id: 'undo', keys: ['Ctrl', 'Z'], label: 'keys.kUndo', group: 'actions', whileTyping: false },
	// The undo message (WCAG 2.2.1): Alt+U undoes from anywhere, Alt+Shift+U moves focus to the message.
	{ id: 'undoAnywhere', keys: ['Alt', 'U'], label: 'keys.kUndoAnywhere', group: 'actions', whileTyping: true },
	{ id: 'focusMessage', keys: ['Alt', 'Shift', 'U'], label: 'keys.kFocusMessage', group: 'actions', whileTyping: true },
	{ id: 'print', keys: ['Ctrl', 'P'], label: 'keys.kPrint', group: 'actions', whileTyping: true },
	{ id: 'help', keys: ['?'], label: 'keys.kHelp', group: 'actions', whileTyping: false },
	{ id: 'helpF1', keys: ['F1'], label: 'keys.kHelp', group: 'actions', whileTyping: true },
	// ThemeToggle.svelte handles it on every page (isDimRoomKey in components/theme.ts; the test checks they agree).
	{ id: 'dimRoom', keys: ['Shift', 'D'], label: 'keys.kDimRoom', group: 'actions', whileTyping: false, elsewhere: true }
];

/** aria-keyshortcuts value ("Alt+K"). */
export const ariaKeys = (id: ShortcutId): string => SHORTCUTS.find((s) => s.id === id)!.keys.join('+');

function matches(s: Shortcut, e: KeyLike): boolean {
	const mods = s.keys.slice(0, -1);
	const key = s.keys[s.keys.length - 1];
	const alt = mods.includes('Alt');
	const ctrl = mods.includes('Ctrl'); // Ctrl, or Cmd on a Mac
	if (e.altKey !== alt || (e.ctrlKey || e.metaKey) !== ctrl) return false;
	if (key === '?') return e.key === '?'; // Shift+/ on most layouts: Shift is part of the character
	if (mods.includes('Shift') !== e.shiftKey && key.length === 1 && /[a-z]/i.test(key)) return false;
	return e.key.toLowerCase() === key.toLowerCase();
}

/** Which shortcut this key press is, if any. `typing`: focus is in a text box, select or editable area. */
export function matchShortcut(e: KeyLike, typing: boolean): ShortcutId | null {
	for (const s of SHORTCUTS) if ((s.whileTyping || !typing) && matches(s, e)) return s.id;
	return null;
}

/** Section keys 1-0: only when not typing and without modifier keys. */
export function matchSectionKey(e: KeyLike, typing: boolean, sections: readonly { id: SectionId; key: string }[] = SECTIONS): SectionId | null {
	if (typing || e.altKey || e.ctrlKey || e.metaKey) return null;
	return sections.find((s) => s.key === e.key)?.id ?? null;
}

// ---------- opening the help sheet from anywhere ----------

export const KEYBOARD_HELP_EVENT = 'openvision:keyboard-help';
export interface KeyboardHelpOptions {
	/** Pre-fills the code table's filter (e.g. a row's code "RC"); the table then shows all sections. */
	filter?: string;
}

/** Opens the keyboard and shorthand help sheet (the exam page listens; the desktop Help menu sends the same event). */
export function openKeyboardHelp(opts: KeyboardHelpOptions = {}): void {
	window.dispatchEvent(new CustomEvent<KeyboardHelpOptions>(KEYBOARD_HELP_EVENT, { detail: opts }));
}
