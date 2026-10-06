import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import {
	addAllergy,
	createEncounter,
	createPatient,
	getPatientRecord,
	isRealDate,
	nextMrn,
	PatientValidationError,
	removeAllergy,
	searchPatients,
	updatePatient
} from './patients.ts';

const TODAY = '2026-10-06';
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
});

const base = { legalFirst: 'Riley', legalLast: 'Fictional', dob: '1980-05-20' };
const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof PatientValidationError) return e.errors;
		throw e;
	}
	return null;
};

describe('isRealDate', () => {
	it('accepts real dates and rejects impossible ones', () => {
		expect(isRealDate('2024-02-29')).toBe(true);
		expect(isRealDate('2025-02-29')).toBe(false);
		expect(isRealDate('2025-13-01')).toBe(false);
		expect(isRealDate('1899-12-31')).toBe(false);
		expect(isRealDate('05/20/1980')).toBe(false);
	});
});

describe('createPatient', () => {
	it('creates with an auto MRN and allergies, trimming input', () => {
		const id = createPatient(db, { ...base, legalFirst: '  Riley ', preferredName: ' ' }, [{ title: 'Latex', reaction: 'rash' }, { title: 'latex' }], TODAY);
		const rec = getPatientRecord(db, id)!;
		expect(rec.mrn).toBe('000125');
		expect(rec.legalFirst).toBe('Riley');
		expect(rec.preferredName).toBeNull();
		expect(rec.allergies).toHaveLength(1);
	});

	it('keeps a supplied MRN and rejects a duplicate (any case)', () => {
		createPatient(db, { ...base, mrn: 'ab-1' }, [], TODAY);
		expect(errorsOf(() => createPatient(db, { ...base, mrn: 'AB-1' }, [], TODAY))?.mrn).toMatch(/already used/);
	});

	it('reports every bad field', () => {
		const errs = errorsOf(() => createPatient(db, { legalFirst: '', legalLast: 'x'.repeat(61), dob: '2030-01-01', mrn: 'bad mrn!' }, [{ title: '' }], TODAY))!;
		expect(Object.keys(errs).sort()).toEqual(['allergy0_title', 'dob', 'legalFirst', 'legalLast', 'mrn']);
	});

	it('rejects future and impossible DOBs', () => {
		expect(errorsOf(() => createPatient(db, { ...base, dob: '2026-10-07' }, [], TODAY))?.dob).toMatch(/future/);
		expect(errorsOf(() => createPatient(db, { ...base, dob: '2001-02-30' }, [], TODAY))?.dob).toMatch(/real date/);
	});

	it('is all-or-nothing: a bad allergy creates no patient', () => {
		const count = () => (db.prepare('SELECT COUNT(*) AS n FROM patients').get() as { n: number }).n;
		const before = count();
		expect(errorsOf(() => createPatient(db, base, [{ title: 'ok' }, { title: '' }], TODAY))).not.toBeNull();
		expect(count()).toBe(before);
	});
});

describe('nextMrn', () => {
	it('increments the highest six-digit MRN and ignores other formats', () => {
		createPatient(db, { ...base, mrn: 'X-9' }, [], TODAY);
		expect(nextMrn(db)).toBe('000125');
		createPatient(db, { ...base, mrn: '000900' }, [], TODAY);
		expect(nextMrn(db)).toBe('000901');
	});
});

describe('updatePatient', () => {
	it('updates demographics and enforces MRN uniqueness against others only', () => {
		expect(updatePatient(db, 1, { legalFirst: 'Jordan', legalLast: 'Demo', preferredName: 'JD', dob: '1968-03-14', mrn: '000123' }, TODAY)).toBe(true);
		expect(getPatientRecord(db, 1)?.preferredName).toBe('JD');
		expect(errorsOf(() => updatePatient(db, 1, { ...base, mrn: '000124' }, TODAY))?.mrn).toMatch(/already used/);
	});
	it('returns false for an unknown patient and refuses a DOB after the first visit', () => {
		expect(updatePatient(db, 99, { ...base, mrn: '1' }, TODAY)).toBe(false);
		expect(errorsOf(() => updatePatient(db, 1, { ...base, mrn: '000123', dob: '2025-01-01' }, TODAY))?.dob).toMatch(/first visit/);
	});
});

describe('allergies', () => {
	it('adds, dedupes and removes, scoped to the patient', () => {
		const id = addAllergy(db, 2, { title: 'Penicillin', reaction: 'rash' })!;
		expect(addAllergy(db, 2, { title: 'penicillin' })).toBe(id);
		expect(removeAllergy(db, 1, id)).toBe(false);
		expect(getPatientRecord(db, 2)?.allergies).toHaveLength(1);
		expect(removeAllergy(db, 2, id)).toBe(true);
		expect(getPatientRecord(db, 2)?.allergies).toHaveLength(0);
	});
	it('validates and handles unknown patients', () => {
		expect(errorsOf(() => addAllergy(db, 1, { title: ' ' }))?.title).toBeTruthy();
		expect(addAllergy(db, 99, { title: 'x' })).toBeNull();
	});
});

describe('createEncounter', () => {
	it('creates a visit for the patient', () => {
		const id = createEncounter(db, 2, 1, { date: TODAY, visitType: 'Urgent' }, TODAY)!;
		const rec = getPatientRecord(db, 2)!;
		expect(rec.visits[0]).toMatchObject({ id, visitType: 'Urgent', provider: 'Dr. Example', findingsCount: 0 });
	});
	it('validates date, type, provider and patient', () => {
		const e = (date: string, visitType: string, prov = 1) => errorsOf(() => createEncounter(db, 1, prov, { date, visitType }, TODAY))!;
		expect(e('2026-10-07', 'Urgent').date).toMatch(/future/);
		expect(e('1960-01-01', 'Urgent').date).toMatch(/before the date of birth/);
		expect(e('2026-02-30', 'Urgent').date).toMatch(/real/);
		expect(e(TODAY, 'Nope').visitType).toBeTruthy();
		expect(e(TODAY, 'Urgent', 42).provider).toBeTruthy();
		expect(createEncounter(db, 99, 1, { date: TODAY, visitType: 'Urgent' }, TODAY)).toBeNull();
	});
	it('lists visits newest first with entered-findings counts', () => {
		const rec = getPatientRecord(db, 1)!;
		expect(rec.visits.map((v) => v.date)).toEqual([TODAY, '2025-09-14', '2024-08-02']);
		expect(rec.visits[1].findingsCount).toBeGreaterThan(10);
	});
});

describe('searchPatients', () => {
	it('matches name, preferred name, MRN and DOB, all words required', () => {
		const ids = (q: string) => searchPatients(db, q).map((p) => p.id);
		expect(ids('').sort()).toEqual([1, 2]);
		expect(ids('alex')).toEqual([2]);
		expect(ids('sample alexandra')).toEqual([2]);
		expect(ids('jordan sample')).toEqual([]);
		expect(ids('000123')).toEqual([1]);
		expect(ids('1991-11')).toEqual([2]);
	});
	it('treats % and _ literally', () => {
		expect(searchPatients(db, '%')).toEqual([]);
		expect(searchPatients(db, '_')).toEqual([]);
	});
});
