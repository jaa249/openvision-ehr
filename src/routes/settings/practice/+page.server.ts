import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { getPractice, SettingsError, updatePractice } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin only: the header printed on reports and spectacle / contact lens Rx.
export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals, 'admin');
	return { practice: getPractice(getDb()), welcome: url.searchParams.get('welcome') === '1' };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const f = await request.formData();
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
