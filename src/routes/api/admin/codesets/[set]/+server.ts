// GET /api/admin/codesets/<set>: { set, current, rows, loadedAt, upToDate }.
// DELETE: removes the set's codes (table and downloaded file); refused for the practice's current set.
// Saved diagnoses keep their own code and text (and WHO URI). Admin only, audited (settings.codes).
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { codeSetStatus, removeCodeSet } from '#lib/server/codefiles.ts';
import { adminOnly, notFound, refusal, routeSet, statusJson } from '../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const set = routeSet(params.set);
	if (!set) return notFound(locals);
	return json(statusJson(codeSetStatus(getDb()).find((s) => s.set === set)!));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const set = routeSet(params.set);
	if (!set) return notFound(locals);
	try {
		return json(statusJson(await removeCodeSet(getDb(), set, locals.userId!)));
	} catch (e) {
		return refusal(e, locals);
	}
};
