// Spectacle and contact lens Rx: dispense records and history (docs/spec/BEHAVIOR.md §12.5-12.6).
// Every read and write is scoped by patient id (and encounter id where there is one), like exam.ts.
import type { DB } from './db.ts';
import { getEncounter } from './exam.ts';
import {
	DISPENSE_KEYS,
	formatAxis,
	formatPower,
	formatUpper,
	isRxSource,
	kindOf,
	rxExpiry,
	slotOf,
	type RxKind,
	type RxSource,
	type RxValues
} from '#lib/exam/sections/refraction.ts';

export class RxValidationError extends Error {}

export interface DispenseInput {
	source: RxSource;
	rxType: string;
	values: RxValues;
}

export interface DispenseRecord {
	id: number;
	encounterId: number;
	visitDate: string;
	printedAt: string;
	expiresOn: string;
	source: RxSource;
	kind: RxKind;
	rxType: string;
	values: RxValues;
	provider: string;
}

/** Normalises one value the way the exam fields are (spec §8.7); the print page may have edited it. */
function normalise(key: string, value: string): string {
	const col = key.replace(/^(OD|OS)/, '');
	if (col === 'SPH') return formatPower(value, 'sph').value;
	if (col === 'CYL') return formatPower(value, 'cyl').value;
	if (col === 'ADD' || col === 'MIDADD') return formatPower(value, 'add').value;
	if (col === 'AXIS') return formatAxis(value).value;
	if (/^(PRISM|HPD|HBASE|VPD|VBASE|MPDD|MPDN)$/.test(col) || key === 'BPDD' || key === 'BPDN') return formatUpper(value);
	return value.trim();
}

/** Only known dispense columns, as text within their limits; empty values are dropped. */
export function validateDispense(input: unknown): DispenseInput {
	if (!input || typeof input !== 'object') throw new RxValidationError('Expected { source, rxType, values }');
	const { source, rxType, values } = input as Record<string, unknown>;
	if (!isRxSource(source)) throw new RxValidationError('Unknown Rx source');
	const type = rxType ?? '';
	if (typeof type !== 'string' || !/^[0-3]?$/.test(type)) throw new RxValidationError('Rx type must be 0-3');
	if (kindOf(source) === 'CTL' && type) throw new RxValidationError('Contact lens Rx has no spectacle type');
	if (!values || typeof values !== 'object' || Array.isArray(values)) throw new RxValidationError('Expected values');
	const out: RxValues = {};
	for (const [k, raw] of Object.entries(values as Record<string, unknown>)) {
		const max = DISPENSE_KEYS[k];
		if (!max) throw new RxValidationError(`Unknown Rx value ${k}`);
		if (typeof raw !== 'string') throw new RxValidationError(`${k} must be text`);
		const v = normalise(k, raw);
		if (v.length > max) throw new RxValidationError(`${k} is limited to ${max} characters`);
		if (v) out[k] = v;
	}
	return { source, rxType: type, values: out };
}

const sorted = (v: RxValues) => JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))));

/** Printing the same Rx again within this window reuses the record instead of adding a duplicate (§12.5 FIX). */
const DEDUPE_MS = 10 * 60 * 1000;

interface Row {
	id: number;
	encounter_id: number;
	visit_date: string;
	printed_at: string;
	expires_on: string;
	reftype: RxKind;
	rx_number: number | null;
	rx_type: string;
	rx_values: string;
	provider: string;
}

const SELECT = `SELECT d.id, d.encounter_id, d.refdate AS visit_date, d.printed_at, d.expires_on, d.reftype, d.rx_number,
                       d.rx_type, d.rx_values, u.display_name AS provider
                  FROM rx_dispense d JOIN users u ON u.id = d.provider_id`;

function toRecord(r: Row): DispenseRecord {
	const source = (r.reftype === 'W' ? `W${r.rx_number ?? 1}` : r.reftype) as RxSource;
	return {
		id: r.id,
		encounterId: r.encounter_id,
		visitDate: r.visit_date,
		printedAt: r.printed_at,
		expiresOn: r.expires_on,
		source,
		kind: r.reftype,
		rxType: r.rx_type,
		values: JSON.parse(r.rx_values) as RxValues,
		provider: r.provider
	};
}

/**
 * Records a printed Rx (on Print, not on open: §12.5 FIX). The provider is the encounter's provider (§12.4 FIX);
 * `userId` is who printed. Also written to the print log. Null when the encounter is not this patient's.
 */
export function createDispense(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	input: DispenseInput,
	now = new Date()
): { record: DispenseRecord; duplicate: boolean } | null {
	const enc = getEncounter(db, patientId, encounterId);
	if (!enc) return null;
	const kind = kindOf(input.source);
	const slot = slotOf(input.source);
	const json = sorted(input.values);
	const last = db
		.prepare(
			`${SELECT} WHERE d.patient_id = ? AND d.encounter_id = ? AND d.reftype = ? AND d.rx_number IS ? AND d.printed_by = ?
			   AND d.deleted_at IS NULL ORDER BY d.id DESC LIMIT 1`
		)
		.get(patientId, encounterId, kind, slot, userId) as Row | undefined;
	if (last && last.rx_values === json && last.rx_type === input.rxType && now.getTime() - Date.parse(last.printed_at) < DEDUPE_MS) {
		return { record: toRecord(last), duplicate: true };
	}
	const at = now.toISOString();
	db.exec('BEGIN');
	let id: number;
	try {
		const res = db
			.prepare(
				`INSERT INTO rx_dispense (patient_id, encounter_id, provider_id, printed_by, printed_at, refdate, expires_on, reftype, rx_number, rx_type, rx_values)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(patientId, encounterId, enc.providerId, userId, at, enc.date, rxExpiry(enc.date, input.source), kind, slot, input.rxType, json);
		id = Number(res.lastInsertRowid);
		db.prepare("INSERT INTO print_log (user_id, encounter_id, printed_at, kind) VALUES (?, ?, ?, 'print')").run(userId, encounterId, at);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	const row = db.prepare(`${SELECT} WHERE d.id = ?`).get(id) as unknown as Row;
	return { record: toRecord(row), duplicate: false };
}

/** The patient's printed Rx, newest first (§12.6). Deleted records are left out. */
export function listDispensed(db: DB, patientId: number): DispenseRecord[] {
	const rows = db
		.prepare(`${SELECT} WHERE d.patient_id = ? AND d.deleted_at IS NULL ORDER BY d.printed_at DESC, d.id DESC`)
		.all(patientId) as unknown as Row[];
	return rows.map(toRecord);
}

/** Soft delete (FIX: delete works), recording who and when. False when it is not this patient's record. */
export function deleteDispense(db: DB, patientId: number, id: number, userId: number, now = new Date()): boolean {
	const res = db
		.prepare('UPDATE rx_dispense SET deleted_at = ?, deleted_by = ? WHERE id = ? AND patient_id = ? AND deleted_at IS NULL')
		.run(now.toISOString(), userId, id, patientId);
	return Number(res.changes) > 0;
}
