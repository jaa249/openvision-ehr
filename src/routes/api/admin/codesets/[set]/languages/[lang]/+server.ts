// GET /api/admin/codesets/icd11/languages/<lang>: { lang, rows, loadedAt, upToDate } for one WHO language
// file (D50). DELETE removes that language's titles and downloaded file; English and saved diagnoses are
// untouched. Admin only, audited (settings.codes with the language).
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { icd11LanguageStatus, removeIcd11Language } from '#lib/server/codefiles.ts';
import { adminOnly, languageJson, languageNotFound, refusal, routeLanguage } from '../../../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, locals }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const lang = routeLanguage(params.set, params.lang);
	if (!lang) return languageNotFound(locals);
	return json(languageJson(icd11LanguageStatus(getDb()).find((s) => s.lang === lang)!));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const lang = routeLanguage(params.set, params.lang);
	if (!lang) return languageNotFound(locals);
	try {
		return json(languageJson(await removeIcd11Language(getDb(), lang, locals.userId!)));
	} catch (e) {
		return refusal(e, locals);
	}
};
