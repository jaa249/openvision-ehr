// PUT { providerId, technicianId }: changes who the visit's provider and technician are (D43).
// Only while the exam is unsigned and this page holds the edit lock; every change is audited.
import { error, json } from '@sveltejs/kit';
import { audit } from '#lib/server/audit.ts';
import { getDb } from '#lib/server/db.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { PatientValidationError, setVisitStaff } from '#lib/server/patients.ts';
import { editableWrite } from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');

	let body: { providerId?: unknown; technicianId?: unknown };
	try {
		body = (await request.json()) ?? {};
	} catch {
		error(400, 'Expected JSON');
	}
	const providerId = Number(body.providerId);
	const technicianId = body.technicianId == null || body.technicianId === '' ? null : Number(body.technicianId);
	// The lock and signature are checked once the body is here, inside the same transaction as the
	// change and its audit row (423 when signed or locked).
	return editableWrite(db, pid, eid, locals.userId, request, () => {
		const was = getEncounter(db, pid, eid)!; // as it is now, not before the body arrived
		try {
			setVisitStaff(db, pid, eid, { providerId, technicianId });
		} catch (e) {
			if (e instanceof PatientValidationError) error(400, e.message);
			throw e;
		}
		const after = getEncounter(db, pid, eid)!;
		if (after.providerId !== was.providerId || after.technicianId !== was.technicianId) {
			audit(db, {
				userId: locals.userId,
				action: 'exam.staff',
				patientId: pid,
				encounterId: eid,
				detail: { provider: [was.providerId, after.providerId], technician: [was.technicianId, after.technicianId] }
			});
		}
		return json({ encounter: after });
	});
};
