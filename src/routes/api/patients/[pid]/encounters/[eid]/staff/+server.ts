// PUT { providerId, technicianId }: changes who the visit's provider and technician are (D43).
// Only while the exam is unsigned and this page holds the edit lock; every change is audited.
import { error, json } from '@sveltejs/kit';
import { audit } from '#lib/server/audit.ts';
import { getDb } from '#lib/server/db.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { PatientValidationError, setVisitStaff } from '#lib/server/patients.ts';
import { guardEditable } from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const db = getDb();
	const before = getEncounter(db, pid, eid);
	if (!before) error(404, 'Not found');
	const locked = guardEditable(db, pid, eid, locals.userId, request);
	if (locked) return locked;

	let body: { providerId?: unknown; technicianId?: unknown };
	try {
		body = (await request.json()) ?? {};
	} catch {
		error(400, 'Expected JSON');
	}
	const providerId = Number(body.providerId);
	const technicianId = body.technicianId == null || body.technicianId === '' ? null : Number(body.technicianId);
	try {
		setVisitStaff(db, pid, eid, { providerId, technicianId });
	} catch (e) {
		if (e instanceof PatientValidationError) error(400, e.message);
		throw e;
	}
	const after = getEncounter(db, pid, eid)!;
	if (after.providerId !== before.providerId || after.technicianId !== before.technicianId) {
		audit(db, {
			userId: locals.userId,
			action: 'exam.staff',
			patientId: pid,
			encounterId: eid,
			detail: { provider: [before.providerId, after.providerId], technician: [before.technicianId, after.technicianId] }
		});
	}
	return json({ encounter: after });
};
