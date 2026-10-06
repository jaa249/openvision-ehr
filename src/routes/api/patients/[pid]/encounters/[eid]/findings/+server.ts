import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { saveFindings, validateChanges, ValidationError } from '#lib/server/exam.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');

	let changes;
	try {
		changes = validateChanges(await request.json());
	} catch (e) {
		if (e instanceof ValidationError || e instanceof SyntaxError) error(400, e.message);
		throw e;
	}

	const savedAt = saveFindings(getDb(), pid, eid, locals.userId, changes);
	if (!savedAt) error(404, 'Not found');
	return json({ savedAt });
};
