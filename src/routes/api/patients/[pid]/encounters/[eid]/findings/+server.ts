import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, saveFindings, validateChanges, ValidationError } from '#lib/server/exam.ts';
import { noteTechnician } from '#lib/server/patients.ts';
import { editableWrite } from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');

	let changes;
	try {
		changes = validateChanges(await request.json());
	} catch (e) {
		if (e instanceof ValidationError || e instanceof SyntaxError) error(400, e.message);
		throw e;
	}

	// Checked after the body arrived, inside the write's transaction: 423 when the exam is signed or
	// this page does not hold the edit lock (spec §15.1 FIX, D36). Findings and the technician
	// (D43) are saved together or not at all.
	return editableWrite(db, pid, eid, locals.userId, request, () => {
		const savedAt = saveFindings(db, pid, eid, locals.userId, changes);
		if (!savedAt) error(404, 'Not found');
		noteTechnician(db, eid, locals.user);
		return json({ savedAt });
	});
};
