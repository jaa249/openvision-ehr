import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { getCodeSettings, getPractice, SettingsError, updateCodeSettings, updatePractice } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin only: the header printed on reports and spectacle / contact lens Rx, and the diagnosis code
// set and US billing switch (D44, D45).
export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals, 'admin');
	const db = getDb();
	return { practice: getPractice(db), codes: getCodeSettings(db), welcome: url.searchParams.get('welcome') === '1' };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const f = await request.formData();
		if (f.get('form') === 'codes') {
			// Its own form on the page: code set and US billing.
			try {
				updateCodeSettings(getDb(), { codeSet: str(f.get('codeSet')), usBilling: f.get('usBilling') === 'on' }, locals.userId);
			} catch (e) {
				if (e instanceof SettingsError) return fail(400, { codesErrors: e.errors });
				throw e;
			}
			return { codesOk: true };
		}
		const values = { name: str(f.get('name')), address: str(f.get('address')), phone: str(f.get('phone')), fax: str(f.get('fax')) };
		try {
			updatePractice(getDb(), values, locals.userId);
		} catch (e) {
			if (e instanceof SettingsError) return fail(400, { errors: e.errors, values });
			throw e;
		}
		return { ok: true };
	}
};
