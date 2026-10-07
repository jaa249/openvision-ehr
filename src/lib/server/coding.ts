// Coding panel storage (spec §11): the provider's choices per exam, the coding lines this exam owns,
// and the visit status history. Every read and write is scoped by patient id AND encounter id.
import type { DB } from './db.ts';
import { getEncounter, getFindings, getPatientHeader } from './exam.ts';
import { getPractice, type Practice } from './report.ts';
import { getPlanForReport } from './plan.ts';
import {
	CPT_RE,
	DX_LETTERS,
	isDxCode,
	MAX_DX,
	MAX_POINTERS,
	MODIFIER_RE,
	SENSORIMOTOR,
	VISIT_CODE_BY_CODE,
	VISIT_MODIFIER_CODES
} from '#lib/coding/codes.ts';
import { patientStatus, suggestVisit, type VisitRef } from '#lib/coding/visit.ts';
import {
	EMPTY_CODING_STATE,
	VISIT_STATUSES,
	type CodingResponse,
	type CodingState,
	type CptLine,
	type DxLine,
	type PatientStatusResult,
	type SavedLines,
	type StatusChange,
	type TestPerformed,
	type VisitStatusId
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
		// The modifier box autosaves while typing, so 0-2 characters are accepted here; the lines check wants exactly 2.
		const modifier = text(t.modifier ?? '', `Test ${cpt} modifier`, 2).toUpperCase();
		if (!/^[0-9A-Z]{0,2}$/.test(modifier)) throw new CodingValidationError(`Test ${cpt}: modifier must be letters or digits`);
		const justifiers = idList(t.justifiers, `Test ${cpt} justifiers`, MAX_POINTERS);
		return { cpt, label: text(t.label, `Test ${cpt} label`, 200), modifier, justifiers };
	});
	if (typeof input.include92060 !== 'boolean') throw new CodingValidationError('include92060 must be true or false');
	return { family, visitCode, modifiers, justifiersOff, tests, include92060: input.include92060 };
}

/** The summary lines sent by "Save coding lines". Structure is checked here; the panel shows the clinical checks. */
export function validateLines(input: unknown): { dx: DxLine[]; cpt: CptLine[] } {
	if (!isObj(input) || !Array.isArray(input.dx) || !Array.isArray(input.cpt)) throw new CodingValidationError('Expected { dx: [...], cpt: [...] }');
	if (input.dx.length > MAX_DX) throw new CodingValidationError(`At most ${MAX_DX} diagnoses`);
	const dx: DxLine[] = input.dx.map((d, i) => {
		if (!isObj(d)) throw new CodingValidationError('Each diagnosis must be an object');
		const code = text(d.code, 'Diagnosis code', 60).toUpperCase();
		if (!isDxCode(code)) throw new CodingValidationError(`Invalid diagnosis code ${code}`);
		if (d.letter !== DX_LETTERS[i]) throw new CodingValidationError('Diagnosis letters must run A, B, C… in order');
		return { letter: DX_LETTERS[i], code, title: text(d.title ?? '', 'Diagnosis title', 300) };
	});
	if (new Set(dx.map((d) => d.code)).size !== dx.length) throw new CodingValidationError('A diagnosis is listed twice');
	const letters = new Set(dx.map((d) => d.letter));
	if (input.cpt.length > 40) throw new CodingValidationError('Too many procedure lines');
	const cpt: CptLine[] = input.cpt.map((l) => {
		if (!isObj(l)) throw new CodingValidationError('Each procedure line must be an object');
		const code = text(l.code, 'Procedure code', 5).toUpperCase();
		if (!CPT_RE.test(code)) throw new CodingValidationError(`Invalid procedure code ${code}`);
		const kind = l.kind;
		if (kind !== 'visit' && kind !== 'sensorimotor' && kind !== 'test') throw new CodingValidationError('Unknown line kind');
		if (kind === 'visit' && !VISIT_CODE_BY_CODE.has(code)) throw new CodingValidationError(`${code} is not a visit code`);
		if (kind === 'sensorimotor' && code !== SENSORIMOTOR.code) throw new CodingValidationError('Sensorimotor line must be 92060');
		if (!Array.isArray(l.modifiers) || l.modifiers.length > 4 || !l.modifiers.every((m) => typeof m === 'string' && MODIFIER_RE.test(m))) {
			throw new CodingValidationError(`${code}: up to 4 two-character modifiers`);
		}
		if (!Array.isArray(l.pointers) || l.pointers.length > MAX_POINTERS) throw new CodingValidationError(`${code}: at most ${MAX_POINTERS} diagnosis pointers`);
		for (const p of l.pointers) if (typeof p !== 'string' || !letters.has(p)) throw new CodingValidationError(`${code}: pointer ${String(p)} has no diagnosis`);
		const units = l.units ?? 1;
		if (typeof units !== 'number' || !Number.isInteger(units) || units < 1 || units > 99) throw new CodingValidationError(`${code}: units 1-99`);
		return { kind, code, description: text(l.description ?? '', `${code} description`, 300), modifiers: l.modifiers as string[], pointers: l.pointers as string[], units };
	});
	if (cpt.filter((l) => l.kind === 'visit').length > 1) throw new CodingValidationError('Only one visit code per exam');
	return { dx, cpt };
}

// ---------- state ----------

const userName = (db: DB, userId: number) =>
	(db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as { display_name: string } | undefined)?.display_name ?? `User ${userId}`;

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

// ---------- coding lines (§11.4 FIX) ----------

interface LineRow {
	id: number;
	kind: 'dx' | 'visit' | 'sensorimotor' | 'test';
	seq: number;
	code: string;
	description: string;
	modifiers: string;
	pointers: string;
	units: number;
	billed_at: string | null;
	updated_at: string;
	updated_by: number;
}

const lineKey = (kind: string, code: string, modifiers: string) => (kind === 'dx' ? `dx|${code}` : `cpt|${code}|${modifiers}`);

export function getCodingLines(db: DB, patientId: number, encounterId: number): SavedLines | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const rows = db
		.prepare("SELECT * FROM coding_lines WHERE encounter_id = ? AND source = 'exam' ORDER BY kind = 'dx' DESC, seq, id")
		.all(encounterId) as unknown as LineRow[];
	const dx = rows.filter((r) => r.kind === 'dx').map((r) => ({ letter: r.pointers, code: r.code, title: r.description }));
	const cpt: CptLine[] = rows
		.filter((r) => r.kind !== 'dx')
		.map((r) => ({
			kind: r.kind as CptLine['kind'],
			code: r.code,
			description: r.description,
			modifiers: r.modifiers ? r.modifiers.split(':') : [],
			pointers: r.pointers ? r.pointers.split('') : [],
			units: r.units
		}));
	const latest = rows.reduce<LineRow | null>((a, r) => (!a || r.updated_at > a.updated_at ? r : a), null);
	return { dx, cpt, savedAt: latest?.updated_at ?? null, savedBy: latest ? userName(db, latest.updated_by) : null };
}

/**
 * "Save coding lines": adds or updates only this exam's unbilled lines and removes its unbilled lines
 * that are no longer wanted. Billed lines and lines from any other source are never touched; a wanted
 * line that is already billed is not added again. Returns the saved lines, or null for a wrong patient.
 */
export function saveCodingLines(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	lines: { dx: DxLine[]; cpt: CptLine[] },
	now = new Date()
): SavedLines | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const at = now.toISOString();
	const existing = db.prepare("SELECT * FROM coding_lines WHERE encounter_id = ? AND source = 'exam'").all(encounterId) as unknown as LineRow[];
	const billed = new Set(existing.filter((r) => r.billed_at).map((r) => lineKey(r.kind, r.code, r.modifiers)));
	const open = new Map<string, LineRow[]>();
	for (const r of existing.filter((x) => !x.billed_at)) {
		const key = lineKey(r.kind, r.code, r.modifiers);
		open.set(key, [...(open.get(key) ?? []), r]);
	}
	const wanted = [
		...lines.dx.map((d, i) => ({ kind: 'dx' as const, seq: i, code: d.code, description: d.title, modifiers: '', pointers: d.letter, units: 1 })),
		...lines.cpt.map((l, i) => ({ kind: l.kind, seq: i, code: l.code, description: l.description, modifiers: l.modifiers.join(':'), pointers: l.pointers.join(''), units: l.units }))
	];
	const insert = db.prepare(
		`INSERT INTO coding_lines (encounter_id, source, kind, seq, code, description, modifiers, pointers, units, created_at, created_by, updated_at, updated_by)
		 VALUES (?, 'exam', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const update = db.prepare(
		'UPDATE coding_lines SET kind = ?, seq = ?, description = ?, pointers = ?, units = ?, updated_at = ?, updated_by = ? WHERE id = ? AND billed_at IS NULL'
	);
	const remove = db.prepare('DELETE FROM coding_lines WHERE id = ? AND billed_at IS NULL');
	db.exec('BEGIN');
	try {
		const kept = new Set<number>();
		for (const w of wanted) {
			const key = lineKey(w.kind, w.code, w.modifiers);
			if (billed.has(key)) continue;
			const row = open.get(key)?.find((r) => !kept.has(r.id));
			if (row) {
				kept.add(row.id);
				update.run(w.kind, w.seq, w.description, w.pointers, w.units, at, userId, row.id);
			} else {
				insert.run(encounterId, w.kind, w.seq, w.code, w.description, w.modifiers, w.pointers, w.units, at, userId, at, userId);
			}
		}
		for (const rows of open.values()) for (const row of rows) if (!kept.has(row.id)) remove.run(row.id);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return getCodingLines(db, patientId, encounterId);
}

// ---------- visit status (§11.5 adapted) ----------

export const STATUS_IDS: VisitStatusId[] = VISIT_STATUSES.map((s) => s.id);

export function getVisitStatus(db: DB, patientId: number, encounterId: number): { status: VisitStatusId; history: StatusChange[] } | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const rows = db
		.prepare('SELECT status, changed_at, changed_by_name FROM visit_status WHERE encounter_id = ? ORDER BY id DESC LIMIT 50')
		.all(encounterId) as { status: VisitStatusId; changed_at: string; changed_by_name: string }[];
	const history = rows.map((r) => ({ status: r.status, changedAt: r.changed_at, changedBy: r.changed_by_name }));
	return { status: history[0]?.status ?? 'in_progress', history };
}

/** Records a status change (nothing when it is already the current status). Null for a wrong patient. */
export function setVisitStatus(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	status: unknown,
	now = new Date()
): { status: VisitStatusId; history: StatusChange[] } | null {
	if (typeof status !== 'string' || !STATUS_IDS.includes(status as VisitStatusId)) throw new CodingValidationError('Unknown visit status');
	const current = getVisitStatus(db, patientId, encounterId);
	if (!current) return null;
	if (current.status === status && current.history.length) return current;
	db.prepare('INSERT INTO visit_status (encounter_id, status, changed_at, changed_by, changed_by_name) VALUES (?, ?, ?, ?, ?)').run(
		encounterId,
		status,
		now.toISOString(),
		userId,
		userName(db, userId)
	);
	return getVisitStatus(db, patientId, encounterId);
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
	const status = getVisitStatus(db, patientId, encounterId)!;
	return {
		state,
		suggestion,
		patient,
		lines: getCodingLines(db, patientId, encounterId)!,
		status: status.status,
		statusHistory: status.history,
		canEdit: canEditCoding(role)
	};
}

// ---------- superbill ----------

export interface Superbill {
	patient: NonNullable<ReturnType<typeof getPatientHeader>>;
	encounter: NonNullable<ReturnType<typeof getEncounter>>;
	practice: Practice;
	lines: SavedLines;
	status: VisitStatusId;
}

/** Everything the printable superbill shows, only through the visit's own patient. Null = not found. */
export function getSuperbill(db: DB, patientId: number, encounterId: number): Superbill | null {
	const patient = getPatientHeader(db, patientId);
	const encounter = patient ? getEncounter(db, patientId, encounterId) : null;
	if (!patient || !encounter) return null;
	return {
		patient,
		encounter,
		practice: getPractice(db),
		lines: getCodingLines(db, patientId, encounterId)!,
		status: getVisitStatus(db, patientId, encounterId)!.status
	};
}
