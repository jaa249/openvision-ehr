// Patient and visit management. Every function is scoped by patient id (and checks
// ownership of child rows), and validates its input here, not just in the form.
import type { DB } from './db.ts';

export const VISIT_TYPES = ['Comprehensive', 'Follow-up', 'Contact lens', 'Medical eye', 'Post-op', 'Urgent'] as const;

export type FieldErrors = Record<string, string>;

/** Thrown with one message per bad field so forms can show them inline. */
export class PatientValidationError extends Error {
	errors: FieldErrors;
	constructor(errors: FieldErrors) {
		super(Object.values(errors)[0] ?? 'Invalid input');
		this.errors = errors;
	}
}

export type AllergyInput = { title: string; reaction?: string | null };
export type PatientInput = {
	legalFirst: string;
	legalLast: string;
	preferredName?: string | null;
	dob: string;
	mrn?: string | null;
};

const NAME_MAX = 60;
const MRN_MAX = 20;
const ALLERGY_TITLE_MAX = 80;
const ALLERGY_REACTION_MAX = 120;
const SEARCH_LIMIT = 200;

const CONTROL = /[\u0000-\u001f\u007f]/;

/** Today as YYYY-MM-DD in the server's local time zone (not UTC). */
export function localToday(now: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2025-02-30). */
export function isRealDate(s: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	if (y < 1900) return false;
	const dt = new Date(Date.UTC(y, mo - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function text(v: unknown): string {
	return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
}

function checkName(label: string, v: string, errors: FieldErrors, key: string, required: boolean) {
	if (!v) {
		if (required) errors[key] = `${label} is required.`;
		return;
	}
	if (v.length > NAME_MAX) errors[key] = `${label} must be ${NAME_MAX} characters or fewer.`;
	else if (CONTROL.test(v)) errors[key] = `${label} contains characters that are not allowed.`;
}

function checkDob(dob: string, errors: FieldErrors, today: string) {
	if (!dob) errors.dob = 'Date of birth is required.';
	else if (!isRealDate(dob)) errors.dob = 'Enter a real date of birth (YYYY-MM-DD, 1900 or later).';
	else if (dob > today) errors.dob = 'Date of birth cannot be in the future.';
}

function checkAllergy(a: AllergyInput, errors: FieldErrors, prefix: string): { title: string; reaction: string | null } {
	const title = text(a.title);
	const reaction = text(a.reaction);
	if (!title) errors[`${prefix}title`] = 'Substance is required.';
	else if (title.length > ALLERGY_TITLE_MAX) errors[`${prefix}title`] = `Substance must be ${ALLERGY_TITLE_MAX} characters or fewer.`;
	else if (CONTROL.test(title)) errors[`${prefix}title`] = 'Substance contains characters that are not allowed.';
	if (reaction.length > ALLERGY_REACTION_MAX) errors[`${prefix}reaction`] = `Reaction must be ${ALLERGY_REACTION_MAX} characters or fewer.`;
	else if (CONTROL.test(reaction)) errors[`${prefix}reaction`] = 'Reaction contains characters that are not allowed.';
	return { title, reaction: reaction || null };
}

function checkMrn(db: DB, mrn: string, errors: FieldErrors, exceptId: number | null) {
	if (mrn.length > MRN_MAX) errors.mrn = `MRN must be ${MRN_MAX} characters or fewer.`;
	else if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(mrn)) errors.mrn = 'MRN may use letters, numbers and hyphens only.';
	else {
		const hit = db
			.prepare('SELECT id FROM patients WHERE mrn = ? COLLATE NOCASE AND id IS NOT ?')
			.get(mrn, exceptId) as { id: number } | undefined;
		if (hit) errors.mrn = 'That MRN is already used by another patient.';
	}
}

/** Next free 6-digit MRN: one above the highest existing 6-digit number, filling gaps if full. */
export function nextMrn(db: DB): string {
	const six = "mrn GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'";
	const row = db.prepare(`SELECT MAX(CAST(mrn AS INTEGER)) AS m FROM patients WHERE ${six}`).get() as { m: number | null };
	const next = (row.m ?? 0) + 1;
	if (next <= 999999) return String(next).padStart(6, '0');
	const used = new Set((db.prepare(`SELECT mrn FROM patients WHERE ${six}`).all() as { mrn: string }[]).map((r) => r.mrn));
	for (let n = 1; n <= 999999; n++) {
		const s = String(n).padStart(6, '0');
		if (!used.has(s)) return s;
	}
	throw new Error('No free MRN left');
}

/** Creates a patient (and any allergies) in one transaction; returns the new id. */
export function createPatient(db: DB, input: PatientInput, allergies: AllergyInput[] = [], today = localToday()): number {
	const errors: FieldErrors = {};
	const legalFirst = text(input.legalFirst);
	const legalLast = text(input.legalLast);
	const preferred = text(input.preferredName);
	const dob = typeof input.dob === 'string' ? input.dob.trim() : '';
	const mrnRaw = text(input.mrn);
	checkName('Legal first name', legalFirst, errors, 'legalFirst', true);
	checkName('Legal last name', legalLast, errors, 'legalLast', true);
	checkName('Preferred name', preferred, errors, 'preferredName', false);
	checkDob(dob, errors, today);
	if (mrnRaw) checkMrn(db, mrnRaw, errors, null);
	const cleanAllergies = allergies.map((a, i) => checkAllergy(a, errors, `allergy${i}_`));
	if (Object.keys(errors).length) throw new PatientValidationError(errors);

	db.exec('BEGIN');
	try {
		const mrn = mrnRaw || nextMrn(db);
		const { lastInsertRowid } = db
			.prepare('INSERT INTO patients (mrn, legal_first, legal_last, preferred_name, dob) VALUES (?, ?, ?, ?, ?)')
			.run(mrn, legalFirst, legalLast, preferred || null, dob);
		const id = Number(lastInsertRowid);
		const ins = db.prepare('INSERT INTO allergies (patient_id, title, reaction) VALUES (?, ?, ?)');
		const seen = new Set<string>();
		for (const a of cleanAllergies) {
			const key = a.title.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			ins.run(id, a.title, a.reaction);
		}
		db.exec('COMMIT');
		return id;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

/** Updates demographics. Returns false when the patient does not exist. */
export function updatePatient(db: DB, patientId: number, input: PatientInput, today = localToday()): boolean {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return false;
	const errors: FieldErrors = {};
	const legalFirst = text(input.legalFirst);
	const legalLast = text(input.legalLast);
	const preferred = text(input.preferredName);
	const dob = typeof input.dob === 'string' ? input.dob.trim() : '';
	const mrn = text(input.mrn);
	checkName('Legal first name', legalFirst, errors, 'legalFirst', true);
	checkName('Legal last name', legalLast, errors, 'legalLast', true);
	checkName('Preferred name', preferred, errors, 'preferredName', false);
	checkDob(dob, errors, today);
	if (!mrn) errors.mrn = 'MRN is required.';
	else checkMrn(db, mrn, errors, patientId);
	if (!errors.dob) {
		const first = db.prepare('SELECT MIN(date) AS d FROM encounters WHERE patient_id = ?').get(patientId) as { d: string | null };
		if (first.d && dob > first.d) errors.dob = `Date of birth cannot be after the first visit (${first.d}).`;
	}
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	db.prepare('UPDATE patients SET mrn = ?, legal_first = ?, legal_last = ?, preferred_name = ?, dob = ? WHERE id = ?').run(
		mrn,
		legalFirst,
		legalLast,
		preferred || null,
		dob,
		patientId
	);
	return true;
}

/** Adds an allergy; returns its id, or null if the patient does not exist. A repeated substance returns the existing id. */
export function addAllergy(db: DB, patientId: number, input: AllergyInput): number | null {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return null;
	const errors: FieldErrors = {};
	const a = checkAllergy(input, errors, '');
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	const dup = db
		.prepare('SELECT id FROM allergies WHERE patient_id = ? AND title = ? COLLATE NOCASE')
		.get(patientId, a.title) as { id: number } | undefined;
	if (dup) return dup.id;
	const { lastInsertRowid } = db
		.prepare('INSERT INTO allergies (patient_id, title, reaction) VALUES (?, ?, ?)')
		.run(patientId, a.title, a.reaction);
	return Number(lastInsertRowid);
}

/** Removes an allergy only if it belongs to this patient. */
export function removeAllergy(db: DB, patientId: number, allergyId: number): boolean {
	if (!Number.isSafeInteger(allergyId)) return false;
	const r = db.prepare('DELETE FROM allergies WHERE id = ? AND patient_id = ?').run(allergyId, patientId);
	return Number(r.changes) > 0;
}

/** Starts a visit; returns the new encounter id, or null if the patient does not exist. */
export function createEncounter(
	db: DB,
	patientId: number,
	providerId: number,
	input: { date: string; visitType: string },
	today = localToday()
): number | null {
	const p = db.prepare('SELECT dob FROM patients WHERE id = ?').get(patientId) as { dob: string } | undefined;
	if (!p) return null;
	const errors: FieldErrors = {};
	const date = typeof input.date === 'string' ? input.date.trim() : '';
	if (!date) errors.date = 'Visit date is required.';
	else if (!isRealDate(date)) errors.date = 'Enter a real visit date (YYYY-MM-DD).';
	else if (date > today) errors.date = 'Visit date cannot be in the future.';
	else if (date < p.dob) errors.date = 'Visit date cannot be before the date of birth.';
	if (!(VISIT_TYPES as readonly string[]).includes(input.visitType)) errors.visitType = 'Choose a visit type.';
	if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(providerId)) errors.provider = 'Unknown provider.';
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	const { lastInsertRowid } = db
		.prepare('INSERT INTO encounters (patient_id, provider_id, date, visit_type) VALUES (?, ?, ?, ?)')
		.run(patientId, providerId, date, input.visitType);
	return Number(lastInsertRowid);
}

export type PatientRow = {
	id: number;
	mrn: string;
	legal_first: string;
	legal_last: string;
	preferred_name: string | null;
	dob: string;
	latest_encounter: number | null;
};

function likeEscape(s: string): string {
	return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Finds patients; every whitespace-separated word must match name, preferred name, MRN or DOB. Empty query lists all. */
export function searchPatients(db: DB, query: string, limit = SEARCH_LIMIT): PatientRow[] {
	const words = text(query).slice(0, 100).split(' ').filter(Boolean).slice(0, 6);
	const col = (c: string) => `${c} LIKE ? ESCAPE '\\'`;
	const where = words
		.map(() => `(${['p.legal_first', 'p.legal_last', 'p.preferred_name', 'p.mrn', 'p.dob'].map(col).join(' OR ')})`)
		.join(' AND ');
	const params = words.flatMap((w) => Array(5).fill(`%${likeEscape(w)}%`));
	return db
		.prepare(
			`SELECT p.id, p.mrn, p.legal_first, p.legal_last, p.preferred_name, p.dob,
			        (SELECT e.id FROM encounters e WHERE e.patient_id = p.id ORDER BY e.date DESC, e.id DESC LIMIT 1) AS latest_encounter
			   FROM patients p ${where ? `WHERE ${where}` : ''}
			  ORDER BY p.legal_last, p.legal_first, p.id LIMIT ?`
		)
		.all(...params, Math.max(1, Math.min(limit, 1000))) as PatientRow[];
}

export type PatientRecord = {
	id: number;
	mrn: string;
	legalFirst: string;
	legalLast: string;
	preferredName: string | null;
	dob: string;
	allergies: { id: number; title: string; reaction: string | null }[];
	visits: { id: number; date: string; visitType: string; provider: string; findingsCount: number }[];
};

/** Everything the chart page shows, or null for an unknown patient. */
export function getPatientRecord(db: DB, patientId: number): PatientRecord | null {
	const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId) as
		| { id: number; mrn: string; legal_first: string; legal_last: string; preferred_name: string | null; dob: string }
		| undefined;
	if (!p) return null;
	const allergies = db
		.prepare('SELECT id, title, reaction FROM allergies WHERE patient_id = ? ORDER BY title COLLATE NOCASE, id')
		.all(patientId) as PatientRecord['allergies'];
	const visits = (
		db
			.prepare(
				`SELECT e.id, e.date, e.visit_type, u.display_name,
				        (SELECT COUNT(*) FROM findings f WHERE f.encounter_id = e.id AND f.value <> '' AND f.is_default = 0) AS n
				   FROM encounters e JOIN users u ON u.id = e.provider_id
				  WHERE e.patient_id = ? ORDER BY e.date DESC, e.id DESC`
			)
			.all(patientId) as { id: number; date: string; visit_type: string; display_name: string; n: number }[]
	).map((v) => ({ id: v.id, date: v.date, visitType: v.visit_type, provider: v.display_name, findingsCount: v.n }));
	return {
		id: p.id,
		mrn: p.mrn,
		legalFirst: p.legal_first,
		legalLast: p.legal_last,
		preferredName: p.preferred_name,
		dob: p.dob,
		allergies,
		visits
	};
}
