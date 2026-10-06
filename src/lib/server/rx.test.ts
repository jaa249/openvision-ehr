import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { createDispense, deleteDispense, listDispensed, RxValidationError, validateDispense } from './rx.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

const mr = validateDispense({ source: 'MR', rxType: '1', values: { ODSPH: '-2', ODCYL: '-0.5', ODAXIS: '90', ODADD: '2', ODPRISM: '2 bi' } });

describe('validation', () => {
	it('normalises values like the exam fields', () => {
		expect(mr.values).toEqual({ ODSPH: '-2.00', ODCYL: '-0.50', ODAXIS: '090', ODADD: '+2.00', ODPRISM: '2 BI' });
	});
	it('rejects unknown sources, keys, types and oversize values', () => {
		expect(() => validateDispense({ source: 'XX', values: {} })).toThrow(RxValidationError);
		expect(() => validateDispense({ source: 'MR', values: { DROP: 'x' } })).toThrow(RxValidationError);
		expect(() => validateDispense({ source: 'MR', rxType: '7', values: {} })).toThrow(RxValidationError);
		expect(() => validateDispense({ source: 'CTL', rxType: '1', values: {} })).toThrow(RxValidationError);
		expect(() => validateDispense({ source: 'MR', values: { COMMENTS: 'x'.repeat(2001) } })).toThrow(RxValidationError);
		expect(() => validateDispense({ source: 'MR', values: { ODSPH: 3 } })).toThrow(RxValidationError);
	});
});

describe('dispense records (spec §12.5)', () => {
	it('is created on print with the visit date, expiry and the encounter provider, and logged', () => {
		const r = createDispense(db, 1, 1, 1, mr, new Date('2026-10-06T15:00:00Z'))!;
		expect(r.duplicate).toBe(false);
		expect(r.record).toMatchObject({ source: 'MR', kind: 'MR', rxType: '1', visitDate: '2026-10-06', expiresOn: '2027-10-06', provider: 'Dr. Example' });
		expect(r.record.printedAt).toBe('2026-10-06T15:00:00.000Z');
		expect(r.record.values.ODADD).toBe('+2.00'); // FIX: ADD stored for MR
		expect((db.prepare("SELECT COUNT(*) AS n FROM print_log WHERE kind = 'print'").get() as { n: number }).n).toBe(1);
	});

	it('refuses an encounter through the wrong patient', () => {
		expect(createDispense(db, 2, 1, 1, mr)).toBeNull();
		expect(listDispensed(db, 1)).toEqual([]);
	});

	it('printing the same Rx again soon reuses the record and keeps its print date', () => {
		const a = createDispense(db, 1, 1, 1, mr, new Date('2026-10-06T15:00:00Z'))!;
		const b = createDispense(db, 1, 1, 1, mr, new Date('2026-10-06T15:05:00Z'))!;
		expect(b.duplicate).toBe(true);
		expect(b.record.id).toBe(a.record.id);
		expect(b.record.printedAt).toBe('2026-10-06T15:00:00.000Z');
		const changed = validateDispense({ source: 'MR', rxType: '1', values: { ...mr.values, ODSPH: '-2.25' } });
		expect(createDispense(db, 1, 1, 1, changed, new Date('2026-10-06T15:06:00Z'))!.duplicate).toBe(false);
		expect(createDispense(db, 1, 1, 1, mr, new Date('2026-10-06T16:00:00Z'))!.duplicate).toBe(false);
	});

	it('glasses slots are kept apart; contact lenses expire after six months', () => {
		const w2 = createDispense(db, 1, 1, 1, validateDispense({ source: 'W2', rxType: '3', values: { ODSPH: '+1' } }))!;
		expect(w2.record.source).toBe('W2');
		const ctl = createDispense(db, 1, 1, 1, validateDispense({ source: 'CTL', values: { ODSPH: '-1', ODBC: '8.6', CTLODQUANTITY: '6 boxes' } }))!;
		expect(ctl.record.expiresOn).toBe('2027-04-06');
		expect(ctl.record.values.CTLODQUANTITY).toBe('6 boxes');
	});
});

describe('dispensed history (spec §12.6)', () => {
	it('lists the patient\'s records newest first, across visits', () => {
		createDispense(db, 1, 4, 1, mr, new Date('2025-09-14T15:00:00Z'));
		createDispense(db, 1, 1, 1, validateDispense({ source: 'CTL', values: { ODSPH: '-1' } }), new Date('2026-10-06T15:00:00Z'));
		createDispense(db, 2, 2, 1, mr, new Date('2026-10-06T16:00:00Z'));
		const list = listDispensed(db, 1);
		expect(list.map((r) => [r.source, r.visitDate])).toEqual([
			['CTL', '2026-10-06'],
			['MR', '2025-09-14']
		]);
	});

	it('soft deletes only the patient\'s own record and records who deleted it', () => {
		const a = createDispense(db, 1, 1, 1, mr)!.record;
		expect(deleteDispense(db, 2, a.id, 1)).toBe(false);
		expect(listDispensed(db, 1)).toHaveLength(1);
		expect(deleteDispense(db, 1, a.id, 1, new Date('2026-10-06T17:00:00Z'))).toBe(true);
		expect(deleteDispense(db, 1, a.id, 1)).toBe(false);
		expect(listDispensed(db, 1)).toEqual([]);
		expect(db.prepare('SELECT deleted_at, deleted_by FROM rx_dispense WHERE id = ?').get(a.id)).toEqual({
			deleted_at: '2026-10-06T17:00:00.000Z',
			deleted_by: 1
		});
	});
});
