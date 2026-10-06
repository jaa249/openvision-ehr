import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import {
	canEditCoding,
	CodingValidationError,
	getCodingLines,
	getCodingResponse,
	getCodingState,
	getPatientStatus,
	getSuperbill,
	getVisitStatus,
	saveCodingLines,
	saveCodingState,
	setVisitStatus,
	validateCodingState,
	validateLines
} from './coding.ts';
import { EMPTY_CODING_STATE, type CptLine, type DxLine } from '#lib/coding/types.ts';

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
const dx: DxLine[] = [
	{ letter: 'A', code: 'H40.003', title: 'Glaucoma suspect' },
	{ letter: 'B', code: 'E11.9', title: 'Type 2 diabetes' }
];
const visit: CptLine = { kind: 'visit', code: '92014', description: 'Eye exam', modifiers: [], pointers: ['A', 'B'], units: 1 };
const test: CptLine = { kind: 'test', code: '92133', description: 'OCT optic nerve', modifiers: [], pointers: ['A'], units: 1 };

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

describe('coding lines (§11.4 FIX)', () => {
	it('validates structure: letters in order, ≤12 dx, ≤4 pointers, pointers must exist', () => {
		expect(validateLines({ dx, cpt: [visit] }).cpt[0].pointers).toEqual(['A', 'B']);
		const bad = (o: unknown) => expect(() => validateLines(o)).toThrow(CodingValidationError);
		bad({ dx: [{ ...dx[0], letter: 'B' }], cpt: [] });
		bad({ dx: Array.from({ length: 13 }, (_, i) => ({ letter: 'ABCDEFGHIJKLM'[i], code: `H${10 + i}.9`, title: '' })), cpt: [] });
		bad({ dx, cpt: [{ ...visit, pointers: ['A', 'B', 'A', 'B', 'A'] }] });
		bad({ dx, cpt: [{ ...visit, pointers: ['C'] }] });
		bad({ dx, cpt: [{ ...visit, code: '99013' }] });
		bad({ dx, cpt: [visit, { ...visit, code: '92012' }] });
		bad({ dx, cpt: [{ ...test, modifiers: ['5'] }] });
		bad({ dx: [{ ...dx[0], code: 'NOTACODE' }], cpt: [] });
		bad({ dx, cpt: [{ ...test, kind: 'sensorimotor' }] });
	});

	it('saves, then updates only its own unbilled lines; billed and other-source lines are untouched', () => {
		const first = saveCodingLines(db, 1, 1, 1, { dx, cpt: [visit, test] }, new Date('2026-10-06T15:00:00Z'))!;
		expect(first.dx.map((d) => d.letter + d.code)).toEqual(['AH40.003', 'BE11.9']);
		expect(first.cpt.map((l) => l.code)).toEqual(['92014', '92133']);
		expect(first.savedBy).toBe('Dr. Example');

		// Mark the OCT line billed and add a line from another (future) source.
		db.prepare("UPDATE coding_lines SET billed_at = '2026-10-07' WHERE code = '92133'").run();
		db.prepare(
			"INSERT INTO coding_lines (encounter_id, source, kind, seq, code, created_at, created_by, updated_at, updated_by) VALUES (1, 'other', 'test', 0, '76514', 'x', 1, 'x', 1)"
		).run();
		const visitId = (db.prepare("SELECT id FROM coding_lines WHERE code = '92014'").get() as { id: number }).id;

		// Second save: visit modifier added (new line), OCT dropped (but billed, so kept), dx B removed.
		const again = saveCodingLines(db, 1, 1, 1, { dx: [dx[0]], cpt: [{ ...visit, pointers: ['A'] }] }, new Date('2026-10-06T16:00:00Z'))!;
		expect(again.dx.map((d) => d.code)).toEqual(['H40.003']);
		expect(again.cpt.map((l) => l.code).sort()).toEqual(['92014', '92133']);
		expect((db.prepare("SELECT id, pointers FROM coding_lines WHERE code = '92014'").get() as { id: number; pointers: string })).toEqual({ id: visitId, pointers: 'A' });
		expect(db.prepare("SELECT COUNT(*) AS n FROM coding_lines WHERE source = 'other'").get()).toEqual({ n: 1 });

		// A wanted line that is already billed is not added twice.
		saveCodingLines(db, 1, 1, 1, { dx, cpt: [visit, test] });
		expect(db.prepare("SELECT COUNT(*) AS n FROM coding_lines WHERE code = '92133'").get()).toEqual({ n: 1 });
	});

	it('is scoped by patient AND encounter', () => {
		expect(saveCodingLines(db, 2, 1, 1, { dx, cpt: [visit] })).toBeNull();
		expect(getCodingLines(db, 2, 1)).toBeNull();
		expect(getCodingLines(db, 1, 1)).toEqual({ dx: [], cpt: [], savedAt: null, savedBy: null });
	});
});

describe('visit status (§11.5 adapted)', () => {
	it('starts in progress and records each change with the user name', () => {
		expect(getVisitStatus(db, 1, 1)).toEqual({ status: 'in_progress', history: [] });
		setVisitStatus(db, 1, 1, 1, 'coding_complete', new Date('2026-10-06T15:00:00Z'));
		const r = setVisitStatus(db, 1, 1, 1, 'checked_out', new Date('2026-10-06T15:05:00Z'))!;
		expect(r.status).toBe('checked_out');
		expect(r.history).toEqual([
			{ status: 'checked_out', changedAt: '2026-10-06T15:05:00.000Z', changedBy: 'Dr. Example' },
			{ status: 'coding_complete', changedAt: '2026-10-06T15:00:00.000Z', changedBy: 'Dr. Example' }
		]);
		// Same status again adds nothing.
		expect(setVisitStatus(db, 1, 1, 1, 'checked_out')!.history).toHaveLength(2);
	});
	it('rejects unknown statuses and wrong patients', () => {
		expect(() => setVisitStatus(db, 1, 1, 1, 'gone')).toThrow(CodingValidationError);
		expect(setVisitStatus(db, 2, 1, 1, 'checked_out')).toBeNull();
		expect(getVisitStatus(db, 2, 1)).toBeNull();
	});
});

describe('panel response', () => {
	it('bundles state, suggestion, lines and status; canEdit follows the role', () => {
		const r = getCodingResponse(db, 1, 1, 'tech')!;
		expect(r.canEdit).toBe(false);
		expect(r.patient.status).toBe('established');
		expect(r.suggestion.code).toBe('92012'); // empty exam: intermediate, established
		expect(r.status).toBe('in_progress');
		expect(getCodingResponse(db, 1, 1, 'provider')!.canEdit).toBe(true);
		expect(getCodingResponse(db, 2, 1, 'provider')).toBeNull();
	});
});

describe('superbill loader', () => {
	it('returns practice, patient, visit and saved lines through the right patient only', () => {
		saveCodingLines(db, 1, 1, 1, { dx, cpt: [visit] });
		const s = getSuperbill(db, 1, 1)!;
		expect(s.patient.mrn).toBe('000123');
		expect(s.encounter.provider).toBe('Dr. Example');
		expect(s.practice.name).toBeTruthy();
		expect(s.lines.cpt[0].code).toBe('92014');
		expect(getSuperbill(db, 2, 1)).toBeNull();
		expect(getSuperbill(db, 1, 999)).toBeNull();
		expect(getSuperbill(db, 999, 1)).toBeNull();
	});
});
