import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { isRealDate } from '#lib/server/patients.ts';
import { listUsers } from '#lib/server/users.ts';
import { AUDIT_PAGE_SIZE, auditActions, OUTPUT_GROUP, searchAudit, type AuditFilter } from '#lib/server/security_audit.ts';
import type { PageServerLoad } from './$types';

// Admin only, read-only: there is no edit or delete anywhere (the table refuses both, see migrations/auth.ts).
export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals, 'admin');
	const db = getDb();
	const q = url.searchParams;
	const errors: Record<string, string> = {};
	const filter: AuditFilter = {};
	const raw = { user: q.get('user') ?? '', patient: (q.get('patient') ?? '').trim().slice(0, 30), action: q.get('action') ?? '', from: q.get('from') ?? '', to: q.get('to') ?? '' };

	if (raw.user) {
		const id = Number(raw.user);
		if (Number.isSafeInteger(id)) filter.userId = id;
	}
	if (raw.patient) {
		// MRN first, then internal id.
		const hit = db.prepare('SELECT id FROM patients WHERE mrn = ? COLLATE NOCASE UNION ALL SELECT id FROM patients WHERE CAST(id AS TEXT) = ? LIMIT 1').get(raw.patient, raw.patient) as
			| { id: number }
			| undefined;
		if (hit) filter.patientId = hit.id;
		else errors.patient = 'No patient with that MRN or id.';
	}
	const actions = auditActions(db);
	if (raw.action && (actions.includes(raw.action) || raw.action === OUTPUT_GROUP)) filter.action = raw.action;
	for (const k of ['from', 'to'] as const) {
		if (!raw[k]) continue;
		if (isRealDate(raw[k])) filter[k] = raw[k];
		else errors[k] = 'Use a real date (YYYY-MM-DD).';
	}
	if (filter.from && filter.to && filter.from > filter.to) errors.to = 'The end date is before the start date.';

	const page = Math.max(1, Math.floor(Number(q.get('page')) || 1));
	const result = Object.keys(errors).length ? { rows: [], total: 0 } : searchAudit(db, filter, page);
	return {
		raw,
		errors,
		page,
		pages: Math.max(1, Math.ceil(result.total / AUDIT_PAGE_SIZE)),
		total: result.total,
		rows: result.rows,
		actions,
		users: listUsers(db).map((u) => ({ id: u.id, label: u.username ? `${u.displayName} (${u.username})` : u.displayName }))
	};
};
