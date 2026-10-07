import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { searchIcd10 } from '#lib/server/icd10.ts';
import { searchIcd11 } from '#lib/server/icd11.ts';
import { currentCodeSet } from '#lib/server/settings.ts';
import type { DxSearchResult } from '#lib/codesets/index.ts';
import type { RequestHandler } from './$types';

/**
 * Code finder over the practice's current diagnosis code set (D44): GET /api/codes/dx?q=...
 * -> { system, codes: [{ code, description, uri?, leaf }] }, top 25.
 * ICD-10-CM: billable codes only (code prefix, then every description word). ICD-11: code prefix, then
 * every title word; leaves first, the visual system chapter first; extension codes never (they are only
 * appended, e.g. the eye). WHO titles and URIs are passed on unchanged. The code sets are public, not patient data.
 */
export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	const system = currentCodeSet(db);
	const body: DxSearchResult =
		system === 'icd11'
			? { system, codes: searchIcd11(db, q).map((c) => ({ code: c.code, description: c.title, uri: c.uri, leaf: c.leaf })) }
			: { system, codes: searchIcd10(db, q).map((c) => ({ code: c.code, description: c.description, leaf: c.billable })) };
	return json(body, { headers: { 'cache-control': 'private, no-cache' } });
};
