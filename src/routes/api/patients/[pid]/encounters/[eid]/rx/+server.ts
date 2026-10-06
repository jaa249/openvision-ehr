import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { createDispense, RxValidationError, validateDispense } from '#lib/server/rx.ts';
import type { RequestHandler } from './$types';

/** The Rx page calls this on Print: it writes the dispense record (spec §12.5 FIX: on print, not on open). */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	let input;
	try {
		input = validateDispense(await request.json());
	} catch (e) {
		if (e instanceof RxValidationError || e instanceof SyntaxError) error(400, e.message);
		throw e;
	}
	const res = createDispense(getDb(), pid, eid, locals.userId, input);
	if (!res) error(404, 'Not found');
	return json(res, { status: res.duplicate ? 200 : 201 });
};
