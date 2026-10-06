// Exam data access. Every read and write is scoped by BOTH patient id and encounter id,
// so a request can never reach another patient's exam by guessing an id
// (the class of bug behind CVE-2026-27943 in the original form).
import type { DB } from './db.ts';
import { FIELD_BY_ID } from '#lib/exam/catalog.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { EncounterInfo, PatientHeader, PriorVisit } from '#lib/exam/types.ts';

export type { EncounterInfo, PatientHeader, PriorVisit };

export function ageOn(dob: string, on: Date = new Date()): number {
	const [y, m, d] = dob.split('-').map(Number);
	let age = on.getFullYear() - y;
	if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--;
	return age;
}

export function listPatients(db: DB) {
	return db
		.prepare(
			`SELECT p.id, p.mrn, p.legal_first, p.legal_last, p.preferred_name, p.dob,
			        (SELECT e.id FROM encounters e WHERE e.patient_id = p.id ORDER BY e.date DESC, e.id DESC LIMIT 1) AS latest_encounter
			   FROM patients p ORDER BY p.legal_last, p.legal_first`
		)
		.all() as {
		id: number;
		mrn: string;
		legal_first: string;
		legal_last: string;
		preferred_name: string | null;
		dob: string;
		latest_encounter: number | null;
	}[];
}

export function getPatientHeader(db: DB, patientId: number): PatientHeader | null {
	const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId) as
		| { id: number; mrn: string; legal_first: string; legal_last: string; preferred_name: string | null; dob: string; photo_url: string | null }
		| undefined;
	if (!p) return null;
	const allergies = db
		.prepare('SELECT title, reaction FROM allergies WHERE patient_id = ? ORDER BY title')
		.all(patientId) as { title: string; reaction: string | null }[];
	return {
		id: p.id,
		mrn: p.mrn,
		name: `${p.preferred_name ?? p.legal_first} ${p.legal_last}`,
		legalName: `${p.legal_first} ${p.legal_last}`,
		dob: p.dob,
		age: ageOn(p.dob),
		photoUrl: p.photo_url,
		allergies
	};
}

export function getEncounter(db: DB, patientId: number, encounterId: number): EncounterInfo | null {
	const e = db
		.prepare(
			`SELECT e.id, e.date, e.visit_type, e.provider_id, u.display_name
			   FROM encounters e JOIN users u ON u.id = e.provider_id
			  WHERE e.id = ? AND e.patient_id = ?`
		)
		.get(encounterId, patientId) as
		| { id: number; date: string; visit_type: string; provider_id: number; display_name: string }
		| undefined;
	if (!e) return null;
	return { id: e.id, date: e.date, visitType: e.visit_type, provider: e.display_name, providerId: e.provider_id };
}

export function getFindings(db: DB, patientId: number, encounterId: number): Findings | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const rows = db
		.prepare('SELECT field, value, is_default FROM findings WHERE encounter_id = ?')
		.all(encounterId) as { field: string; value: string; is_default: number }[];
	const out: Findings = {};
	for (const r of rows) out[r.field] = { value: r.value, isDefault: r.is_default === 1 };
	return out;
}

export function getUserDefaults(db: DB, userId: number): Record<string, string> {
	const rows = db.prepare('SELECT field, value FROM user_defaults WHERE user_id = ?').all(userId) as {
		field: string;
		value: string;
	}[];
	return Object.fromEntries(rows.map((r) => [r.field, r.value]));
}

export interface Change {
	field: string;
	value: string;
	isDefault: boolean;
}

export class ValidationError extends Error {}

export function validateChanges(input: unknown): Change[] {
	if (!input || typeof input !== 'object' || !Array.isArray((input as { changes?: unknown }).changes)) {
		throw new ValidationError('Expected { changes: [...] }');
	}
	const changes = (input as { changes: unknown[] }).changes;
	if (changes.length === 0 || changes.length > 200) throw new ValidationError('Between 1 and 200 changes per save');
	return changes.map((c) => {
		const { field, value, isDefault } = (c ?? {}) as Record<string, unknown>;
		const def = typeof field === 'string' ? FIELD_BY_ID.get(field) : undefined;
		// Only catalogued clinical fields are writable (FIX for the original's "any POSTed column").
		if (!def) throw new ValidationError(`Unknown field ${String(field)}`);
		if (typeof value !== 'string') throw new ValidationError(`Value for ${def.id} must be text`);
		if (value.length > def.maxLength) throw new ValidationError(`${def.label} is limited to ${def.maxLength} characters`);
		return { field: def.id, value, isDefault: isDefault === true };
	});
}

/** Returns the save time, or null when the encounter does not belong to the patient. */
export function saveFindings(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	changes: Change[],
	now = new Date()
): string | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const at = now.toISOString();
	const read = db.prepare('SELECT value FROM findings WHERE encounter_id = ? AND field = ?');
	const write = db.prepare(
		`INSERT INTO findings (encounter_id, field, value, is_default, updated_at, updated_by)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT (encounter_id, field) DO UPDATE SET
		   value = excluded.value, is_default = excluded.is_default,
		   updated_at = excluded.updated_at, updated_by = excluded.updated_by`
	);
	const log = db.prepare(
		`INSERT INTO finding_history (encounter_id, field, old_value, new_value, changed_at, changed_by)
		 VALUES (?, ?, ?, ?, ?, ?)`
	);
	db.exec('BEGIN');
	try {
		for (const c of changes) {
			const old = read.get(encounterId, c.field) as { value: string } | undefined;
			write.run(encounterId, c.field, c.value, c.isDefault ? 1 : 0, at, userId);
			if ((old?.value ?? '') !== c.value) log.run(encounterId, c.field, old?.value ?? null, c.value, at, userId);
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return at;
}

/**
 * Earlier visits of the SAME patient, newest first (spec §6.1): an earlier date,
 * or the same date with a lower id. Never includes the current or later visits.
 */
export function getPriors(db: DB, patientId: number, encounterId: number, limit = 20): PriorVisit[] | null {
	const current = getEncounter(db, patientId, encounterId);
	if (!current) return null;
	const rows = db
		.prepare(
			`SELECT e.id FROM encounters e
			  WHERE e.patient_id = ? AND (e.date < ? OR (e.date = ? AND e.id < ?))
			  ORDER BY e.date DESC, e.id DESC LIMIT ?`
		)
		.all(patientId, current.date, current.date, encounterId, limit) as { id: number }[];
	return rows.map(({ id }) => ({
		...getEncounter(db, patientId, id)!,
		findings: getFindings(db, patientId, id) ?? {}
	}));
}
