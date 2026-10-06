import { getDb } from '#lib/server/db.ts';
import { ageOn, listPatients } from '#lib/server/exam.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return {
		patients: listPatients(getDb()).map((p) => ({
			id: p.id,
			mrn: p.mrn,
			name: `${p.preferred_name ?? p.legal_first} ${p.legal_last}`,
			dob: p.dob,
			age: ageOn(p.dob),
			latestEncounter: p.latest_encounter
		}))
	};
};
