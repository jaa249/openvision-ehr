import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { searchIcd10 } from '#lib/server/icd10.ts';
import type { RequestHandler } from './$types';

/**
 * ICD-10-CM search, kept for older clients (the code finder now uses /api/codes/dx, which follows the
 * practice's code set). GET /api/codes/icd10?q=... -> IcdCode[] (top 25 billable ICD-10-CM codes by code prefix,
 * then by every word in the description, case-insensitive). The code set is public, not patient data.
 */
export const GET: RequestHandler = ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	return json(searchIcd10(getDb(), q), { headers: { 'cache-control': 'private, max-age=300' } });
};
