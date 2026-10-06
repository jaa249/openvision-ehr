import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { createPatient, localToday, PatientValidationError } from '#lib/server/patients.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ today: localToday() });

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const values = {
			legalFirst: str(form.get('legalFirst')),
			legalLast: str(form.get('legalLast')),
			preferredName: str(form.get('preferredName')),
			dob: str(form.get('dob')),
			mrn: str(form.get('mrn'))
		};
		const titles = form.getAll('allergy_title').map(str);
		const reactions = form.getAll('allergy_reaction').map(str);
		// Rows left completely blank are simply skipped; anything else is validated.
		const allergies = titles
			.map((title, i) => ({ title, reaction: reactions[i] ?? '' }))
			.filter((a) => a.title.trim() || a.reaction.trim())
			.slice(0, 20);
		const noKnownAllergies = form.get('nkda') === '1';

		let id: number;
		try {
			id = createPatient(getDb(), values, allergies, localToday(), { noKnownAllergies, userId: locals.userId });
		} catch (e) {
			if (e instanceof PatientValidationError) return fail(400, { errors: e.errors, values, allergies, noKnownAllergies });
			throw e;
		}
		redirect(303, `/patients/${id}`);
	}
};
