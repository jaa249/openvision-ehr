// Patient and visit management. Every function is scoped by patient id (and checks
// ownership of child rows), and validates its input here, not just in the form.
import type { DB } from './db.ts';
import { allergyStatus } from '#lib/history/summary.ts';
import type { AllergyStatus } from '#lib/history/types.ts';

/** Starter visit types: seeds the visit_types table (admins edit the list in Settings > Visit types). */
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
export type CreatePatientOptions = {
	/** The "No known allergies" box on the new-patient form; recorded with who and when. */
	noKnownAllergies?: boolean;
	userId?: number | null;
	now?: Date;
};
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

/**
 * Creates a patient (and any allergies, or a "No known allergies" confirmation) in one transaction;
 * returns the new id. Ticking NKDA and entering allergies together is rejected.
 */
export function createPatient(
	db: DB,
	input: PatientInput,
	allergies: AllergyInput[] = [],
	today = localToday(),
	options: CreatePatientOptions = {}
): number {
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
	if (options.noKnownAllergies && allergies.length) {
		errors.nkda = 'Tick "No known allergies" or enter allergies, not both.';
	}
	if (Object.keys(errors).length) throw new PatientValidationError(errors);

	const userId = options.userId ?? null;
	const at = (options.now ?? new Date()).toISOString();
	db.exec('BEGIN');
	try {
		const mrn = mrnRaw || nextMrn(db);
		const { lastInsertRowid } = db
			.prepare('INSERT INTO patients (mrn, legal_first, legal_last, preferred_name, dob) VALUES (?, ?, ?, ?, ?)')
			.run(mrn, legalFirst, legalLast, preferred || null, dob);
		const id = Number(lastInsertRowid);
		const seen = new Set<string>();
		for (const a of cleanAllergies) {
			const key = a.title.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			insertAllergy(db, id, a, userId, at);
		}
		if (options.noKnownAllergies && userId !== null) {
			db.prepare('UPDATE patients SET allergies_none_at = ?, allergies_none_by = ? WHERE id = ?').run(at, userId, id);
		}
		db.exec('COMMIT');
		return id;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

function insertAllergy(db: DB, patientId: number, a: { title: string; reaction: string | null }, userId: number | null, at: string): number {
	const { lastInsertRowid } = db
		.prepare(
			`INSERT INTO issues (patient_id, type, title, reaction, created_at, created_by, updated_at, updated_by)
			 VALUES (?, 'ALLERGY', ?, ?, ?, ?, ?, ?)`
		)
		.run(patientId, a.title, a.reaction ?? '', at, userId, at, userId);
	// An active allergy replaces any "No known allergies" confirmation.
	clearNoKnownAllergies(db, patientId);
	return Number(lastInsertRowid);
}

/** Drops the NKDA confirmation (an allergy was added, or someone unticked the box). */
export function clearNoKnownAllergies(db: DB, patientId: number): void {
	db.prepare('UPDATE patients SET allergies_none_at = NULL, allergies_none_by = NULL WHERE id = ?').run(patientId);
}

/** Active allergies (blank or future end date), alphabetical. */
export function activeAllergies(db: DB, patientId: number, today = localToday()) {
	return (
		db
			.prepare(
				`SELECT id, title, reaction FROM issues
				  WHERE patient_id = ? AND type = 'ALLERGY' AND (end_date = '' OR end_date > ?)
				  ORDER BY title COLLATE NOCASE, id`
			)
			.all(patientId, today) as { id: number; title: string; reaction: string }[]
	).map((a) => ({ id: a.id, title: a.title, reaction: a.reaction || null }));
}

/** unknown / none (confirmed by whom, when) / listed: shared by the banner, chart, report and export. */
export function readAllergyStatus(db: DB, patientId: number, today = localToday()): AllergyStatus {
	const p = db
		.prepare(
			`SELECT p.allergies_none_at AS at, u.display_name AS name
			   FROM patients p LEFT JOIN users u ON u.id = p.allergies_none_by WHERE p.id = ?`
		)
		.get(patientId) as { at: string | null; name: string | null } | undefined;
	const active = activeAllergies(db, patientId, today).map(({ title, reaction }) => ({ title, reaction }));
	return allergyStatus(active, p?.at ? { by: p.name ?? 'Unknown user', at: p.at } : null);
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

/**
 * Adds an allergy; returns its id, or null if the patient does not exist. A repeated substance returns
 * the existing id. Adding clears any "No known allergies" confirmation.
 */
export function addAllergy(db: DB, patientId: number, input: AllergyInput, userId: number | null = null, now = new Date()): number | null {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return null;
	const errors: FieldErrors = {};
	const a = checkAllergy(input, errors, '');
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	const dup = db
		.prepare("SELECT id FROM issues WHERE patient_id = ? AND type = 'ALLERGY' AND title = ? COLLATE NOCASE")
		.get(patientId, a.title) as { id: number } | undefined;
	if (dup) return dup.id;
	return insertAllergy(db, patientId, a, userId, now.toISOString());
}

/** Removes an allergy only if it belongs to this patient. The last one gone means "not recorded", never NKDA. */
export function removeAllergy(db: DB, patientId: number, allergyId: number): boolean {
	if (!Number.isSafeInteger(allergyId)) return false;
	const r = db.prepare("DELETE FROM issues WHERE id = ? AND patient_id = ? AND type = 'ALLERGY'").run(allergyId, patientId);
	return Number(r.changes) > 0;
}

/**
 * Ticks or unticks "No known allergies". Ticking while active allergies exist is refused (they must be
 * removed first). Returns false for an unknown patient.
 */
export function setNoKnownAllergies(db: DB, patientId: number, userId: number, on: boolean, now = new Date()): boolean {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return false;
	if (!on) {
		clearNoKnownAllergies(db, patientId);
		return true;
	}
	if (activeAllergies(db, patientId, localToday(now)).length) {
		throw new PatientValidationError({
			nkda: 'This patient has active allergies. Remove them before marking "No known allergies".'
		});
	}
	db.prepare('UPDATE patients SET allergies_none_at = ?, allergies_none_by = ? WHERE id = ?').run(now.toISOString(), userId, patientId);
	return true;
}

/** Who was involved in a visit (decision D43). */
export type VisitStaff = {
	/** The provider who authorizes the visit and signs it; must be an active provider account. */
	providerId: number;
	/** The technician who worked it up; null when none did. */
	technicianId?: number | null;
};

export type StaffOption = { id: number; displayName: string };

/** Active provider accounts, for "Provider" pickers. */
export function activeProviders(db: DB): StaffOption[] {
	return (db.prepare("SELECT id, display_name FROM users WHERE role = 'provider' AND active = 1 ORDER BY display_name, id").all() as { id: number; display_name: string }[]).map(
		(r) => ({ id: r.id, displayName: r.display_name })
	);
}

/** Active technician accounts, for "Technician" pickers. */
export function activeTechnicians(db: DB): StaffOption[] {
	return (db.prepare("SELECT id, display_name FROM users WHERE role = 'tech' AND active = 1 ORDER BY display_name, id").all() as { id: number; display_name: string }[]).map(
		(r) => ({ id: r.id, displayName: r.display_name })
	);
}

function staffErrors(db: DB, staff: VisitStaff): FieldErrors {
	const errors: FieldErrors = {};
	const role = (id: unknown) =>
		Number.isSafeInteger(id) ? (db.prepare('SELECT role FROM users WHERE id = ? AND active = 1').get(id as number) as { role: string } | undefined)?.role : undefined;
	if (role(staff.providerId) !== 'provider') errors.provider = 'Choose the provider for this visit.';
	if (staff.technicianId != null && role(staff.technicianId) !== 'tech') errors.technician = 'Choose a technician from the list, or none.';
	return errors;
}

/**
 * Starts a visit; returns the new encounter id, or null if the patient does not exist.
 * `staff` is the provider id, or the provider and technician (D43).
 */
export function createEncounter(
	db: DB,
	patientId: number,
	staff: number | VisitStaff,
	input: { date: string; visitType: string },
	today = localToday()
): number | null {
	const p = db.prepare('SELECT dob FROM patients WHERE id = ?').get(patientId) as { dob: string } | undefined;
	if (!p) return null;
	const people: VisitStaff = typeof staff === 'number' ? { providerId: staff } : staff;
	const errors: FieldErrors = {};
	const date = typeof input.date === 'string' ? input.date.trim() : '';
	if (!date) errors.date = 'Visit date is required.';
	else if (!isRealDate(date)) errors.date = 'Enter a real visit date (YYYY-MM-DD).';
	else if (date > today) errors.date = 'Visit date cannot be in the future.';
	else if (date < p.dob) errors.date = 'Visit date cannot be before the date of birth.';
	if (!activeVisitTypeNames(db).includes(input.visitType)) errors.visitType = 'Choose a visit type.';
	Object.assign(errors, staffErrors(db, people));
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	const { lastInsertRowid } = db
		.prepare('INSERT INTO encounters (patient_id, provider_id, technician_id, date, visit_type) VALUES (?, ?, ?, ?, ?)')
		.run(patientId, people.providerId, people.technicianId ?? null, date, input.visitType);
	return Number(lastInsertRowid);
}

/**
 * Changes a visit's provider and technician (before signing; callers check the edit lock, and a
 * trigger refuses it on a signed exam). Returns false when the visit is not this patient's.
 */
export function setVisitStaff(db: DB, patientId: number, encounterId: number, staff: VisitStaff): boolean {
	const row = db.prepare('SELECT 1 FROM encounters WHERE id = ? AND patient_id = ?').get(encounterId, patientId);
	if (!row) return false;
	const errors = staffErrors(db, staff);
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	db.prepare('UPDATE encounters SET provider_id = ?, technician_id = ? WHERE id = ?').run(staff.providerId, staff.technicianId ?? null, encounterId);
	return true;
}

/** A technician who changes a visit with no technician yet becomes its technician (D43). */
export function noteTechnician(db: DB, encounterId: number, user: { id: number; role: string } | null | undefined): void {
	if (user?.role !== 'tech') return;
	db.prepare(
		'UPDATE encounters SET technician_id = ? WHERE id = ? AND technician_id IS NULL AND NOT EXISTS (SELECT 1 FROM exam_signatures WHERE encounter_id = encounters.id)'
	).run(user.id, encounterId);
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
	/** Active allergies, with ids for the chart's Remove buttons. */
	allergies: { id: number; title: string; reaction: string | null }[];
	allergyStatus: AllergyStatus;
	visits: { id: number; date: string; visitType: string; provider: string; technician: string | null; findingsCount: number }[];
};

/** Everything the chart page shows, or null for an unknown patient. */
export function getPatientRecord(db: DB, patientId: number): PatientRecord | null {
	const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId) as
		| { id: number; mrn: string; legal_first: string; legal_last: string; preferred_name: string | null; dob: string }
		| undefined;
	if (!p) return null;
	const allergies = activeAllergies(db, patientId);
	const status = readAllergyStatus(db, patientId);
	const visits = (
		db
			.prepare(
				`SELECT e.id, e.date, e.visit_type, u.display_name, t.display_name AS technician,
				        (SELECT COUNT(*) FROM findings f WHERE f.encounter_id = e.id AND f.value <> '' AND f.is_default = 0) AS n
				   FROM encounters e JOIN users u ON u.id = e.provider_id LEFT JOIN users t ON t.id = e.technician_id
				  WHERE e.patient_id = ? ORDER BY e.date DESC, e.id DESC`
			)
			.all(patientId) as { id: number; date: string; visit_type: string; display_name: string; technician: string | null; n: number }[]
	).map((v) => ({ id: v.id, date: v.date, visitType: v.visit_type, provider: v.display_name, technician: v.technician, findingsCount: v.n }));
	return {
		id: p.id,
		mrn: p.mrn,
		legalFirst: p.legal_first,
		legalLast: p.legal_last,
		preferredName: p.preferred_name,
		dob: p.dob,
		allergies,
		allergyStatus: status,
		visits
	};
}

// ---------------------------------------------------------------- visit types (admin-editable list)

export type VisitType = { id: number; name: string; active: boolean };
const VISIT_TYPE_MAX = 40;

/** All visit types in display order; inactive ones are hidden from the new-visit form but kept for history. */
export function listVisitTypes(db: DB): VisitType[] {
	return (db.prepare('SELECT id, name, active FROM visit_types ORDER BY seq, id').all() as { id: number; name: string; active: number }[]).map(
		(r) => ({ id: r.id, name: r.name, active: r.active === 1 })
	);
}

/** Names offered on the new-visit form, in order. */
export function activeVisitTypeNames(db: DB): string[] {
	return (db.prepare('SELECT name FROM visit_types WHERE active = 1 ORDER BY seq, id').all() as { name: string }[]).map((r) => r.name);
}

function checkVisitTypeName(db: DB, raw: unknown, exceptId: number | null): string {
	const name = text(raw);
	const errors: FieldErrors = {};
	if (!name) errors.name = 'Name is required.';
	else if (name.length > VISIT_TYPE_MAX) errors.name = `Name must be ${VISIT_TYPE_MAX} characters or fewer.`;
	else if (CONTROL.test(name)) errors.name = 'Name contains characters that are not allowed.';
	else if (db.prepare('SELECT 1 FROM visit_types WHERE name = ? COLLATE NOCASE AND id IS NOT ?').get(name, exceptId)) {
		errors.name = 'That visit type already exists.';
	}
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	return name;
}

export function addVisitType(db: DB, name: string): number {
	const clean = checkVisitTypeName(db, name, null);
	const { m } = db.prepare('SELECT COALESCE(MAX(seq), -1) AS m FROM visit_types').get() as { m: number };
	return Number(db.prepare('INSERT INTO visit_types (name, seq) VALUES (?, ?)').run(clean, m + 1).lastInsertRowid);
}

/** Renames a type. Past visits keep the name they were recorded with. */
export function renameVisitType(db: DB, id: number, name: string): boolean {
	if (!db.prepare('SELECT 1 FROM visit_types WHERE id = ?').get(id)) return false;
	db.prepare('UPDATE visit_types SET name = ? WHERE id = ?').run(checkVisitTypeName(db, name, id), id);
	return true;
}

/** Hides or shows a type on the new-visit form; at least one must stay active. */
export function setVisitTypeActive(db: DB, id: number, active: boolean): boolean {
	const row = db.prepare('SELECT active FROM visit_types WHERE id = ?').get(id) as { active: number } | undefined;
	if (!row) return false;
	if (!active && row.active === 1 && activeVisitTypeNames(db).length <= 1) {
		throw new PatientValidationError({ form: 'Keep at least one visit type available.' });
	}
	db.prepare('UPDATE visit_types SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
	return true;
}

/** Moves a type one place up (-1) or down (+1). */
export function moveVisitType(db: DB, id: number, dir: -1 | 1): boolean {
	const ids = listVisitTypes(db).map((t) => t.id);
	const i = ids.indexOf(id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= ids.length) return false;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	const up = db.prepare('UPDATE visit_types SET seq = ? WHERE id = ?');
	db.exec('BEGIN');
	try {
		ids.forEach((tid, seq) => up.run(seq, tid));
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return true;
}
