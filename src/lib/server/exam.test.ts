import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { ageOn, getEncounter, getFindings, getPatientHeader, getPriors, saveFindings, validateChanges, ValidationError } from './exam.ts';
import { getQuickPicks } from './quickpicks.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

describe('patient ownership (cross-patient access is impossible)', () => {
	it('finds an encounter only under its own patient', () => {
		expect(getEncounter(db, 1, 1)?.visitType).toBe('Comprehensive');
		expect(getEncounter(db, 2, 1)).toBeNull();
		expect(getFindings(db, 2, 1)).toBeNull();
	});

	it('refuses to save to an encounter through the wrong patient', () => {
		const changes = [{ field: 'ODCONJ', value: 'quiet', isDefault: false }];
		expect(saveFindings(db, 2, 1, 1, changes)).toBeNull();
		expect(getFindings(db, 1, 1)).toEqual({});
	});
});

describe('saving', () => {
	it('upserts values, keeps the default marker, and records history', () => {
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: 'quiet', isDefault: true }]);
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: '1+ injection', isDefault: false }]);
		expect(getFindings(db, 1, 1)).toEqual({ ODCONJ: { value: '1+ injection', isDefault: false } });
		const hist = db.prepare('SELECT old_value, new_value FROM finding_history ORDER BY id').all();
		expect(hist).toEqual([
			{ old_value: null, new_value: 'quiet' },
			{ old_value: 'quiet', new_value: '1+ injection' }
		]);
	});

	it('does not log a history row when the value is unchanged', () => {
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: 'quiet', isDefault: true }]);
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: 'quiet', isDefault: false }]);
		expect((db.prepare('SELECT COUNT(*) AS n FROM finding_history').get() as { n: number }).n).toBe(1);
	});
});

describe('validation', () => {
	it('accepts catalogued fields only', () => {
		expect(() => validateChanges({ changes: [{ field: 'pid', value: '2' }] })).toThrow(ValidationError);
		expect(() => validateChanges({ changes: [{ field: 'ODCONJ', value: 5 }] })).toThrow(ValidationError);
		expect(() => validateChanges({ changes: [] })).toThrow(ValidationError);
		expect(() => validateChanges(null)).toThrow(ValidationError);
		expect(() => validateChanges({ changes: [{ field: 'ODTBUT', value: 'x'.repeat(26) }] })).toThrow(/limited/);
		expect(validateChanges({ changes: [{ field: 'ODCONJ', value: 'quiet', isDefault: true }] })).toEqual([
			{ field: 'ODCONJ', value: 'quiet', isDefault: true }
		]);
	});
});

describe('prior visits', () => {
	it('lists earlier visits of the same patient, newest first, with their findings', () => {
		const priors = getPriors(db, 1, 1)!;
		expect(priors.map((p) => p.date)).toEqual(['2025-09-14', '2024-08-02']);
		expect(priors[0].findings.OSCUP).toEqual({ value: '0.5', isDefault: false });
	});
	it('never includes the current visit, later visits, or another patient', () => {
		expect(getPriors(db, 1, 3)).toEqual([]); // the oldest visit has no priors
		expect(getPriors(db, 1, 4)!.map((p) => p.id)).toEqual([3]);
		expect(getPriors(db, 2, 2)).toEqual([]);
		expect(getPriors(db, 2, 1)).toBeNull(); // wrong patient for the encounter
	});
	it('same-day visits order by id', () => {
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (9, 1, 1, '2026-10-06', 'Follow-up')").run();
		expect(getPriors(db, 1, 9)!.map((p) => p.id)).toEqual([1, 4, 3]);
		expect(getPriors(db, 1, 1)!.map((p) => p.id)).toEqual([4, 3]);
	});
});

describe('quick picks', () => {
	it('seeds a provider list on first use, once', () => {
		const first = getQuickPicks(db, 1);
		expect(first.length).toBeGreaterThan(50);
		expect(getQuickPicks(db, 1).length).toBe(first.length);
		expect(first.find((p) => p.zone === 'ANTSEG' && p.label === 'quiet')?.mode).toBe('replace');
	});
});

describe('patient header', () => {
	it('carries the allergy status, never an empty list that reads as NKDA', () => {
		expect(getPatientHeader(db, 1)?.allergyStatus).toEqual({ kind: 'listed', allergies: [{ title: 'Sulfa', reaction: 'hives' }] });
		expect(getPatientHeader(db, 2)?.allergyStatus).toEqual({ kind: 'unknown' });
		expect(getPatientHeader(db, 99)).toBeNull();
	});
});

describe('age', () => {
	it('counts birthdays correctly', () => {
		expect(ageOn('1968-03-14', new Date(2026, 2, 13))).toBe(57);
		expect(ageOn('1968-03-14', new Date(2026, 2, 14))).toBe(58);
	});
});
