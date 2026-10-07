import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { getCodeSettings, getDefaultLocale, getPractice, setDefaultLocale, SettingsError, updateCodeSettings, updatePractice } from '#lib/server/settings.ts';
import { serverT } from '#lib/server/i18n.ts';
import { codeSetAvailable } from '#lib/server/codefiles.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin only: the header printed on reports and spectacle / contact lens Rx, and the diagnosis code
// set and US code suggestions switch (D44, D45), and the default language (D48).
export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals, 'admin');
	const db = getDb();
	return {
		practice: getPractice(db),
		codes: getCodeSettings(db),
		// Which code sets are downloaded (D49): a set that is not says so next to it, with Download.
		available: { icd10cm: codeSetAvailable(db, 'icd10cm'), icd11: codeSetAvailable(db, 'icd11') },
		locale: getDefaultLocale(db),
		welcome: url.searchParams.get('welcome') === '1'
	};
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const f = await request.formData();
		if (f.get('form') === 'locale') {
			// Its own form: the language for users on "Practice default" and the sign-in page.
			try {
				setDefaultLocale(getDb(), str(f.get('locale')), locals.userId);
			} catch (e) {
				if (e instanceof SettingsError) return fail(400, { localeErrors: { locale: serverT(locals.locale).t('settings.chooseLanguage') } });
				throw e;
			}
			return { localeOk: true };
		}
		if (f.get('form') === 'codes') {
			// Its own form on the page: code set and US code suggestions.
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
