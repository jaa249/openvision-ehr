import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getPrefs, setPrefs } from '#lib/server/prefs.ts';
import { serverT } from '#lib/server/i18n.ts';
import { getDefaultLocale } from '#lib/server/settings.ts';
import { changeOwnPassword, getUser, updateDisplayName, UserError } from '#lib/server/users.ts';
import { checkPref } from '#lib/prefs/keys.ts';
import type { Actions, PageServerLoad } from './$types';

// Everyone: their own display name, password, cylinder convention, default exam panel and language (D48).
export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const me = getUser(db, locals.userId)!;
	const prefs = getPrefs(db, locals.userId);
	return {
		me: { username: me.username, displayName: me.displayName, role: me.role },
		cylinder: prefs.cylinder,
		examMode: prefs['exam.mode'],
		locale: prefs.locale,
		practiceLocale: getDefaultLocale(db),
		required: !!locals.mustChangePassword || url.searchParams.get('required') === '1'
	};
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const db = getDb();
		const f = await request.formData();
		const values = {
			displayName: str(f.get('displayName')),
			cylinder: str(f.get('cylinder')),
			examMode: str(f.get('examMode')),
			locale: str(f.get('locale'))
		};
		const errors: Record<string, string> = {};
		const { t } = serverT(locals.locale);
		const cylinder = checkPref('cylinder', values.cylinder);
		const examMode = checkPref('exam.mode', values.examMode);
		const locale = checkPref('locale', values.locale);
		if (!cylinder) errors.cylinder = t('settings.chooseCylinder');
		if (!examMode) errors.examMode = t('settings.choosePanel');
		if (!locale) errors.locale = t('settings.chooseLanguage');
		// The name is saved even when a radio is invalid (it is validated on its own).
		try {
			updateDisplayName(db, locals.userId, values.displayName);
		} catch (e) {
			if (!(e instanceof UserError)) throw e;
			Object.assign(errors, e.errors);
		}
		if (Object.keys(errors).length) return fail(400, { section: 'profile' as const, errors, values });
		// enhance reloads the page data after a save, so a new language shows at once.
		setPrefs(db, locals.userId, { cylinder, 'exam.mode': examMode, locale });
		return { section: 'profile' as const, ok: true };
	},

	password: async ({ request, locals }) => {
		const f = await request.formData();
		const input = { current: str(f.get('current')), next: str(f.get('next')), confirm: str(f.get('confirm')) };
		const wasRequired = !!locals.mustChangePassword;
		try {
			await changeOwnPassword(getDb(), locals.userId, input, locals.sessionToken);
		} catch (e) {
			if (e instanceof UserError) return fail(400, { section: 'password' as const, errors: e.errors });
			throw e;
		}
		if (wasRequired) redirect(303, '/');
		return { section: 'password' as const, ok: true };
	}
};
