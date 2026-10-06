import { describe, expect, it } from 'vitest';
import { dateScale, dateTicks, fmtHour, hourDomain, hourTicks, iopMax, segments } from './chart.ts';

describe('flow sheet chart helpers', () => {
	it('splits lines at gaps; a lone value is its own segment', () => {
		expect(segments([1, 2, null, 3, undefined, null, 4, 5])).toEqual([[1, 2], [3], [4, 5]]);
		expect(segments([null, null])).toEqual([]);
		expect(segments([7])).toEqual([[7]]); // today only, no priors: still drawn
	});

	it('places dates by real time; one date sits in the middle', () => {
		const s = dateScale(['2026-01-01', '2026-01-11', '2026-01-21'], 0, 200);
		expect(s('2026-01-11')).toBe(100);
		expect(s('2026-01-21')).toBe(200);
		expect(dateScale(['2026-10-06'], 0, 200)('2026-10-06')).toBe(100);
	});

	it('date labels never collide and keep the last date', () => {
		const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-06-01', '2026-12-31'];
		const s = dateScale(dates, 0, 400);
		const t = dateTicks(dates, s);
		expect(t[0]).toBe('2026-01-01');
		expect(t.at(-1)).toBe('2026-12-31');
		for (let i = 1; i < t.length; i++) expect(s(t[i]) - s(t[i - 1])).toBeGreaterThanOrEqual(70);
	});

	it('y axis from 0 to at least 35 mmHg', () => {
		expect(iopMax([12, 18])).toBe(35);
		expect(iopMax([44])).toBe(50);
	});

	it('hours format as HH:MM', () => {
		expect(fmtHour(8 * 60 + 5)).toBe('08:05');
		expect(fmtHour(0)).toBe('00:00');
		expect(fmtHour(14 * 60 + 30)).toBe('14:30');
		expect(hourDomain([])).toEqual([420, 1140]);
		expect(hourDomain([6 * 60 + 30, 21 * 60 + 10])).toEqual([360, 1320]);
		expect(hourTicks([420, 1140]).map(fmtHour)).toContain('08:00');
		expect(hourTicks([0, 1440])).toHaveLength(9);
	});
});
