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
	activeVisitTypeNames,
	activeProviders
} from '#lib/server/patients.ts';
import type { DB } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

function parsePid(raw: string): number {
	const pid = Number(raw);
	if (!Number.isSafeInteger(pid) || pid < 1) error(404, 'Not found');
	return pid;
}

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

/**
 * The provider a new visit starts with (D43): a provider is their own; anyone else gets the
 * provider of the last visit they worked as technician, or the only provider. 0 = must choose.
 */
function defaultProvider(db: DB, user: App.Locals['user'], providers: { id: number }[]): number {
	if (user.role === 'provider' && providers.some((p) => p.id === user.id)) return user.id;
	const last = db.prepare('SELECT provider_id FROM encounters WHERE technician_id = ? ORDER BY id DESC LIMIT 1').get(user.id) as
		| { provider_id: number }
		| undefined;
	if (last && providers.some((p) => p.id === last.provider_id)) return last.provider_id;
	return providers.length === 1 ? providers[0].id : 0;
}

export const load: PageServerLoad = ({ params, locals }) => {
	const db = getDb();
	const patient = getPatientRecord(db, parsePid(params.pid));
	if (!patient) error(404, 'Not found');
	const providers = activeProviders(db);
	return {
		patient: { ...patient, age: ageOn(patient.dob) },
		today: localToday(),
		visitTypes: activeVisitTypeNames(db),
		providers,
		defaultProvider: defaultProvider(db, locals.user, providers)
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

	removeAllergy: async ({ request, params, locals }) => {
		const pid = parsePid(params.pid);
		const f = await request.formData();
		// Scoped by patient: an allergy id from another chart removes nothing. The removal is kept with who and when.
		removeAllergy(getDb(), pid, Number(str(f.get('allergyId'))), locals.userId);
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
		const values = { date: str(f.get('date')), visitType: str(f.get('visitType')), providerId: str(f.get('providerId')) };
		let eid: number | null;
		try {
			// The person starting the visit is its technician when they are one (D43).
			const staff = { providerId: Number(values.providerId), technicianId: locals.user.role === 'tech' ? locals.user.id : null };
			eid = createEncounter(getDb(), pid, staff, values);
		} catch (e) {
			if (e instanceof PatientValidationError) return fail(400, { section: 'visit' as const, errors: e.errors, values });
			throw e;
		}
		if (eid === null) error(404, 'Not found');
		redirect(303, `/patients/${pid}/encounters/${eid}`);
	}
};
