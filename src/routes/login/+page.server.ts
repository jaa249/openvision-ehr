import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { deleteSession, isHttps, login, needsSetup, safeNext, sessionCookieOptions, SESSION_COOKIE, shownDemoAccounts } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = getDb();
	if (needsSetup(db)) redirect(303, '/setup');
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return { next: safeNext(url.searchParams.get('next')), demo: await shownDemoAccounts(db) };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const f = await request.formData();
		const username = str(f.get('username')).slice(0, 64);
		const password = str(f.get('password'));
		const next = safeNext(str(f.get('next')));
		if (!username.trim() || !password) {
			return fail(400, {
				username,
				message: null,
				errors: { ...(username.trim() ? {} : { username: 'Enter your username.' }), ...(password ? {} : { password: 'Enter your password.' }) }
			});
		}
		const db = getDb();
		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			/* not available in every adapter */
		}
		const res = await login(db, username, password, ip);
		if (!res.ok) return fail(res.retryAfter ? 429 : 400, { username, message: res.message, errors: {} });
		// Rotate: whatever session this browser had before is ended, and a fresh token is issued.
		deleteSession(db, cookies.get(SESSION_COOKIE));
		cookies.set(SESSION_COOKIE, res.token, sessionCookieOptions(isHttps(request, url)));
		redirect(303, res.user.mustChangePassword ? '/settings/me?required=1' : next);
	}
};
