import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { getPractice, getPrintable, getPrintables, listEncounters, logPrint, MAX_PRINT, parseIds } from './report.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

describe('printable encounters', () => {
	it('single encounter only through its own patient', () => {
		expect(getPrintable(db, 1, 4)?.findings.OSCUP?.value).toBe('0.5');
		expect(getPrintable(db, 2, 4)).toBeNull();
	});

	it('mass print groups by patient, then visit date, and skips unknown ids', () => {
		const items = getPrintables(db, [1, 2, 4, 3, 999, 4]);
		expect(items.map((i) => i.encounter.id)).toEqual([3, 4, 1, 2]); // Demo (oldest first), then Sample
		expect(items[3].patient.legalName).toBe('Alexandra Sample');
	});

	it('caps one print job', () => {
		const ids = Array.from({ length: MAX_PRINT + 50 }, (_, i) => i + 1);
		expect(getPrintables(db, ids).length).toBeLessThanOrEqual(MAX_PRINT);
	});

	it('includes the patient history for the PMSFH block', () => {
		const h = getPrintable(db, 1, 1)!.history!;
		expect(h.issues.some((i) => i.type === 'POH' && i.title === 'Glaucoma suspect')).toBe(true);
		expect(h.allergyStatus.kind).toBe('listed');
		expect(getPrintable(db, 2, 2)!.history).toEqual({ issues: [], allergyStatus: { kind: 'unknown' }, family: {}, social: {} });
	});

	it('has the practice header', () => {
		expect(getPractice(db).name).toMatch(/Example Eye Care/);
	});
});

describe('encounter list for mass print', () => {
	it('filters by date range and patient', () => {
		expect(listEncounters(db, {}).map((e) => e.id)).toEqual([1, 2, 4, 3]);
		expect(listEncounters(db, { from: '2025-01-01', to: '2025-12-31' }).map((e) => e.id)).toEqual([4]);
		expect(listEncounters(db, { query: 'alex' }).map((e) => e.id)).toEqual([2]);
		expect(listEncounters(db, { query: '000123' }).map((e) => e.id)).toEqual([1, 4, 3]);
	});

	it('ignores malformed dates and wildcard characters', () => {
		expect(listEncounters(db, { from: "2025'; DROP TABLE x" }).length).toBe(4);
		expect(listEncounters(db, { query: '%' }).length).toBe(4);
	});

	it('counts recorded findings', () => {
		expect(listEncounters(db, {}).find((e) => e.id === 4)?.findingCount).toBeGreaterThan(10);
	});
});

describe('print log', () => {
	it('records real encounters once each', () => {
		expect(logPrint(db, 1, [1, 1, 4, 999])).toBe(2);
		expect((db.prepare('SELECT COUNT(*) AS n FROM print_log').get() as { n: number }).n).toBe(2);
	});
});

describe('id parsing', () => {
	it('keeps only positive integers', () => {
		expect(parseIds('1, 2,x,-3,4.5,,7')).toEqual([1, 2, 7]);
		expect(parseIds(null)).toEqual([]);
	});
});
