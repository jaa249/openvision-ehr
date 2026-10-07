import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { createSession, isHttps, needsSetup, sessionCookieOptions, SESSION_COOKIE } from '#lib/server/auth.ts';
import { setupFirstAdmin, UserError } from '#lib/server/users.ts';
import { serverT } from '#lib/server/i18n.ts';
import { noticeBodyHtml } from '#lib/server/legal.ts';
import { APP_VERSION } from '#lib/server/version.ts';
import type { Actions, PageServerLoad } from './$types';

// First run only: while nobody can sign in, this page creates the first admin. Afterwards it is closed.
// The page shows in the browser's language when we have it (D48); that is also the preselected default.
export const load: PageServerLoad = ({ locals }) => {
	if (!needsSetup(getDb())) redirect(303, '/login');
	return { locale: locals.locale, noticeHtml: noticeBodyHtml() };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, cookies, url, locals }) => {
		const db = getDb();
		const f = await request.formData();
		const values = {
			username: str(f.get('username')).slice(0, 64),
			displayName: str(f.get('displayName')).slice(0, 200),
			codeSet: str(f.get('codeSet')).slice(0, 10),
			locale: str(f.get('locale')).slice(0, 10)
		};
		// D51: the first admin accepts the Terms of Use and the data safety notice for the practice.
		const accepted = f.get('acceptTerms') === 'yes';
		let id: number;
		try {
			if (!accepted) {
				// Check the other fields too, so every problem shows at once.
				const errors: Record<string, string> = { acceptTerms: serverT(locals.locale).t('auth.setupTermsRequired') };
				try {
					await setupFirstAdmin(db, { ...values, password: str(f.get('password')), confirm: str(f.get('confirm')), codeSet: str(f.get('codeSet')) }, new Date(), { dryRun: true });
				} catch (e) {
					if (!(e instanceof UserError)) throw e;
					Object.assign(errors, e.errors);
				}
				return fail(400, { values, errors });
			}
			id = await setupFirstAdmin(db, {
				...values,
				password: str(f.get('password')),
				confirm: str(f.get('confirm')),
				codeSet: str(f.get('codeSet')),
				termsAccepted: { version: APP_VERSION }
			});
		} catch (e) {
			if (e instanceof UserError) {
				if (e.errors.form && !needsSetup(db)) redirect(303, '/login');
				return fail(400, { values, errors: e.errors });
			}
			throw e;
		}
		cookies.set(SESSION_COOKIE, createSession(db, id), sessionCookieOptions(isHttps(request, url)));
		redirect(303, '/settings/practice?welcome=1');
	}
};
