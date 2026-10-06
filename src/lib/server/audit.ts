// Audit log: who did what to which chart (lock takeovers, signing, addenda).
// Prints and exports have their own log (print_log). Rows are only ever inserted.
import type { DB } from './db.ts';

export type AuditAction = 'lock.takeover' | 'lock.expired_takeover' | 'exam.sign' | 'exam.addendum';

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
