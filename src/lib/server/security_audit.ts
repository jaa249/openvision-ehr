// Security and access events for the audit trail (HIPAA Security Rule 164.312(b), audit controls).
// Rows go into the same append-only audit_log as signing and lock events: through audit() from
// audit.ts when a user is known, directly when not (a failed sign-in for an unknown username).
// Never pass a password, token or hash in `detail`.
import type { DB } from './db.ts';
import { audit, type AuditAction } from './audit.ts';

export const SECURITY_ACTIONS = [
	'auth.login',
	'auth.login_failed',
	'auth.lockout',
	'auth.logout',
	'auth.idle_timeout',
	'auth.session_expired',
	'auth.password_changed',
	'auth.password_reset',
	'auth.emergency_reset',
	'auth.setup_admin',
	'user.created',
	'user.deactivated',
	'user.reactivated',
	'user.role_changed',
	'user.renamed',
	'settings.practice',
	'settings.coding',
	'settings.codes',
	'settings.visit_types',
	'view_patient',
	'view_exam'
] as const;
export type SecurityAction = (typeof SECURITY_ACTIONS)[number];

export function securityAudit(
	db: DB,
	entry: { action: SecurityAction; userId: number | null; patientId?: number | null; encounterId?: number | null; detail?: Record<string, unknown> },
	now = new Date()
): number {
	if (entry.userId !== null) {
		// audit() types its action list for signing events; ours are a separate, documented set.
		return audit(db, { ...entry, userId: entry.userId, action: entry.action as unknown as AuditAction }, now);
	}
	const r = db
		.prepare('INSERT INTO audit_log (at, user_id, action, patient_id, encounter_id, detail) VALUES (?, NULL, ?, ?, ?, ?)')
		.run(now.toISOString(), entry.action, entry.patientId ?? null, entry.encounterId ?? null, JSON.stringify(entry.detail ?? {}));
	return Number(r.lastInsertRowid);
}

// ---------------------------------------------------------------- admin Audit log page (read-only)

export interface AuditFilter {
	userId?: number;
	patientId?: number;
	action?: string;
	/** YYYY-MM-DD, inclusive, UTC. */
	from?: string;
	to?: string;
}

export interface AuditRow {
	id: number;
	at: string;
	userId: number | null;
	user: string | null;
	action: string;
	patientId: number | null;
	patient: string | null;
	encounterId: number | null;
	detail: string;
}

export const AUDIT_PAGE_SIZE = 50;

/** Newest first, filtered, one page at a time. There is deliberately no update or delete counterpart. */
export function searchAudit(db: DB, filter: AuditFilter, page = 1, pageSize = AUDIT_PAGE_SIZE): { rows: AuditRow[]; total: number } {
	const where: string[] = [];
	const args: (string | number)[] = [];
	if (filter.userId !== undefined) {
		where.push('a.user_id = ?');
		args.push(filter.userId);
	}
	if (filter.patientId !== undefined) {
		where.push('a.patient_id = ?');
		args.push(filter.patientId);
	}
	if (filter.action) {
		where.push('a.action = ?');
		args.push(filter.action);
	}
	if (filter.from) {
		where.push('a.at >= ?');
		args.push(`${filter.from}T00:00:00.000Z`);
	}
	if (filter.to) {
		where.push('a.at <= ?');
		args.push(`${filter.to}T23:59:59.999Z`);
	}
	const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_log a ${w}`).get(...args) as { n: number }).n;
	const size = Math.max(1, Math.min(pageSize, 200));
	const offset = (Math.max(1, Math.floor(page)) - 1) * size;
	const rows = db
		.prepare(
			`SELECT a.id, a.at, a.user_id, u.display_name AS user, u.username, a.action, a.patient_id,
			        CASE WHEN p.id IS NULL THEN NULL ELSE COALESCE(p.preferred_name, p.legal_first) || ' ' || p.legal_last END AS patient,
			        a.encounter_id, a.detail
			   FROM audit_log a
			   LEFT JOIN users u ON u.id = a.user_id
			   LEFT JOIN patients p ON p.id = a.patient_id
			   ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`
		)
		.all(...args, size, offset) as {
		id: number;
		at: string;
		user_id: number | null;
		user: string | null;
		username: string | null;
		action: string;
		patient_id: number | null;
		patient: string | null;
		encounter_id: number | null;
		detail: string;
	}[];
	return {
		total,
		rows: rows.map((r) => ({
			id: r.id,
			at: r.at,
			userId: r.user_id,
			user: r.user ? (r.username ? `${r.user} (${r.username})` : r.user) : null,
			action: r.action,
			patientId: r.patient_id,
			patient: r.patient,
			encounterId: r.encounter_id,
			detail: r.detail === '{}' ? '' : r.detail
		}))
	};
}

/** Every action that appears in the log (for the filter list). */
export function auditActions(db: DB): string[] {
	const seen = (db.prepare('SELECT DISTINCT action FROM audit_log').all() as { action: string }[]).map((r) => r.action);
	return [...new Set([...SECURITY_ACTIONS, ...seen])].sort();
}
