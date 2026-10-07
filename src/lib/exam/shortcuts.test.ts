import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN } from '#lib/i18n/catalog.ts';
import { SECTIONS } from './catalog.ts';
import { isDimRoomKey } from '#lib/components/theme.ts';
import { MODE_KEYS, MODE_SHORTCUT, SHORTCUTS, ariaKeys, matchSectionKey, matchShortcut, type KeyLike, type Shortcut } from './shortcuts.ts';

/** The key press a shortcut's own key list describes. */
function press(s: Shortcut): KeyLike {
	const mods = s.keys.slice(0, -1);
	const key = s.keys[s.keys.length - 1];
	return {
		key: key.length === 1 ? key.toLowerCase() : key,
		altKey: mods.includes('Alt'),
		ctrlKey: mods.includes('Ctrl'),
		metaKey: false,
		shiftKey: mods.includes('Shift') || key === '?'
	};
}
const plain = (key: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });

describe('shortcut list', () => {
	it('every entry is matched by its own keys, and only by them', () => {
		for (const s of SHORTCUTS) expect(matchShortcut(press(s), false), s.id).toBe(s.id);
		const ids = SHORTCUTS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		const combos = SHORTCUTS.map((s) => s.keys.join('+').toLowerCase());
		expect(new Set(combos).size).toBe(combos.length);
	});

	it('typing in a box: only the whileTyping ones fire', () => {
		for (const s of SHORTCUTS) expect(matchShortcut(press(s), true), s.id).toBe(s.whileTyping ? s.id : null);
		expect(matchShortcut(plain('?', { shiftKey: true }), true)).toBeNull();
		expect(matchShortcut(plain('F1'), true)).toBe('helpF1');
	});

	it('Cmd works like Ctrl; extra modifiers do not match', () => {
		expect(matchShortcut(plain('p', { metaKey: true }), false)).toBe('print');
		expect(matchShortcut(plain('k', { altKey: true, ctrlKey: true }), false)).toBeNull();
		expect(matchShortcut(plain('k'), false)).toBeNull();
	});

	it('every label is an English message', () => {
		for (const s of SHORTCUTS) expect(EN[s.label], s.label).toBeDefined();
	});

	it('mode keys are the Alt shortcuts, aria-keyshortcuts strings follow the list', () => {
		for (const [mode, key] of Object.entries(MODE_KEYS)) {
			const s = SHORTCUTS.find((x) => x.id === MODE_SHORTCUT[mode as keyof typeof MODE_KEYS])!;
			expect(s.keys).toEqual(['Alt', key.toUpperCase()]);
		}
		expect(ariaKeys('shorthand')).toBe('Alt+K');
	});

	it('section keys 1-0, never while typing or with a modifier', () => {
		for (const s of SECTIONS) expect(matchSectionKey(plain(s.key), false)).toBe(s.id);
		expect(matchSectionKey(plain('1'), true)).toBeNull();
		expect(matchSectionKey(plain('1', { altKey: true }), false)).toBeNull();
		// a section key is never also a shortcut
		for (const s of SECTIONS) expect(matchShortcut(plain(s.key), false)).toBeNull();
	});

	it('the exam page handles every shortcut in the list (no entry in the help sheet without a handler)', () => {
		const page = readFileSync(fileURLToPath(new URL('../../routes/patients/[pid]/encounters/[eid]/+page.svelte', import.meta.url)), 'utf8');
		expect(page).toContain('matchShortcut(');
		for (const s of SHORTCUTS.filter((x) => !x.elsewhere)) expect(page, `case '${s.id}'`).toContain(`case '${s.id}':`);
	});

	it("Shift+D (dim room) agrees with the theme toggle's own key test", () => {
		const dim = SHORTCUTS.find((s) => s.id === 'dimRoom')!;
		const e = { ...press(dim), key: 'D', repeat: false };
		expect(isDimRoomKey(e, false)).toBe(true);
		expect(matchShortcut(e, false)).toBe('dimRoom');
		expect(isDimRoomKey(e, true)).toBe(matchShortcut(e, true) === 'dimRoom');
	});
});
