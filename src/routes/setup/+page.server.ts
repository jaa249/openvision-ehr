import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { createSession, isHttps, needsSetup, sessionCookieOptions, SESSION_COOKIE } from '#lib/server/auth.ts';
import { setupFirstAdmin, UserError } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

// First run only: while nobody can sign in, this page creates the first admin. Afterwards it is closed.
export const load: PageServerLoad = () => {
	if (!needsSetup(getDb())) redirect(303, '/login');
	return {};
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const db = getDb();
		const f = await request.formData();
		const values = {
			username: str(f.get('username')).slice(0, 64),
			displayName: str(f.get('displayName')).slice(0, 200),
			codeSet: str(f.get('codeSet')).slice(0, 10)
		};
		let id: number;
		try {
			id = await setupFirstAdmin(db, { ...values, password: str(f.get('password')), confirm: str(f.get('confirm')), codeSet: str(f.get('codeSet')) });
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
