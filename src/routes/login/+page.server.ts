import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { applySignInLanguage, LANG_COOKIE, langCookieOptions, serverT } from '#lib/server/i18n.ts';
import { isLocale } from '#lib/i18n/locales.ts';
import { deleteSession, isHttps, login, needsSetup, safeNext, sessionCookieOptions, SESSION_COOKIE, shownDemoAccounts } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const db = getDb();
	if (needsSetup(db)) redirect(303, '/setup');
	const next = safeNext(url.searchParams.get('next'));
	if (locals.user) redirect(303, next);
	// The language menu (D48) is a GET form, so it works without JavaScript: remember a valid choice in
	// ov_lang and come back without ?lang, marked "chosen" so a sign-in can save it as the user's language.
	if (url.searchParams.has('lang')) {
		const lang = url.searchParams.get('lang');
		if (isLocale(lang)) cookies.set(LANG_COOKIE, lang, langCookieOptions());
		const back = new URLSearchParams();
		if (next !== '/') back.set('next', next);
		if (isLocale(lang)) back.set('chosen', '1');
		redirect(303, `/login${back.size ? `?${back}` : ''}`);
	}
	return { next, langChosen: url.searchParams.get('chosen') === '1', demo: await shownDemoAccounts(db) };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url, locals }) => {
		const f = await request.formData();
		const username = str(f.get('username')).slice(0, 64);
		const password = str(f.get('password'));
		const next = safeNext(str(f.get('next')));
		if (!username.trim() || !password) {
			const { t } = serverT(locals.locale);
			return fail(400, {
				username,
				message: null,
				errors: { ...(username.trim() ? {} : { username: t('auth.enterUsername') }), ...(password ? {} : { password: t('auth.enterPassword') }) }
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
		// A language picked on this page becomes the user's own if they never chose one (D48); the
		// sign-in page on this computer then opens in the user's language next time.
		const lang = applySignInLanguage(db, res.user.id, cookies.get(LANG_COOKIE), str(f.get('langChosen')) === '1');
		cookies.set(LANG_COOKIE, lang, langCookieOptions());
		redirect(303, res.user.mustChangePassword ? '/settings/me?required=1' : next);
	}
};
