import { describe, expect, it } from 'vitest';
import { isDimRoomKey, toggleDim } from './theme.ts';

const key = (k: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat', boolean>> = {}) => ({
	key: k,
	shiftKey: false,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	repeat: false,
	...mods
});

describe('dim room shortcut', () => {
	it('is Shift+D only, never while typing or with other modifiers', () => {
		expect(isDimRoomKey(key('D', { shiftKey: true }), false)).toBe(true);
		expect(isDimRoomKey(key('d', { shiftKey: true }), false)).toBe(true); // Caps Lock on
		expect(isDimRoomKey(key('D', { shiftKey: true }), true)).toBe(false);
		expect(isDimRoomKey(key('d'), false)).toBe(false);
		expect(isDimRoomKey(key('d', { altKey: true }), false)).toBe(false); // Alt+D = drawing panel
		expect(isDimRoomKey(key('D', { shiftKey: true, ctrlKey: true }), false)).toBe(false);
		expect(isDimRoomKey(key('D', { shiftKey: true, repeat: true }), false)).toBe(false);
	});

	it('turns dim room on, and off back to the mode before it', () => {
		expect(toggleDim('light', null)).toBe('dim');
		expect(toggleDim('dark', 'light')).toBe('dim');
		expect(toggleDim('dim', 'light')).toBe('light');
		expect(toggleDim('dim', 'dark')).toBe('dark');
		expect(toggleDim('dim', 'dim')).toBe('dark');
		expect(toggleDim('dim', 'bogus')).toBe('dark');
	});
});
