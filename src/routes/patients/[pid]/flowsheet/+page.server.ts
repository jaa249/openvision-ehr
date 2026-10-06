// Glaucoma flow sheet (spec §8.3). ?encounter=<id> opens it as of that exam (targets editable there);
// without it, the whole chart up to today, read-only.
import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getFindings, getPatientHeader, getPriors, getUserDefaults } from '#lib/server/exam.ts';
import { buildFlowsheet } from '#lib/server/flowsheet.ts';
import { resolveTarget } from '#lib/exam/sections/glaucoma.ts';
import { getLockState } from '#lib/server/signing.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, locals }) => {
	const pid = Number(params.pid);
	if (!Number.isSafeInteger(pid) || pid < 1) error(404, 'Not found');
	const raw = url.searchParams.get('encounter');
	const eid = raw === null || raw === '' ? null : Number(raw);
	if (eid !== null && (!Number.isSafeInteger(eid) || eid < 1)) error(404, 'Not found');

	const db = getDb();
	const patient = getPatientHeader(db, pid);
	const sheet = patient ? buildFlowsheet(db, pid, eid, locals.userId) : null;
	if (!patient || !sheet) error(404, 'Not found');

	let exam = null;
	if (eid !== null) {
		const enc = getEncounter(db, pid, eid)!;
		const findings = getFindings(db, pid, eid) ?? {};
		const priors = getPriors(db, pid, eid, 1000) ?? [];
		const defaults = getUserDefaults(db, locals.userId);
		exam = {
			id: enc.id,
			date: enc.date,
			visitType: enc.visitType,
			targets: { ODIOPTARGET: findings.ODIOPTARGET?.value ?? '', OSIOPTARGET: findings.OSIOPTARGET?.value ?? '' },
			/** What applies when the exam's own boxes are empty. */
			fallback: { OD: resolveTarget('OD', {}, priors, defaults), OS: resolveTarget('OS', {}, priors, defaults) },
			/** Editing targets here takes the exam's edit lock like the exam page does (§15.1). */
			lockState: getLockState(db, eid, locals.userId, null)
		};
	}
	return {
		patient: { id: patient.id, name: patient.name, mrn: patient.mrn, dob: patient.dob },
		sheet,
		exam
	};
};
