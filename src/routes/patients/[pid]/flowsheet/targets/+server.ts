// GET ?encounter=<id>: the IOP target that applies to that exam when its own target boxes are empty
// (spec §8.3 FIX lookup: latest PRIOR visit, else the provider's defaults, else 21), plus the full
// answer including the exam's own value. Used by IopTargets for its placeholder and "high" checks.
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getPriors, getUserDefaults, getEncounter } from '#lib/server/exam.ts';
import { iopTargets } from '#lib/server/flowsheet.ts';
import { resolveTarget } from '#lib/exam/sections/glaucoma.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(url.searchParams.get('encounter'));
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid) || pid <= 0 || eid <= 0) error(404, 'Not found');
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');
	const priors = getPriors(db, pid, eid, 1000) ?? [];
	const defaults = getUserDefaults(db, locals.userId);
	return json({
		fallback: { OD: resolveTarget('OD', {}, priors, defaults), OS: resolveTarget('OS', {}, priors, defaults) },
		resolved: iopTargets(db, pid, eid, locals.userId)
	});
};
