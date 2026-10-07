// GET ?encounter=<id>: the IOP target that applies to that exam when its own target boxes are empty
// (spec §8.3 FIX lookup: latest PRIOR visit, else the visit provider's defaults, else 21), plus the full
// answer including the exam's own value. Used by IopTargets for its placeholder and "high" checks.
// The visit's provider's defaults, never the viewer's, so everyone sees the same flags.
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { iopTargets } from '#lib/server/flowsheet.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const pid = Number(params.pid);
	const eid = Number(url.searchParams.get('encounter'));
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid) || pid <= 0 || eid <= 0) error(404, 'Not found');
	const db = getDb();
	const fallback = iopTargets(db, pid, eid, false);
	if (!fallback) error(404, 'Not found');
	return json({ fallback, resolved: iopTargets(db, pid, eid) });
};
