import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getPractice, getPrintables, MAX_PRINT, parseIds } from '#lib/server/report.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const ids = parseIds(url.searchParams.get('ids'));
	if (ids.length === 0) error(400, 'Choose at least one encounter to print.');
	if (ids.length > MAX_PRINT) error(400, `Print at most ${MAX_PRINT} encounters at a time.`);
	const db = getDb();
	const items = getPrintables(db, ids);
	if (items.length === 0) error(404, 'Not found');
	return {
		items,
		practice: getPractice(db),
		auto: url.searchParams.get('auto') === '1',
		/** Opened from the exam's Download → PDF: say how to save it (no PDF engine, D17). */
		pdf: url.searchParams.get('pdf') === '1',
		missing: ids.length - items.length
	};
};
