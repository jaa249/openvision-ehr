// Codes section storage (spec §11, a billing aid only: D46): the provider's choices per exam
// (coding_state). Nothing is saved as billing lines. Every read and write is scoped by patient id AND
// encounter id.
import type { DB } from './db.ts';
import { getEncounter, getFindings } from './exam.ts';
import { getPlanForReport, listItems } from './plan.ts';
import { usBillingOn } from './settings.ts';
import { CPT_RE, MAX_POINTERS, VISIT_CODE_BY_CODE, VISIT_MODIFIER_CODES } from '#lib/coding/codes.ts';
import { buildCoding } from '#lib/coding/lines.ts';
import { patientStatus, suggestVisit, type VisitRef } from '#lib/coding/visit.ts';
import { sensorimotorSuggested } from '#lib/exam/sections/neuro.ts';
import {
	EMPTY_CODING_STATE,
	type ChosenCodes,
	type CodingResponse,
	type CodingState,
	type PatientStatusResult,
	type TestPerformed
} from '#lib/coding/types.ts';

export class CodingValidationError extends Error {}

type Role = App.Locals['user']['role'];

/** Saving coding (state and lines) needs a provider or admin; techs can view (§11.4 FIX: a billing permission). */
export function canEditCoding(role: Role | undefined): boolean {
	return role === 'provider' || role === 'admin';
}

// ---------- validation ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

function idList(v: unknown, what: string, max: number): number[] {
	if (!Array.isArray(v) || v.length > max || !v.every(isId)) throw new CodingValidationError(`${what}: up to ${max} item ids`);
	return [...new Set(v)];
}

function text(v: unknown, what: string, max: number): string {
	if (typeof v !== 'string') throw new CodingValidationError(`${what} must be text`);
	if (v.length > max) throw new CodingValidationError(`${what} is limited to ${max} characters`);
	return v.trim();
}

export function validateCodingState(input: unknown): CodingState {
	if (!isObj(input)) throw new CodingValidationError('Expected a coding state object');
	const family = input.family;
	if (family !== 'eye' && family !== 'em') throw new CodingValidationError('Family must be eye or em');
	let visitCode: string | null = null;
	if (input.visitCode !== null && input.visitCode !== undefined) {
		const def = typeof input.visitCode === 'string' ? VISIT_CODE_BY_CODE.get(input.visitCode) : undefined;
		if (!def) throw new CodingValidationError(`Unknown visit code ${String(input.visitCode)}`);
		if (def.family !== family) throw new CodingValidationError(`${def.code} is not in the chosen code family`);
		visitCode = def.code;
	}
	if (!Array.isArray(input.modifiers) || !input.modifiers.every((m) => typeof m === 'string' && VISIT_MODIFIER_CODES.includes(m))) {
		throw new CodingValidationError('Visit modifiers must be among 22, 24, 25, 57');
	}
	const modifiers = VISIT_MODIFIER_CODES.filter((m) => (input.modifiers as string[]).includes(m));
	const justifiersOff = idList(input.justifiersOff, 'Visit justifiers', 200);
	if (!Array.isArray(input.tests) || input.tests.length > 30) throw new CodingValidationError('Up to 30 tests');
	const seen = new Set<string>();
	const tests: TestPerformed[] = input.tests.map((t) => {
		if (!isObj(t)) throw new CodingValidationError('Each test must be an object');
		const cpt = text(t.cpt, 'Test code', 5).toUpperCase();
		if (!CPT_RE.test(cpt)) throw new CodingValidationError(`Invalid test code ${cpt}`);
		if (seen.has(cpt)) throw new CodingValidationError(`Test ${cpt} is listed twice`);
		seen.add(cpt);
		// The modifier box autosaves while typing, so 0-2 characters are accepted here; the summary check wants exactly 2.
		const modifier = text(t.modifier ?? '', `Test ${cpt} modifier`, 2).toUpperCase();
		if (!/^[0-9A-Z]{0,2}$/.test(modifier)) throw new CodingValidationError(`Test ${cpt}: modifier must be letters or digits`);
		const justifiers = idList(t.justifiers, `Test ${cpt} justifiers`, MAX_POINTERS);
		return { cpt, label: text(t.label, `Test ${cpt} label`, 200), modifier, justifiers };
	});
	if (typeof input.include92060 !== 'boolean') throw new CodingValidationError('include92060 must be true or false');
	return { family, visitCode, modifiers, justifiersOff, tests, include92060: input.include92060 };
}

// ---------- state ----------

export function getCodingState(db: DB, patientId: number, encounterId: number): CodingState | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const r = db
		.prepare(
			`SELECT c.*, u.display_name FROM coding_state c LEFT JOIN users u ON u.id = c.updated_by WHERE c.encounter_id = ?`
		)
		.get(encounterId) as
		| { family: 'eye' | 'em'; visit_code: string | null; modifiers: string; justifiers_off: string; tests: string; include_92060: number; updated_at: string; display_name: string | null }
		| undefined;
	if (!r) return structuredClone(EMPTY_CODING_STATE);
	return {
		family: r.family,
		visitCode: r.visit_code,
		modifiers: JSON.parse(r.modifiers),
		justifiersOff: JSON.parse(r.justifiers_off),
		tests: JSON.parse(r.tests),
		include92060: r.include_92060 === 1,
		updatedAt: r.updated_at,
		updatedBy: r.display_name ?? undefined
	};
}

/** Returns the save time, or null when the encounter does not belong to the patient. */
export function saveCodingState(db: DB, patientId: number, encounterId: number, userId: number, state: CodingState, now = new Date()): string | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const at = now.toISOString();
	db.prepare(
		`INSERT INTO coding_state (encounter_id, family, visit_code, modifiers, justifiers_off, tests, include_92060, updated_at, updated_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (encounter_id) DO UPDATE SET
		   family = excluded.family, visit_code = excluded.visit_code, modifiers = excluded.modifiers,
		   justifiers_off = excluded.justifiers_off, tests = excluded.tests, include_92060 = excluded.include_92060,
		   updated_at = excluded.updated_at, updated_by = excluded.updated_by`
	).run(
		encounterId,
		state.family,
		state.visitCode,
		JSON.stringify(state.modifiers),
		JSON.stringify(state.justifiersOff),
		JSON.stringify(state.tests),
		state.include92060 ? 1 : 0,
		at,
		userId
	);
	return at;
}

// ---------- new vs established ----------

/** This patient's other visits (any date, any provider); patientStatus() keeps only the qualifying ones. */
export function otherVisits(db: DB, patientId: number, encounterId: number): VisitRef[] {
	return (
		db.prepare('SELECT date, provider_id FROM encounters WHERE patient_id = ? AND id <> ?').all(patientId, encounterId) as {
			date: string;
			provider_id: number;
		}[]
	).map((r) => ({ date: r.date, providerId: r.provider_id }));
}

export function getPatientStatus(db: DB, patientId: number, encounterId: number): PatientStatusResult | null {
	const e = getEncounter(db, patientId, encounterId);
	if (!e) return null;
	return patientStatus({ date: e.date, providerId: e.providerId }, otherVisits(db, patientId, encounterId));
}

// ---------- the panel's GET ----------

export function getCodingResponse(db: DB, patientId: number, encounterId: number, role: Role | undefined): CodingResponse | null {
	const state = getCodingState(db, patientId, encounterId);
	if (!state) return null;
	const patient = getPatientStatus(db, patientId, encounterId)!;
	const plan = getPlanForReport(db, encounterId);
	const suggestion = suggestVisit({
		findings: getFindings(db, patientId, encounterId) ?? {},
		items: plan?.items ?? [],
		orders: plan?.orders ?? [],
		patient
	});
	return {
		state,
		suggestion,
		patient,
		canEdit: canEditCoding(role)
	};
}

// ---------- the printed report's code block (D46) ----------

/**
 * The codes the provider chose, for the report's "Codes for your billing system" block. A suggested
 * but unconfirmed visit code does not count; tests (and 92060 when the findings support it) do.
 * Null when code suggestions are off (D45), the pair is wrong, or nothing is chosen.
 */
export function getChosenCodes(db: DB, patientId: number, encounterId: number): ChosenCodes | null {
	if (!usBillingOn(db)) return null;
	const state = getCodingState(db, patientId, encounterId);
	if (!state) return null;
	const sensorimotor = sensorimotorSuggested(getFindings(db, patientId, encounterId) ?? {});
	if (!state.visitCode && !state.tests.length && !(state.include92060 && sensorimotor)) return null;
	const items = (listItems(db, patientId, encounterId) ?? []).map((i) => ({ id: i.id, title: i.title, codes: i.codes }));
	// suggestedCode '' = only a chosen visit code makes a visit line; the summary checks are for the panel.
	const { dx, cpt } = buildCoding({ state, suggestedCode: '', items, sensorimotor });
	return { dx, cpt };
}
