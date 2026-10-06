import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { ageOn, getEncounter, getFindings, saveFindings, validateChanges, ValidationError } from './exam.ts';

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

describe('age', () => {
	it('counts birthdays correctly', () => {
		expect(ageOn('1968-03-14', new Date(2026, 2, 13))).toBe(57);
		expect(ageOn('1968-03-14', new Date(2026, 2, 14))).toBe(58);
	});
});
