import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { ageOn } from '#lib/server/exam.ts';
import {
	addAllergy,
	createEncounter,
	getPatientRecord,
	localToday,
	PatientValidationError,
	removeAllergy,
	setNoKnownAllergies,
	updatePatient,
	activeVisitTypeNames
} from '#lib/server/patients.ts';
import type { Actions, PageServerLoad } from './$types';

function parsePid(raw: string): number {
	const pid = Number(raw);
	if (!Number.isSafeInteger(pid) || pid < 1) error(404, 'Not found');
	return pid;
}

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const load: PageServerLoad = ({ params }) => {
	const patient = getPatientRecord(getDb(), parsePid(params.pid));
	if (!patient) error(404, 'Not found');
	return {
		patient: { ...patient, age: ageOn(patient.dob) },
		today: localToday(),
		visitTypes: activeVisitTypeNames(getDb())
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const pid = parsePid(params.pid);
		const f = await request.formData();
		const values = {
			legalFirst: str(f.get('legalFirst')),
			legalLast: str(f.get('legalLast')),
			preferredName: str(f.get('preferredName')),
			dob: str(f.get('dob')),
			mrn: str(f.get('mrn'))
		};
		try {
			if (!updatePatient(getDb(), pid, values)) error(404, 'Not found');
		} catch (e) {
			if (e instanceof PatientValidationError) return fail(400, { section: 'update' as const, errors: e.errors, values });
			throw e;
		}
		return { section: 'update' as const, ok: true };
	},

	addAllergy: async ({ request, params, locals }) => {
		const pid = parsePid(params.pid);
		const f = await request.formData();
		const values = { title: str(f.get('title')), reaction: str(f.get('reaction')) };
		try {
			if (addAllergy(getDb(), pid, values, locals.userId) === null) error(404, 'Not found');
		} catch (e) {
			if (e instanceof PatientValidationError) return fail(400, { section: 'allergy' as const, errors: e.errors, values });
			throw e;
		}
		return { section: 'allergy' as const, ok: true };
	},

	removeAllergy: async ({ request, params }) => {
		const pid = parsePid(params.pid);
		const f = await request.formData();
		// Scoped by patient: an allergy id from another chart removes nothing.
		removeAllergy(getDb(), pid, Number(str(f.get('allergyId'))));
		return { section: 'allergy-removed' as const, ok: true };
	},

	/** "No known allergies" tick box: refused while active allergies exist; unticking returns to "not recorded". */
	nkda: async ({ request, params, locals }) => {
		const pid = parsePid(params.pid);
		const f = await request.formData();
		const on = str(f.get('on')) === '1';
		try {
			if (!setNoKnownAllergies(getDb(), pid, locals.userId, on)) error(404, 'Not found');
		} catch (e) {
			if (e instanceof PatientValidationError) return fail(400, { section: 'nkda' as const, errors: e.errors });
			throw e;
		}
		return { section: 'nkda' as const, ok: true, on };
	},

	newVisit: async ({ request, params, locals }) => {
		const pid = parsePid(params.pid);
		const f = await request.formData();
		const values = { date: str(f.get('date')), visitType: str(f.get('visitType')) };
		let eid: number | null;
		try {
			eid = createEncounter(getDb(), pid, locals.userId, values);
		} catch (e) {
			if (e instanceof PatientValidationError) return fail(400, { section: 'visit' as const, errors: e.errors, values });
			throw e;
		}
		if (eid === null) error(404, 'Not found');
		redirect(303, `/patients/${pid}/encounters/${eid}`);
	}
};
