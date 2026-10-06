import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getFindings, getPatientHeader, getUserDefaults } from '#lib/server/exam.ts';
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
		defaults: getUserDefaults(db, locals.userId)
	};
};
