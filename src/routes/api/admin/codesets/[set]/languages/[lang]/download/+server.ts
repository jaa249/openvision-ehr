// POST /api/admin/codesets/icd11/languages/<lang>/download: the server downloads WHO's ICD-11 file in that
// language (src/lib/codesets/releases.ts ICD11_LANGUAGES), checks its SHA-256, keeps it and loads the
// titles (D50). Same answers as the code-set download. Admin only, audited (settings.codes).
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { downloadIcd11Language } from '#lib/server/codefiles.ts';
import { adminOnly, languageJson, languageNotFound, refusal, routeLanguage } from '../../../../_shared.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const lang = routeLanguage(params.set, params.lang);
	if (!lang) return languageNotFound(locals);
	try {
		return json(languageJson(await downloadIcd11Language(getDb(), lang, locals.userId!)));
	} catch (e) {
		return refusal(e, locals);
	}
};
