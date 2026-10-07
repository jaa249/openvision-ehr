// Shared helpers for the code-set admin API (D49). Sign-in is checked in hooks.server.ts (every /api
// route) together with the same-origin check for POST and DELETE; these routes add the admin role.
import { json } from '@sveltejs/kit';
import { isCodeSetId, type CodeSetId } from '#lib/codesets/index.ts';
import { icd11Language } from '#lib/codesets/releases.ts';
import { CodeSetError, type CodeSetStatus, type Icd11LanguageStatus } from '#lib/server/codefiles.ts';
import { serverT } from '#lib/server/i18n.ts';

type Locals = App.Locals;

/** 403 unless an admin is signed in; else null. */
export function adminOnly(locals: Locals): Response | null {
	if (!locals.user) return json({ message: serverT(locals.locale).t('server.codesSignIn') }, { status: 401 });
	if (locals.user.role !== 'admin') return json({ message: serverT(locals.locale).t('server.codesAdminOnly') }, { status: 403 });
	return null;
}

/** The route's set, or null for anything else (404). */
export const routeSet = (raw: string | undefined): CodeSetId | null => (isCodeSetId(raw) ? raw : null);

export const notFound = (locals: Locals) => json({ message: serverT(locals.locale).t('server.codesUnknownSet') }, { status: 404 });

/** The status as JSON (the release's static data stays on the page; only what changes is sent). */
export const statusJson = (s: CodeSetStatus) => ({ set: s.set, current: s.current, rows: s.rows, loadedAt: s.loadedAt, upToDate: s.upToDate });

/** The route's WHO language file (only under /icd11/languages/<lang>, D50); null otherwise (404). */
export const routeLanguage = (set: string | undefined, lang: string | undefined): string | null =>
	set === 'icd11' && icd11Language(lang) ? lang! : null;

export const languageNotFound = (locals: Locals) => json({ message: serverT(locals.locale).t('server.codesUnknownLanguage') }, { status: 404 });

/** A language's status as JSON (what changes; the release data stays on the page). */
export const languageJson = (s: Icd11LanguageStatus) => ({ lang: s.lang, rows: s.rows, loadedAt: s.loadedAt, upToDate: s.upToDate });

/** A CodeSetError as { message } with its status, translated; anything else is rethrown. */
export function refusal(e: unknown, locals: Locals): Response {
	if (e instanceof CodeSetError) return json({ message: serverT(locals.locale).t(e.key, e.params) }, { status: e.status });
	throw e;
}
