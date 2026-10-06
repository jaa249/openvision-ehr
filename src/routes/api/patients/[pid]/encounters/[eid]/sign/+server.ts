// POST: sign (finalize) the exam. Only the visit's own provider; refused while another page edits.
// There is no unsign endpoint on purpose: corrections after signing are addenda (see signing.ts).
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { EncounterLockedError, lockedResponse, lockToken, signExam, SigningError } from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	try {
		return json({ signature: signExam(getDb(), pid, eid, locals.user, lockToken(request)) });
	} catch (e) {
		if (e instanceof EncounterLockedError) return lockedResponse(e);
		if (e instanceof SigningError) error(e.status, e.message);
		throw e;
	}
};
