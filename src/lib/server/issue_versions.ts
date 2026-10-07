// History items (issues) are never overwritten or removed without a trace (0.1.0 review):
// an edit keeps the previous contents in issue_versions, a delete marks the row deleted (soft delete) and
// keeps it there too, and both are audited. Family/social history are versioned the same way (D28).
// The caller holds the transaction, so the version, the change and the audit row land together.
import type { DB } from './db.ts';
import { audit } from './audit.ts';

/** A full issues row, as stored. */
export type IssueRecord = Record<string, unknown> & { id: number; patient_id: number; type: string };

/** One earlier version of an issue: the row as it was before `action`, by whom and when. */
export interface IssueVersion {
	id: number;
	issueId: number;
	action: 'update' | 'delete';
	changedAt: string;
	changedBy: number;
	data: IssueRecord;
}

/** Columns that change on every save without changing what the item says. */
const BOOKKEEPING = new Set(['updated_at', 'updated_by']);

/** The live (not deleted) issue row of this patient, or undefined. */
export function liveIssueRow(db: DB, patientId: number, issueId: number): IssueRecord | undefined {
	return db.prepare('SELECT * FROM issues WHERE id = ? AND patient_id = ? AND deleted_at IS NULL').get(issueId, patientId) as
		| IssueRecord
		| undefined;
}

function insertVersion(db: DB, before: IssueRecord, action: 'update' | 'delete', userId: number, at: string): number {
	const r = db
		.prepare('INSERT INTO issue_versions (issue_id, patient_id, action, changed_at, changed_by, data) VALUES (?, ?, ?, ?, ?, ?)')
		.run(before.id, before.patient_id, action, at, userId, JSON.stringify(before));
	return Number(r.lastInsertRowid);
}

/**
 * Call after an UPDATE of an issue with the row as it was before. When anything other than the
 * updated_at/by bookkeeping changed, the previous contents become a version and the edit is audited.
 * Returns the version id, or null when nothing changed.
 */
export function recordIssueEdit(
	db: DB,
	before: IssueRecord,
	userId: number,
	now: Date,
	encounterId: number | null = null
): number | null {
	const after = db.prepare('SELECT * FROM issues WHERE id = ?').get(before.id) as IssueRecord | undefined;
	if (!after) return null;
	const changed = Object.keys(after).some((k) => !BOOKKEEPING.has(k) && after[k] !== before[k]);
	if (!changed) return null;
	const versionId = insertVersion(db, before, 'update', userId, now.toISOString());
	audit(db, { userId, action: 'history.update', patientId: before.patient_id, encounterId, detail: { issueId: before.id, type: before.type, versionId } }, now);
	return versionId;
}

/**
 * Marks a live issue of this patient deleted (it disappears from every list but stays in the table),
 * keeping its contents as a version, and audits it. False when there is no such live issue.
 * `type` limits the delete to one issue type (the chart's allergy list).
 */
export function softDeleteIssue(
	db: DB,
	patientId: number,
	issueId: number,
	userId: number,
	now: Date,
	opts: { type?: string; encounterId?: number | null } = {}
): boolean {
	if (!Number.isSafeInteger(issueId)) return false;
	const before = liveIssueRow(db, patientId, issueId);
	if (!before || (opts.type && before.type !== opts.type)) return false;
	const at = now.toISOString();
	const versionId = insertVersion(db, before, 'delete', userId, at);
	db.prepare('UPDATE issues SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL').run(at, userId, issueId);
	audit(
		db,
		{ userId, action: 'history.delete', patientId, encounterId: opts.encounterId ?? null, detail: { issueId, type: before.type, versionId } },
		now
	);
	return true;
}

/** Earlier versions of one issue of this patient (deleted or not), oldest first. */
export function listIssueVersions(db: DB, patientId: number, issueId: number): IssueVersion[] {
	const rows = db
		.prepare('SELECT * FROM issue_versions WHERE issue_id = ? AND patient_id = ? ORDER BY id')
		.all(issueId, patientId) as { id: number; issue_id: number; action: 'update' | 'delete'; changed_at: string; changed_by: number; data: string }[];
	return rows.map((r) => ({
		id: r.id,
		issueId: r.issue_id,
		action: r.action,
		changedAt: r.changed_at,
		changedBy: r.changed_by,
		data: JSON.parse(r.data) as IssueRecord
	}));
}

/** Runs `fn` in its own transaction (callers that already hold one call the helpers above directly). */
export function inTransaction<T>(db: DB, fn: () => T): T {
	db.exec('BEGIN');
	try {
		const out = fn();
		db.exec('COMMIT');
		return out;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}
