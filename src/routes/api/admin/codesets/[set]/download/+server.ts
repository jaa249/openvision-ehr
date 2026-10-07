// POST /api/admin/codesets/<set>/download: the server downloads the set's current release from its
// official address (src/lib/codesets/releases.ts), checks its SHA-256, keeps it and loads the codes.
// Takes a few seconds; answers the new status, or { message } (502 no connection, 422 not the
// expected release, 409 already running). Admin only, audited (settings.codes).
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { downloadCodeSet } from '#lib/server/codefiles.ts';
import { adminOnly, notFound, refusal, routeSet, statusJson } from '../../_shared.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const set = routeSet(params.set);
	if (!set) return notFound(locals);
	try {
		return json(statusJson(await downloadCodeSet(getDb(), set, locals.userId!)));
	} catch (e) {
		return refusal(e, locals);
	}
};
