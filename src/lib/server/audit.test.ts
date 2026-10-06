import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { audit, listAudit } from './audit.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

describe('audit log', () => {
	it('stores who, what, where, when and a JSON detail', () => {
		const at = new Date('2026-10-06T15:04:05.000Z');
		const id = audit(db, { userId: 1, action: 'exam.sign', patientId: 1, encounterId: 1, detail: { contentHash: 'abc' } }, at);
		expect(id).toBeGreaterThan(0);
		expect(listAudit(db, { encounterId: 1 })).toEqual([
			{ id, at: at.toISOString(), userId: 1, action: 'exam.sign', patientId: 1, encounterId: 1, detail: { contentHash: 'abc' } }
		]);
	});

	it('filters by exam and by patient, oldest first', () => {
		audit(db, { userId: 1, action: 'exam.sign', patientId: 1, encounterId: 1 });
		audit(db, { userId: 1, action: 'exam.sign', patientId: 2, encounterId: 2 });
		audit(db, { userId: 1, action: 'exam.addendum', patientId: 1, encounterId: 1 });
		expect(listAudit(db, { encounterId: 1 }).map((r) => r.action)).toEqual(['exam.sign', 'exam.addendum']);
		expect(listAudit(db, { patientId: 2 })).toHaveLength(1);
		expect(listAudit(db)).toHaveLength(3);
		expect(listAudit(db, { patientId: 2 })[0].detail).toEqual({});
	});
});
