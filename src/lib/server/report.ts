// Printing: report data for one or many encounters, the mass-print list, and the print log.
import type { DB } from './db.ts';
import { getEncounter, getFindings, getPatientHeader } from './exam.ts';
import { drawingZones } from './drawings.ts';
import { getPmsfh } from './history.ts';
import { getPlanForReport } from './plan.ts';
import { getSignature } from './signing.ts';
import { MAX_EXPORT, MAX_PRINT } from '#lib/exam/print.ts';
import type { Practice, PrintableEncounter } from '#lib/exam/types.ts';

export { MAX_EXPORT, MAX_PRINT };
export type { Practice, PrintableEncounter };

export function getPractice(db: DB): Practice {
	return db.prepare('SELECT name, address, phone, fax FROM practice WHERE id = 1').get() as unknown as Practice;
}

/** One encounter, only through its own patient (same rule as the exam page). */
export function getPrintable(db: DB, patientId: number, encounterId: number): PrintableEncounter | null {
	const patient = getPatientHeader(db, patientId);
	const encounter = patient ? getEncounter(db, patientId, encounterId) : null;
	if (!patient || !encounter) return null;
	return {
		patient,
		encounter,
		findings: getFindings(db, patientId, encounterId) ?? {},
		drawingZones: drawingZones(db, encounterId),
		history: getPmsfh(db, patientId),
		plan: getPlanForReport(db, encounterId),
		signature: getSignature(db, encounterId)
	};
}

/** Many encounters by id, ordered by patient then visit date. Unknown ids are skipped. */
export function getPrintables(db: DB, encounterIds: number[], limit = MAX_PRINT): PrintableEncounter[] {
	const ids = [...new Set(encounterIds)].slice(0, limit);
	if (!ids.length) return [];
	const rows = db
		.prepare(
			`SELECT e.id, e.patient_id FROM encounters e JOIN patients p ON p.id = e.patient_id
			  WHERE e.id IN (${ids.map(() => '?').join(',')})
			  ORDER BY p.legal_last, p.legal_first, p.id, e.date, e.id`
		)
		.all(...ids) as { id: number; patient_id: number }[];
	return rows.map((r) => getPrintable(db, r.patient_id, r.id)).filter((x): x is PrintableEncounter => !!x);
}

export interface EncounterListItem {
	id: number;
	patientId: number;
	patientName: string;
	mrn: string;
	date: string;
	visitType: string;
	provider: string;
	technician: string | null;
	findingCount: number;
}

export interface EncounterFilter {
	from?: string;
	to?: string;
	query?: string; // patient name or MRN
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function listEncounters(db: DB, f: EncounterFilter, limit = 500): EncounterListItem[] {
	const where: string[] = [];
	const args: (string | number)[] = [];
	if (f.from && DATE.test(f.from)) {
		where.push('e.date >= ?');
		args.push(f.from);
	}
	if (f.to && DATE.test(f.to)) {
		where.push('e.date <= ?');
		args.push(f.to);
	}
	const q = f.query?.trim();
	if (q) {
		where.push(
			"(p.mrn = ? OR (p.legal_first || ' ' || p.legal_last) LIKE ? OR (COALESCE(p.preferred_name, '') || ' ' || p.legal_last) LIKE ?)"
		);
		const like = `%${q.replace(/[%_]/g, '')}%`;
		args.push(q, like, like);
	}
	args.push(limit);
	const rows = db
		.prepare(
			`SELECT e.id, e.patient_id, e.date, e.visit_type, u.display_name AS provider, t.display_name AS technician,
			        p.mrn, COALESCE(p.preferred_name, p.legal_first) || ' ' || p.legal_last AS name,
			        (SELECT COUNT(*) FROM findings f WHERE f.encounter_id = e.id AND f.value <> '') AS n
			   FROM encounters e
			   JOIN patients p ON p.id = e.patient_id
			   JOIN users u ON u.id = e.provider_id
			   LEFT JOIN users t ON t.id = e.technician_id
			  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			  ORDER BY e.date DESC, p.legal_last, p.legal_first, e.id DESC
			  LIMIT ?`
		)
		.all(...args) as {
		id: number;
		patient_id: number;
		date: string;
		visit_type: string;
		provider: string;
		technician: string | null;
		mrn: string;
		name: string;
		n: number;
	}[];
	return rows.map((r) => ({
		id: r.id,
		patientId: r.patient_id,
		patientName: r.name,
		mrn: r.mrn,
		date: r.date,
		visitType: r.visit_type,
		provider: r.provider,
		technician: r.technician,
		findingCount: r.n
	}));
}

export type OutputKind = 'print' | 'csv' | 'fhir';

/** Records that these encounters left the app: printed (or saved as PDF), or exported. Returns rows written. */
export function logPrint(db: DB, userId: number, encounterIds: number[], kind: OutputKind = 'print', now = new Date()): number {
	const ids = [...new Set(encounterIds)].slice(0, MAX_EXPORT);
	const exists = db.prepare('SELECT 1 FROM encounters WHERE id = ?');
	const insert = db.prepare('INSERT INTO print_log (user_id, encounter_id, printed_at, kind) VALUES (?, ?, ?, ?)');
	let n = 0;
	db.exec('BEGIN');
	try {
		for (const id of ids) {
			if (!exists.get(id)) continue;
			insert.run(userId, id, now.toISOString(), kind);
			n++;
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return n;
}

/** Parses "1,2,3" into safe positive integers. */
export function parseIds(raw: string | null): number[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isSafeInteger(n) && n > 0);
}
