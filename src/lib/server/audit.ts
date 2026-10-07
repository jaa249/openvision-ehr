// Audit log: who did what to which chart (lock takeovers, signing, addenda, history edits and deletes).
// Every print, PDF, CSV and FHIR export and every document view or download is recorded here too (and
// prints/exports also in print_log), so the Settings audit view shows them. Rows are only ever inserted.
import type { DB } from './db.ts';

export type AuditAction =
	| 'lock.takeover'
	| 'lock.expired_takeover'
	| 'exam.sign'
	| 'exam.addendum'
	| 'exam.staff'
	// A patient history item (issue) edited or deleted; detail names the issue and its kept version.
	| 'history.update'
	| 'history.delete'
	| OutputAction;

/**
 * Records leaving the screen or the app: a print or PDF (export.print), a CSV or FHIR download, a
 * printed Rx (rx.print), and a document opened (document.view) or downloaded (document.download).
 * Detail holds ids and counts only, never patient data.
 */
export const OUTPUT_ACTIONS = ['export.print', 'export.csv', 'export.fhir', 'rx.print', 'document.view', 'document.download'] as const;
export type OutputAction = (typeof OUTPUT_ACTIONS)[number];

export interface AuditEntry {
	id: number;
	at: string;
	userId: number;
	action: string;
	patientId: number | null;
	encounterId: number | null;
	detail: Record<string, unknown>;
}

/** Appends one audit row and returns its id. `detail` is stored as JSON. */
export function audit(
	db: DB,
	entry: { userId: number; action: AuditAction; patientId?: number | null; encounterId?: number | null; detail?: Record<string, unknown> },
	now = new Date()
): number {
	const r = db
		.prepare('INSERT INTO audit_log (at, user_id, action, patient_id, encounter_id, detail) VALUES (?, ?, ?, ?, ?, ?)')
		.run(now.toISOString(), entry.userId, entry.action, entry.patientId ?? null, entry.encounterId ?? null, JSON.stringify(entry.detail ?? {}));
	return Number(r.lastInsertRowid);
}

/** Audit rows, oldest first, optionally for one exam or one patient. */
export function listAudit(db: DB, filter: { encounterId?: number; patientId?: number } = {}): AuditEntry[] {
	const where: string[] = [];
	const args: number[] = [];
	if (filter.encounterId !== undefined) {
		where.push('encounter_id = ?');
		args.push(filter.encounterId);
	}
	if (filter.patientId !== undefined) {
		where.push('patient_id = ?');
		args.push(filter.patientId);
	}
	const rows = db
		.prepare(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`)
		.all(...args) as { id: number; at: string; user_id: number; action: string; patient_id: number | null; encounter_id: number | null; detail: string }[];
	return rows.map((r) => ({
		id: r.id,
		at: r.at,
		userId: r.user_id,
		action: r.action,
		patientId: r.patient_id,
		encounterId: r.encounter_id,
		detail: JSON.parse(r.detail) as Record<string, unknown>
	}));
}

/** A thumbnail list or a re-opened viewer loads the same file again: one "view" row per user and file per 5 minutes. */
export const DOCUMENT_VIEW_DEDUPE_MS = 5 * 60 * 1000;

/**
 * Records a patient document served to a user: document.download for ?download=1 (always), else
 * document.view (at most once per user and document per DOCUMENT_VIEW_DEDUPE_MS). Ids only: the
 * file name, category and notes are not copied into the log. Returns the row id, or null when deduped.
 */
export function logDocumentAccess(
	db: DB,
	userId: number,
	doc: { id: number; patientId: number; encounterId: number | null },
	download: boolean,
	now = new Date()
): number | null {
	const action: OutputAction = download ? 'document.download' : 'document.view';
	if (!download) {
		const since = new Date(now.getTime() - DOCUMENT_VIEW_DEDUPE_MS).toISOString();
		const seen = db
			.prepare(
				`SELECT 1 FROM audit_log WHERE user_id = ? AND action = 'document.view' AND patient_id = ? AND at >= ?
				   AND json_extract(detail, '$.document') = ? LIMIT 1`
			)
			.get(userId, doc.patientId, since, doc.id);
		if (seen) return null;
	}
	return audit(db, { userId, action, patientId: doc.patientId, encounterId: doc.encounterId, detail: { document: doc.id } }, now);
}
