// Tooltips: the pure parts of tooltip.ts. The DOM wiring is checked in the browser (e2e).
import { describe, expect, it } from 'vitest';
import {
	HOVER_DELAY_MS,
	WARM_MS,
	movedTooFar,
	normaliseTip,
	shouldDescribe,
	showDelay,
	tipPosition
} from './tooltip.ts';

describe('normaliseTip', () => {
	it('accepts a string or options; empty means no tip', () => {
		expect(normaliseTip('Copy')).toEqual({ text: 'Copy', placement: 'top', describe: undefined, host: false, press: true });
		expect(normaliseTip({ text: ' Copy ', placement: 'end', describe: false })).toEqual({ text: 'Copy', placement: 'end', describe: false, host: false, press: true });
		expect(normaliseTip({ text: 'x', press: false })?.press).toBe(false);
		expect(normaliseTip('')).toBeNull();
		expect(normaliseTip('   ')).toBeNull();
		expect(normaliseTip(null)).toBeNull();
		expect(normaliseTip(undefined)).toBeNull();
		expect(normaliseTip(false)).toBeNull();
		expect(normaliseTip({ text: '' })).toBeNull();
	});
});

describe('showDelay', () => {
	const now = 10_000;
	const long = -Infinity;
	it('hover waits, focus is immediate, long-press is immediate', () => {
		expect(showDelay('hover', true, now, long)).toBe(HOVER_DELAY_MS);
		expect(showDelay('focus', true, now, long)).toBe(0);
		expect(showDelay('press', true, now, long)).toBe(0);
	});
	it('hover right after another tip closed is instant (moving along a toolbar)', () => {
		expect(showDelay('hover', true, now, now - WARM_MS + 1)).toBe(0);
		expect(showDelay('hover', true, now, now - WARM_MS - 1)).toBe(HOVER_DELAY_MS);
	});
	it('the tooltips pref off: no hover or focus popups, long-press still works', () => {
		expect(showDelay('hover', false, now, long)).toBeNull();
		expect(showDelay('focus', false, now, long)).toBeNull();
		expect(showDelay('press', false, now, long)).toBe(0);
	});
});

describe('shouldDescribe', () => {
	it('describes unless the tip only repeats the accessible name', () => {
		expect(shouldDescribe('Copy right eye to left eye', 'OD → OS')).toBe(true);
		expect(shouldDescribe('Print', 'Print')).toBe(false);
		expect(shouldDescribe('  print ', 'Print\n')).toBe(false);
	});
	it('an explicit choice wins', () => {
		expect(shouldDescribe('Print', 'Print', true)).toBe(true);
		expect(shouldDescribe('More', 'Print', false)).toBe(false);
	});
});

describe('movedTooFar', () => {
	it('a finger that slides is scrolling, not long-pressing', () => {
		expect(movedTooFar(3, 4)).toBe(false);
		expect(movedTooFar(8, 8)).toBe(true);
		expect(movedTooFar(0, -11)).toBe(true);
	});
});

describe('tipPosition', () => {
	const vp = { top: 0, left: 0, width: 1000, height: 800 };
	const size = { width: 100, height: 30 };
	const anchor = { top: 400, left: 450, width: 100, height: 40 };

	it('top by default, centred on the control', () => {
		const p = tipPosition(anchor, size, vp);
		expect(p.side).toBe('top');
		expect(p.top).toBe(400 - 6 - 30);
		expect(p.left).toBe(450);
	});
	it('flips below when there is no room above', () => {
		const p = tipPosition({ ...anchor, top: 10 }, size, vp, 'top');
		expect(p.side).toBe('bottom');
		expect(p.top).toBe(10 + 40 + 6);
	});
	it('stays inside the viewport at the edges', () => {
		expect(tipPosition({ ...anchor, left: 0, width: 20 }, size, vp).left).toBe(8);
		expect(tipPosition({ ...anchor, left: 990, width: 10 }, size, vp).left).toBe(1000 - 8 - 100);
	});
	it('start / end follow the text direction', () => {
		expect(tipPosition(anchor, size, vp, 'end').side).toBe('right');
		expect(tipPosition(anchor, size, vp, 'start').side).toBe('left');
		expect(tipPosition(anchor, size, vp, 'end', true).side).toBe('left');
		expect(tipPosition(anchor, size, vp, 'start', true).side).toBe('right');
		const p = tipPosition(anchor, size, vp, 'end');
		expect(p.left).toBe(450 + 100 + 6);
		expect(p.top).toBe(400 + 20 - 15);
	});
	it('start / end flip sides, then fall back to above when neither side fits', () => {
		expect(tipPosition({ ...anchor, left: 880 }, size, vp, 'end').side).toBe('left');
		const narrow = { top: 0, left: 0, width: 300, height: 800 };
		expect(tipPosition({ top: 400, left: 50, width: 200, height: 40 }, size, narrow, 'end').side).toBe('top');
	});
});
