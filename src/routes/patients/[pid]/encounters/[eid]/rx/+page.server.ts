import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getFindings, getPatientHeader } from '#lib/server/exam.ts';
import { getPractice } from '#lib/server/report.ts';
import { isRxSource, rxExpiry, rxFromFindings } from '#lib/exam/sections/refraction.ts';
import type { PageServerLoad } from './$types';

// Opening the page writes nothing: the dispense record is created when the user prints (spec §12.5 FIX).
export const load: PageServerLoad = ({ params, url }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const source = url.searchParams.get('source') ?? 'MR';
	if (!isRxSource(source)) error(400, 'Unknown Rx source. Use W1-W5, MR, CR, AR or CTL.');

	const db = getDb();
	const patient = getPatientHeader(db, pid);
	const encounter = patient ? getEncounter(db, pid, eid) : null;
	if (!patient || !encounter) error(404, 'Not found');

	return {
		patient,
		encounter,
		practice: getPractice(db),
		rx: rxFromFindings(getFindings(db, pid, eid) ?? {}, source),
		expires: rxExpiry(encounter.date, source)
	};
};
