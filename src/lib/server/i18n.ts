// Which language a request is shown in, and a translator for server code (D48).
// Signed in: the user's own choice ("locale" pref), else the practice default; the ov_lang cookie
// never overrides a signed-in user. Signed out: the ov_lang cookie (the sign-in page's language menu,
// or the last user who signed in on this computer), else, during first-run setup, the browser's
// language, else the practice default, else English.
import type { DB } from './db.ts';
import { getPrefs, setPrefs } from './prefs.ts';
import { getDefaultLocale } from './settings.ts';
import { needsSetup } from './auth.ts';
import { DEFAULT_LOCALE, isLocale, matchAcceptLanguage, type LocaleCode } from '#lib/i18n/locales.ts';
import { EN, mergeLocaleFiles } from '#lib/i18n/catalog.ts';
import { createTranslator, type Translator } from '#lib/i18n/translate.ts';

/** The signed-out language cookie: set by the sign-in page's language menu and after each sign-in. */
export const LANG_COOKIE = 'ov_lang';

/**
 * Cookie options for ov_lang (one year). It holds no secret, so it is not marked Secure: on a
 * plain-http LAN install the adapter reports https and a Secure cookie would be silently dropped.
 */
export function langCookieOptions() {
	return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: false, maxAge: 365 * 24 * 60 * 60 };
}

export function resolveLocale(
	db: DB,
	userId: number | null,
	acceptLanguage: string | null | undefined,
	langCookie?: string | null
): LocaleCode {
	if (userId !== null) {
		const own = getPrefs(db, userId).locale;
		return isLocale(own) ? own : getDefaultLocale(db);
	}
	if (isLocale(langCookie)) return langCookie;
	if (needsSetup(db)) return matchAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
	return getDefaultLocale(db);
}

/**
 * The sign-in rule (D48). If the user has never chosen a language (pref 'practice') and changed the
 * sign-in page's menu (`changed`) to a valid language, that language becomes their own choice. An
 * explicit choice is never replaced. Returns the user's language after sign-in (for the ov_lang cookie).
 * Prefs are not audited (they are layout and display choices, not records).
 */
export function applySignInLanguage(db: DB, userId: number, chosen: unknown, changed: boolean): LocaleCode {
	if (changed && isLocale(chosen) && getPrefs(db, userId).locale === 'practice') setPrefs(db, userId, { locale: chosen });
	return resolveLocale(db, userId, null);
}

// Every catalog, read once at start-up (they are small); English comes from catalog.ts.
const FILES = import.meta.glob<Record<string, string>>(['../i18n/messages/*/*.json', '!../i18n/messages/*/en.json'], {
	eager: true,
	import: 'default'
});
const catalogs = new Map<LocaleCode, Record<string, string>>();
const translators = new Map<LocaleCode, Translator>();

/** The catalog for a language, synchronously (server only). */
export function loadCatalogSync(locale: LocaleCode): Record<string, string> {
	if (locale === DEFAULT_LOCALE) return EN;
	let c = catalogs.get(locale);
	if (!c) catalogs.set(locale, (c = mergeLocaleFiles(FILES, locale)));
	return c;
}

/** A translator for form-action and API messages, e.g. `serverT(locals.locale).t('auth.enterUsername')`. */
export function serverT(locale: LocaleCode | undefined): Translator {
	const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
	let tr = translators.get(l);
	if (!tr) translators.set(l, (tr = createTranslator(l, loadCatalogSync(l), EN)));
	return tr;
}
