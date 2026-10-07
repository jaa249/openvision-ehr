import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { icd10Loaded, searchIcd10 } from '#lib/server/icd10.ts';
import { icd11Loaded, searchIcd11 } from '#lib/server/icd11.ts';
import { icd11TitlesLoaded } from '#lib/server/icd11_titles.ts';
import { currentCodeSet } from '#lib/server/settings.ts';
import type { DxSearchResult } from '#lib/codesets/index.ts';
import type { RequestHandler } from './$types';

/**
 * Code finder over the practice's current diagnosis code set (D44): GET /api/codes/dx?q=...
 * -> { system, codes: [{ code, description, uri?, leaf, titleLang? }], notLoaded?, lang? }, top 25.
 * ICD-10-CM: billable codes only (code prefix, then every description word). ICD-11: code prefix, then
 * every title word; leaves first, the visual system chapter first; extension codes never (they are only
 * appended, e.g. the eye). WHO titles and URIs are passed on unchanged. The code sets are public, not patient data.
 * ICD-11 in another language (D50): when WHO's titles in the signed-in user's interface language are loaded,
 * they are searched first (then English) and shown (`titleLang`); `lang` says so. Otherwise English.
 * Not downloaded yet (D49): no codes and `notLoaded: true`.
 */
export const GET: RequestHandler = ({ url, locals }) => {
	const db = getDb();
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	const system = currentCodeSet(db);
	const headers = { 'cache-control': 'private, no-cache' };
	if (!(system === 'icd11' ? icd11Loaded(db) : icd10Loaded(db))) return json({ system, codes: [], notLoaded: true } satisfies DxSearchResult, { headers });
	if (system === 'icd10cm') {
		return json({ system, codes: searchIcd10(db, q).map((c) => ({ code: c.code, description: c.description, leaf: c.billable })) } satisfies DxSearchResult, {
			headers
		});
	}
	const locale: string = locals?.locale ?? 'en';
	const lang = locale !== 'en' && icd11TitlesLoaded(db, locale) ? locale : undefined;
	const body: DxSearchResult = {
		system,
		codes: searchIcd11(db, q, 25, lang).map((c) => ({
			code: c.code,
			description: c.title,
			uri: c.uri,
			leaf: c.leaf,
			...(c.titleLang ? { titleLang: c.titleLang } : {})
		})),
		...(lang ? { lang } : {})
	};
	return json(body, { headers });
};
