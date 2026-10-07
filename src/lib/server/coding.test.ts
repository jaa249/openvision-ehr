import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate, openDatabase, seedDemo, type DB } from './db.ts';
import { addItem } from './plan.ts';
import { updateCodeSettings } from './settings.ts';
import {
	canEditCoding,
	CodingValidationError,
	getCodingResponse,
	getCodingState,
	getChosenCodes,
	getPatientStatus,
	saveCodingState,
	validateCodingState
} from './coding.ts';
import { EMPTY_CODING_STATE } from '#lib/coding/types.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

/** A second user (the sign-in feature may already seed one). */
function otherUser(): number {
	const row = db.prepare('SELECT id FROM users WHERE id <> 1 LIMIT 1').get() as { id: number } | undefined;
	if (row) return row.id;
	db.prepare("INSERT INTO users (id, display_name) VALUES (2, 'Dr. Other')").run();
	return 2;
}
const state = (o: Record<string, unknown> = {}) => validateCodingState({ ...EMPTY_CODING_STATE, ...o });
describe('roles', () => {
	it('providers and admins may save coding, techs may not', () => {
		expect(canEditCoding('provider')).toBe(true);
		expect(canEditCoding('admin')).toBe(true);
		expect(canEditCoding('tech')).toBe(false);
		expect(canEditCoding(undefined)).toBe(false);
	});
});

describe('coding state', () => {
	it('defaults to an empty eye-family state and round-trips', () => {
		expect(getCodingState(db, 1, 1)).toEqual(EMPTY_CODING_STATE);
		const s = state({ visitCode: '92014', modifiers: ['25'], justifiersOff: [3], tests: [{ cpt: '92133', label: 'OCT', modifier: '', justifiers: [1, 2] }], include92060: true });
		expect(saveCodingState(db, 1, 1, 1, s, new Date('2026-10-06T15:00:00Z'))).toBe('2026-10-06T15:00:00.000Z');
		expect(getCodingState(db, 1, 1)).toEqual({ ...s, updatedAt: '2026-10-06T15:00:00.000Z', updatedBy: 'Dr. Example' });
	});
	it('is scoped by patient AND encounter', () => {
		expect(getCodingState(db, 2, 1)).toBeNull();
		expect(saveCodingState(db, 2, 1, 1, state())).toBeNull();
		expect(db.prepare('SELECT COUNT(*) AS n FROM coding_state').get()).toEqual({ n: 0 });
	});
	it('validates codes, families, modifiers and justifier counts', () => {
		const bad = (o: Record<string, unknown>) => expect(() => state(o)).toThrow(CodingValidationError);
		bad({ family: 'gp' });
		bad({ visitCode: '99013' }); // B8: no string-built codes
		bad({ visitCode: '99214' }); // E/M code while the family is eye
		bad({ modifiers: ['59'] });
		bad({ tests: [{ cpt: '92133', label: 'OCT', modifier: '', justifiers: [1, 2, 3, 4, 5] }] });
		bad({ tests: [{ cpt: 'X', label: 'OCT', modifier: '', justifiers: [] }] });
		bad({ tests: [{ cpt: '92133', label: 'a', modifier: '', justifiers: [] }, { cpt: '92133', label: 'b', modifier: '', justifiers: [] }] });
		bad({ include92060: 'yes' });
		expect(state({ family: 'em', visitCode: '99214' }).visitCode).toBe('99214');
		// The modifier box autosaves while typing: one character is fine here.
		expect(state({ tests: [{ cpt: '92133', label: 'OCT', modifier: '5', justifiers: [] }] }).tests[0].modifier).toBe('5');
	});
	it('never adds modifiers on its own (no forced 25 / 59)', () => {
		const s = state({ tests: [{ cpt: '92083', label: 'Visual field', modifier: '', justifiers: [1] }] });
		expect(s.modifiers).toEqual([]);
		expect(s.tests[0].modifier).toBe('');
	});
});

describe('new vs established from the database', () => {
	it('the demo patient was seen by the same provider in 2025: established', () => {
		expect(getPatientStatus(db, 1, 1)).toMatchObject({ status: 'established', lastVisit: '2025-09-14' });
	});
	it('the second demo patient has no earlier visit: new', () => {
		expect(getPatientStatus(db, 2, 2)!.status).toBe('new');
	});
	it('a future visit and another provider do not count', () => {
		const other = otherUser();
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (20, 2, 1, '2027-01-01', 'Follow-up')").run();
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (21, 2, ?, '2026-01-01', 'Follow-up')").run(other);
		expect(getPatientStatus(db, 2, 2)!.status).toBe('new');
		expect(getPatientStatus(db, 1, 2)).toBeNull();
	});
});

describe('panel response', () => {
	it('bundles state and suggestion (no visit status or saved lines, D46); canEdit follows the role', () => {
		const r = getCodingResponse(db, 1, 1, 'tech')!;
		expect(r.canEdit).toBe(false);
		expect(r.patient.status).toBe('established');
		expect(r.suggestion.code).toBe('92012'); // empty exam: intermediate, established
		expect(r).not.toHaveProperty('status');
		expect(r).not.toHaveProperty('statusHistory');
		expect(r).not.toHaveProperty('lines');
		expect(getCodingResponse(db, 1, 1, 'provider')!.canEdit).toBe(true);
		expect(getCodingResponse(db, 2, 1, 'provider')).toBeNull();
	});
});

describe('codes for the printed report (D46)', () => {
	const addCoded = () => {
		const a = addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'H40.003' })!;
		const b = addItem(db, 1, 1, 1, { title: 'Type 2 diabetes', codes: 'E11.9' })!;
		return [a.id, b.id];
	};
	it('nothing when nothing is chosen: a suggested but unconfirmed visit code does not count', () => {
		addCoded();
		expect(getChosenCodes(db, 1, 1)).toBeNull();
		saveCodingState(db, 1, 1, 1, state({ modifiers: ['25'] }));
		expect(getChosenCodes(db, 1, 1)).toBeNull();
	});
	it('the chosen visit code with modifiers, tests and the diagnoses in pointer order', () => {
		const [a, b] = addCoded();
		saveCodingState(
			db,
			1,
			1,
			1,
			state({ visitCode: '92014', modifiers: ['25'], justifiersOff: [b], tests: [{ cpt: '92133', label: 'OCT optic nerve', modifier: '', justifiers: [a] }] })
		);
		const c = getChosenCodes(db, 1, 1)!;
		expect(c.dx).toEqual([
			{ letter: 'A', code: 'H40.003', title: 'Glaucoma suspect' },
			{ letter: 'B', code: 'E11.9', title: 'Type 2 diabetes' }
		]);
		expect(c.cpt.map((l) => [l.kind, l.code, l.modifiers.join(' '), l.pointers.join('')])).toEqual([
			['visit', '92014', '25', 'A'],
			['test', '92133', '', 'A']
		]);
	});
	it('tests alone count; the visit line appears only once a code is chosen', () => {
		const [a] = addCoded();
		saveCodingState(db, 1, 1, 1, state({ tests: [{ cpt: '92083', label: 'Visual field', modifier: '', justifiers: [a] }] }));
		expect(getChosenCodes(db, 1, 1)!.cpt.map((l) => l.code)).toEqual(['92083']);
	});
	it('nothing with code suggestions off, or through the wrong patient', () => {
		addCoded();
		saveCodingState(db, 1, 1, 1, state({ visitCode: '92014' }));
		expect(getChosenCodes(db, 2, 1)).toBeNull();
		updateCodeSettings(db, { usBilling: false }, null);
		expect(getChosenCodes(db, 1, 1)).toBeNull();
	});
});

describe('migration (D46)', () => {
	it('drops the visit status and billing-lines tables; the chosen codes (coding_state) stay', () => {
		const probe = new DatabaseSync(':memory:');
		migrate(probe);
		const latest = (probe.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }).v;
		const tables = (d: DatabaseSync) => (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
		expect(tables(probe)).not.toContain('visit_status');
		expect(tables(probe)).not.toContain('coding_lines');
		expect(tables(probe)).toContain('coding_state');
		const raw = new DatabaseSync(':memory:');
		migrate(raw, latest - 2); // everything before billing-aid (the translations migration, D48, follows it)
		expect(tables(raw)).toEqual(expect.arrayContaining(['visit_status', 'coding_lines']));
		raw.exec("INSERT INTO users (id, display_name) VALUES (1, 'Dr. One')");
		raw.exec("INSERT INTO patients (id, mrn, legal_first, legal_last, dob) VALUES (1, '1', 'Pat', 'Test', '1950-01-01')");
		raw.exec("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (1, 1, 1, '2026-10-01', 'Urgent')");
		raw.exec(
			"INSERT INTO coding_state (encounter_id, family, visit_code, modifiers, justifiers_off, tests, include_92060, updated_at, updated_by) VALUES (1, 'eye', '92014', '[]', '[]', '[]', 0, 'x', 1)"
		);
		migrate(raw);
		expect(tables(raw)).not.toContain('visit_status');
		expect(tables(raw)).not.toContain('coding_lines');
		expect(raw.prepare('SELECT visit_code FROM coding_state WHERE encounter_id = 1').get()).toEqual({ visit_code: '92014' });
	});
});
