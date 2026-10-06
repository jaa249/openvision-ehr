import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, saveFindings, validateChanges, ValidationError } from '#lib/server/exam.ts';
import { guardEditable } from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');
	// 423 when the exam is signed or this page does not hold the edit lock (spec §15.1 FIX).
	const locked = guardEditable(db, pid, eid, locals.userId, request);
	if (locked) return locked;

	let changes;
	try {
		changes = validateChanges(await request.json());
	} catch (e) {
		if (e instanceof ValidationError || e instanceof SyntaxError) error(400, e.message);
		throw e;
	}

	const savedAt = saveFindings(db, pid, eid, locals.userId, changes);
	if (!savedAt) error(404, 'Not found');
	return json({ savedAt });
};
