import { describe, expect, it } from 'vitest';
import { backoff, History } from './history.ts';

describe('drawing undo history', () => {
	it('undoes and redoes, and a new entry clears the redo branch', () => {
		const h = new History<string>();
		h.reset('base');
		expect(h.canUndo).toBe(false);
		h.push('a');
		h.push('b');
		expect(h.undo()).toBe('a');
		expect(h.undo()).toBe('base');
		expect(h.undo()).toBeUndefined();
		expect(h.redo()).toBe('a');
		expect(h.canRedo).toBe(true);
		h.push('c');
		expect(h.canRedo).toBe(false);
		expect(h.redo()).toBeUndefined();
		expect(h.current).toBe('c');
		expect(h.size).toBe(3); // base, a, c
	});

	it('has no depth limit', () => {
		const h = new History<number>();
		h.reset(0);
		for (let i = 1; i <= 500; i++) h.push(i);
		let n = 0;
		while (h.undo() !== undefined) n++;
		expect(n).toBe(500);
	});
});

describe('retry backoff', () => {
	it('doubles and caps at 30 s', () => {
		expect([1, 2, 3, 4, 5, 6, 10].map(backoff)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
	});
});
