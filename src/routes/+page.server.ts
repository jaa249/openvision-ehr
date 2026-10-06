import { getDb } from '#lib/server/db.ts';
import { ageOn } from '#lib/server/exam.ts';
import { searchPatients } from '#lib/server/patients.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	return {
		q,
		patients: searchPatients(getDb(), q).map((p) => ({
			id: p.id,
			mrn: p.mrn,
			name: `${p.preferred_name ?? p.legal_first} ${p.legal_last}`,
			legalName: `${p.legal_first} ${p.legal_last}`,
			dob: p.dob,
			age: ageOn(p.dob),
			latestEncounter: p.latest_encounter
		}))
	};
};
