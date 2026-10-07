import { describe, expect, it } from 'vitest';
import { isTypeaheadKey, matchTypeahead, nextInGrid, nextInList, Typeahead } from './roving.ts';

describe('nextInList', () => {
	it('moves with arrows and stops at the ends without wrap', () => {
		expect(nextInList(0, 3, 'ArrowDown')).toBe(1);
		expect(nextInList(2, 3, 'ArrowDown')).toBe(2);
		expect(nextInList(0, 3, 'ArrowUp')).toBe(0);
		expect(nextInList(1, 3, 'ArrowRight')).toBe(2);
		expect(nextInList(1, 3, 'ArrowLeft')).toBe(0);
	});
	it('wraps when asked', () => {
		expect(nextInList(2, 3, 'ArrowDown', { wrap: true })).toBe(0);
		expect(nextInList(0, 3, 'ArrowUp', { wrap: true })).toBe(2);
	});
	it('Home and End go to the ends', () => {
		expect(nextInList(1, 5, 'Home')).toBe(0);
		expect(nextInList(1, 5, 'End')).toBe(4);
	});
	it('respects orientation', () => {
		expect(nextInList(1, 3, 'ArrowRight', { orientation: 'vertical' })).toBeNull();
		expect(nextInList(1, 3, 'ArrowDown', { orientation: 'horizontal' })).toBeNull();
		expect(nextInList(1, 3, 'ArrowDown', { orientation: 'vertical' })).toBe(2);
	});
	it('swaps Left and Right in right-to-left', () => {
		expect(nextInList(1, 3, 'ArrowRight', { rtl: true })).toBe(0);
		expect(nextInList(1, 3, 'ArrowLeft', { rtl: true })).toBe(2);
	});
	it('ignores other keys and empty lists', () => {
		expect(nextInList(0, 3, 'a')).toBeNull();
		expect(nextInList(0, 0, 'ArrowDown')).toBeNull();
	});
	it('from nothing focused, Down goes to the first and Up to the last', () => {
		expect(nextInList(-1, 4, 'ArrowDown')).toBe(0);
		expect(nextInList(-1, 4, 'ArrowUp')).toBe(3);
	});
});

describe('nextInGrid', () => {
	const rows = [3, 3, 2, 3];
	it('Up/Down keep the column, clamped to shorter rows', () => {
		expect(nextInGrid({ row: 0, col: 1 }, rows, 'ArrowDown')).toEqual({ row: 1, col: 1 });
		expect(nextInGrid({ row: 1, col: 2 }, rows, 'ArrowDown')).toEqual({ row: 2, col: 1 });
		expect(nextInGrid({ row: 0, col: 2 }, rows, 'ArrowUp')).toEqual({ row: 0, col: 2 });
		expect(nextInGrid({ row: 3, col: 0 }, rows, 'ArrowDown')).toEqual({ row: 3, col: 0 });
	});
	it('Left/Right stay within the row, swapped in RTL', () => {
		expect(nextInGrid({ row: 0, col: 0 }, rows, 'ArrowRight')).toEqual({ row: 0, col: 1 });
		expect(nextInGrid({ row: 0, col: 2 }, rows, 'ArrowRight')).toEqual({ row: 0, col: 2 });
		expect(nextInGrid({ row: 0, col: 0 }, rows, 'ArrowLeft')).toEqual({ row: 0, col: 0 });
		expect(nextInGrid({ row: 0, col: 1 }, rows, 'ArrowRight', { rtl: true })).toEqual({ row: 0, col: 0 });
	});
	it('Home/End within the row; with Ctrl the first/last row', () => {
		expect(nextInGrid({ row: 1, col: 1 }, rows, 'Home')).toEqual({ row: 1, col: 0 });
		expect(nextInGrid({ row: 1, col: 1 }, rows, 'End')).toEqual({ row: 1, col: 2 });
		expect(nextInGrid({ row: 1, col: 1 }, rows, 'Home', { ctrl: true })).toEqual({ row: 0, col: 1 });
		expect(nextInGrid({ row: 1, col: 2 }, rows, 'End', { ctrl: true })).toEqual({ row: 3, col: 2 });
	});
	it('skips empty rows', () => {
		expect(nextInGrid({ row: 0, col: 0 }, [2, 0, 2], 'ArrowDown')).toEqual({ row: 2, col: 0 });
	});
	it('ignores other keys', () => {
		expect(nextInGrid({ row: 0, col: 0 }, rows, 'x')).toBeNull();
		expect(nextInGrid({ row: 0, col: 0 }, [], 'ArrowDown')).toBeNull();
	});
});

describe('matchTypeahead', () => {
	const labels = ['quiet', 'injection', 'papillae', 'giant papillae', 'pinguecula', 'Pterygium', 'émulsion'];
	it('finds the next label starting with a letter, after the current one', () => {
		expect(matchTypeahead(labels, 0, 'p')).toBe(2);
		expect(matchTypeahead(labels, 2, 'p')).toBe(4);
		expect(matchTypeahead(labels, 4, 'p')).toBe(5); // case-insensitive
		expect(matchTypeahead(labels, 5, 'p')).toBe(2); // wraps
	});
	it('a repeated letter cycles like a single one', () => {
		expect(matchTypeahead(labels, 2, 'pp')).toBe(4);
	});
	it('longer queries may stay on the current item', () => {
		expect(matchTypeahead(labels, 4, 'pin')).toBe(4);
		expect(matchTypeahead(labels, 0, 'gi')).toBe(3);
	});
	it('ignores accents and returns -1 when nothing matches', () => {
		expect(matchTypeahead(labels, 0, 'em')).toBe(6);
		expect(matchTypeahead(labels, 0, 'z')).toBe(-1);
		expect(matchTypeahead([], 0, 'a')).toBe(-1);
		expect(matchTypeahead(labels, 0, '')).toBe(-1);
	});
	it('from nothing focused starts at the top', () => {
		expect(matchTypeahead(labels, -1, 'q')).toBe(0);
	});
});

describe('Typeahead buffer', () => {
	it('joins quick keys and restarts after a pause', () => {
		let now = 0;
		const ta = new Typeahead(500, () => now);
		expect(ta.push('p')).toBe('p');
		now = 200;
		expect(ta.push('i')).toBe('pi');
		now = 900;
		expect(ta.push('q')).toBe('q');
		ta.reset();
		expect(ta.push('a')).toBe('a');
	});
	it('only plain printable keys count', () => {
		const k = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });
		expect(isTypeaheadKey(k('a'))).toBe(true);
		expect(isTypeaheadKey(k(' '))).toBe(false);
		expect(isTypeaheadKey(k('Enter'))).toBe(false);
		expect(isTypeaheadKey(k('a', { ctrlKey: true }))).toBe(false);
		expect(isTypeaheadKey(k('D', { shiftKey: true }))).toBe(false);
		expect(isTypeaheadKey(k('?', { shiftKey: true }))).toBe(false);
	});
});
