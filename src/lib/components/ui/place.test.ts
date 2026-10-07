import { describe, expect, it } from 'vitest';
import { computePlacement } from './place.ts';

// A portrait tablet: 768 x 1024.
const vp = { top: 0, left: 0, width: 768, height: 1024 };
const anchor = (left: number, top: number, width = 100, height = 40) => ({ left, top, width, height });

describe('computePlacement', () => {
	it('opens below, start-aligned, when below fits', () => {
		const r = computePlacement(anchor(100, 100), { width: 200, height: 150 }, vp);
		expect(r.side).toBe('bottom');
		expect(r.top).toBe(144); // 100 + 40 + gap 4
		expect(r.left).toBe(100);
		expect(r.maxHeight).toBe(1024 - 8 - 144);
		expect(r.maxWidth).toBe(768 - 16);
	});

	it('flips above when below does not fit and above does', () => {
		const r = computePlacement(anchor(100, 900), { width: 200, height: 150 }, vp);
		expect(r.side).toBe('top');
		expect(r.top).toBe(900 - 4 - 150);
		expect(r.maxHeight).toBe(900 - 4 - 8);
	});

	it('neither side fits: caps max-height on the bigger side', () => {
		// 300 px above, ~680 below; the panel is 2000 tall.
		const below = computePlacement(anchor(100, 300), { width: 200, height: 2000 }, vp);
		expect(below.side).toBe('bottom');
		expect(below.maxHeight).toBe(1024 - 8 - 344);
		expect(below.top).toBe(344);
		// Anchor low on the screen: more room above.
		const above = computePlacement(anchor(100, 800), { width: 200, height: 2000 }, vp);
		expect(above.side).toBe('top');
		expect(above.maxHeight).toBe(800 - 4 - 8);
		expect(above.top).toBe(8); // panel fills up to the top margin
	});

	it('shifts left at the right edge', () => {
		const r = computePlacement(anchor(700, 100, 60), { width: 272, height: 100 }, vp);
		expect(r.left).toBe(768 - 8 - 272);
	});

	it('shifts right at the left edge', () => {
		// End-aligned (right edge of a narrow anchor near the left) would go negative.
		const r = computePlacement(anchor(2, 100, 60), { width: 272, height: 100 }, vp, { placement: 'bottom-end' });
		expect(r.left).toBe(8);
	});

	it('RTL: start is the right edge', () => {
		const r = computePlacement(anchor(400, 100, 100), { width: 200, height: 100 }, vp, { rtl: true });
		expect(r.left).toBe(500 - 200);
		// ...and end is the left edge.
		const e = computePlacement(anchor(400, 100, 100), { width: 200, height: 100 }, vp, { rtl: true, placement: 'bottom-end' });
		expect(e.left).toBe(400);
	});

	it('panel wider than the viewport: pinned to the margin, width capped', () => {
		const phone = { top: 0, left: 0, width: 390, height: 844 };
		const r = computePlacement(anchor(300, 100, 60), { width: 600, height: 100 }, phone);
		expect(r.maxWidth).toBe(390 - 16);
		expect(r.left).toBe(8);
	});

	it('uses the visual viewport offset (keyboard open / pinch zoom)', () => {
		const visual = { top: 200, left: 50, width: 300, height: 400 };
		const r = computePlacement(anchor(320, 540, 20, 20), { width: 200, height: 100 }, visual);
		// Below: 560 + 4 + 100 > 592 (bottom limit), above fits.
		expect(r.side).toBe('top');
		expect(r.top).toBe(540 - 4 - 100);
		expect(r.left).toBe(50 + 300 - 8 - 200);
	});

	it('honours a preferred top placement', () => {
		const r = computePlacement(anchor(100, 500), { width: 200, height: 100 }, vp, { placement: 'top-start' });
		expect(r.side).toBe('top');
		expect(r.top).toBe(396);
	});
});
