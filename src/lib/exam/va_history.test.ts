import { describe, expect, it } from 'vitest';
import type { Findings } from '#lib/shorthand/parse.ts';
import { buildVaHistory, isAfter, parseAcuity, snellenFor, vaSeries, VA_GROUPS } from './va_history.ts';

const f = (o: Record<string, string>): Findings => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));
const lm = (s: string) => parseAcuity(s).logmar;

describe('parseAcuity → logMAR', () => {
	it('Snellen feet and metres', () => {
		expect(lm('20/20')).toBe(0);
		expect(lm('20/40')).toBeCloseTo(0.3, 2);
		expect(lm('20/200')).toBe(1);
		expect(lm('20/10')).toBeCloseTo(-0.3, 2);
		expect(lm('6/6')).toBe(0);
		expect(lm('6/12')).toBeCloseTo(0.3, 2);
		expect(lm(' 20 / 25 ')).toBeCloseTo(0.1, 2);
	});

	it('plus and minus letters', () => {
		expect(lm('20/40-2')).toBeCloseTo(0.34, 2); // two letters missed: worse
		expect(lm('20/40+1')).toBeCloseTo(0.28, 2); // one extra letter: better
		expect(lm('20/20-')).toBeCloseTo(0.02, 2);
		expect(lm('20/30 +2')).toBeCloseTo(0.14, 2);
	});

	it('low vision values', () => {
		expect(lm('CF')).toBeCloseTo(1.9, 2);
		expect(lm('cf 3 ft')).toBeCloseTo(1.9, 2);
		expect(lm('Count fingers')).toBeCloseTo(1.9, 2);
		expect(lm('HM')).toBe(2.3);
		expect(lm('LP')).toBe(2.7);
		expect(lm('LP w/ projection')).toBe(2.7);
		expect(lm('NLP')).toBe(3);
	});

	it('pinhole entries (FIX: parsed too)', () => {
		expect(lm('PH 20/30')).toBeCloseTo(0.18, 2);
		expect(lm('ph:20/25-1')).toBeCloseTo(0.12, 2);
		expect(parseAcuity('NI')).toEqual({ raw: 'NI', logmar: null }); // no improvement: shown, not plotted
	});

	it('non-acuity text has no value', () => {
		expect(lm('')).toBeNull();
		expect(lm('J1')).toBeNull();
		expect(lm('unable')).toBeNull();
		expect(lm('20/0')).toBeNull();
	});

	it('Snellen equivalents for labels', () => {
		expect(snellenFor(0)).toBe('20/20');
		expect(snellenFor(0.3)).toBe('20/40');
		expect(snellenFor(1)).toBe('20/200');
		expect(snellenFor(1.9)).toBe('CF');
		expect(snellenFor(3)).toBe('NLP');
	});
});

describe('buildVaHistory', () => {
	const current = { id: 10, date: '2026-10-06', visitType: 'Follow-up', findings: f({ SCODVA: '20/40', SCOSVA: '20/30', MRODVA: '20/20' }) };
	const prior = { id: 4, date: '2025-09-14', findings: f({ SCODVA: '20/30', PHODVA: 'NI' }) };
	const older = { id: 3, date: '2024-08-02', findings: f({ SCODVA: '20/25' }) };
	const later = { id: 12, date: '2026-12-01', findings: f({ SCODVA: '20/400', CTLODVA: '20/20' }) };
	const sameDayLater = { id: 11, date: '2026-10-06', findings: f({ CRODVA: '20/20' }) };

	it('orders oldest to newest and excludes visits after this exam', () => {
		const h = buildVaHistory(current, [later, prior, sameDayLater, older]);
		expect(h.visits.map((v) => v.id)).toEqual([3, 4, 10]);
		expect(h.visits.at(-1)?.current).toBe(true);
		expect(isAfter(sameDayLater, current)).toBe(true);
	});

	it('shows only groups that have data', () => {
		const h = buildVaHistory(current, [later, prior, older]);
		expect(h.groups.map((g) => g.key)).toEqual(['SC', 'PH', 'MR']); // CTL only in the later visit
	});

	it('series hold numeric points only; NI is a gap', () => {
		const s = vaSeries(buildVaHistory(current, [prior, older]));
		const scOd = s.find((x) => x.id === 'SC-OD')!;
		expect(scOd.points.map((p) => p.visitIndex)).toEqual([0, 1, 2]);
		expect(scOd.points[2]).toMatchObject({ raw: '20/40', date: '2026-10-06' });
		expect(s.some((x) => x.id === 'PH-OD')).toBe(false);
		expect(s.find((x) => x.id === 'SC-OS')!.points).toHaveLength(1);
	});

	it('defaults: SC, CC, MR, CTL on; AR, CR, PH toggles', () => {
		expect(VA_GROUPS.filter((g) => g.defaultOn).map((g) => g.key)).toEqual(['SC', 'CC', 'MR', 'CTL']);
	});
});
