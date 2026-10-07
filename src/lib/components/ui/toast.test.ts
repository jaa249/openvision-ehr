import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PausableTimer, overlaps, pickPlacement, undoMs } from './toast.ts';

describe('PausableTimer', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	const make = (ms: number | null) => {
		const done = vi.fn();
		const timer = new PausableTimer(ms, done, () => Date.now());
		return { done, timer };
	};

	it('fires after the time', () => {
		const { done } = make(10_000);
		vi.advanceTimersByTime(9_999);
		expect(done).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(done).toHaveBeenCalledOnce();
	});

	it('pauses while hovered and continues with the time that was left', () => {
		const { done, timer } = make(10_000);
		vi.advanceTimersByTime(4_000);
		timer.pause('hover');
		vi.advanceTimersByTime(60_000);
		expect(done).not.toHaveBeenCalled();
		expect(timer.remaining()).toBe(6_000);
		timer.resume('hover');
		vi.advanceTimersByTime(5_999);
		expect(done).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(done).toHaveBeenCalledOnce();
	});

	it('stays paused until every reason is lifted', () => {
		const { done, timer } = make(1_000);
		timer.pause('focus');
		timer.pause('hidden');
		timer.resume('focus');
		vi.advanceTimersByTime(5_000);
		expect(done).not.toHaveBeenCalled();
		expect(timer.paused).toBe(true);
		timer.resume('hidden');
		vi.advanceTimersByTime(1_000);
		expect(done).toHaveBeenCalledOnce();
	});

	it('resuming a reason that was never set does nothing', () => {
		const { done, timer } = make(1_000);
		timer.resume('hover');
		vi.advanceTimersByTime(1_000);
		expect(done).toHaveBeenCalledOnce();
	});

	it('null = kept until dismissed; cancel stops it', () => {
		const a = make(null);
		vi.advanceTimersByTime(10 * 60_000);
		expect(a.done).not.toHaveBeenCalled();
		expect(a.timer.remaining()).toBe(Infinity);
		const b = make(1_000);
		b.timer.cancel();
		vi.advanceTimersByTime(2_000);
		expect(b.done).not.toHaveBeenCalled();
	});
});

describe('undoMs', () => {
	it('maps the pref', () => {
		expect(undoMs('10')).toBe(10_000);
		expect(undoMs('30')).toBe(30_000);
		expect(undoMs('never')).toBeNull();
		expect(undoMs(undefined)).toBe(10_000);
	});
});

describe('placement', () => {
	const r = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
	const cands = [
		{ place: 'bottom', rect: r(500, 800, 300, 40) },
		{ place: 'bottom-end', rect: r(1100, 800, 300, 40) },
		{ place: 'top-end', rect: r(1100, 80, 300, 40) }
	] as const;
	it('overlaps ignores touching edges', () => {
		expect(overlaps(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
		expect(overlaps(r(0, 0, 10, 10), r(9, 9, 10, 10))).toBe(true);
	});
	it('keeps the default spot when it covers nothing', () => {
		expect(pickPlacement(cands, r(100, 100, 200, 30))).toBe('bottom');
		expect(pickPlacement(cands, null)).toBe('bottom');
	});
	it('moves aside when the focused control is under the message', () => {
		expect(pickPlacement(cands, r(550, 805, 120, 30))).toBe('bottom-end');
		expect(pickPlacement(cands, r(400, 790, 1100, 60))).toBe('top-end');
	});
	it('with no free spot, takes the one covering least', () => {
		const big = r(0, 0, 1500, 900);
		expect(['bottom', 'bottom-end', 'top-end']).toContain(pickPlacement(cands, big));
		expect(pickPlacement(cands, r(1100, 70, 300, 800))).toBe('bottom');
	});
});
