import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getFindings, getPatientHeader, getPriors, getUserDefaults } from '#lib/server/exam.ts';
import { getQuickPicks } from '#lib/server/quickpicks.ts';
import { getLockState } from '#lib/server/signing.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');

	const db = getDb();
	const patient = getPatientHeader(db, pid);
	const encounter = patient ? getEncounter(db, pid, eid) : null;
	// Same response whether the patient or the encounter is wrong: no probing for valid ids.
	if (!patient || !encounter) error(404, 'Not found');

	return {
		patient,
		encounter,
		findings: getFindings(db, pid, eid) ?? {},
		defaults: getUserDefaults(db, locals.userId),
		priors: getPriors(db, pid, eid) ?? [],
		quickPicks: getQuickPicks(db, locals.userId),
		// Who is editing / whether it is signed, so a read-only exam renders read-only from the start.
		// The page takes the lock itself through the lock API (each page load has its own token).
		lockState: getLockState(db, eid, locals.userId, null),
		user: locals.user
	};
};
