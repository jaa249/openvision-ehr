import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getPrintables, logPrint, MAX_EXPORT, parseIds } from '#lib/server/report.ts';
import { exportName, toCsv, toFhirBundle } from '#lib/server/export.ts';
import type { RequestHandler } from './$types';

/** GET /export/csv?ids=1,2 and /export/fhir?ids=1,2 download the visits as a file. Every export is logged. */
export const GET: RequestHandler = ({ params, url, locals }) => {
	const format = params.format;
	if (format !== 'csv' && format !== 'fhir') error(404, 'Not found');
	const ids = parseIds(url.searchParams.get('ids'));
	if (ids.length === 0) error(400, 'Choose at least one encounter to export.');
	if (ids.length > MAX_EXPORT) error(400, `Export at most ${MAX_EXPORT} encounters at a time.`);

	const db = getDb();
	const items = getPrintables(db, ids, MAX_EXPORT);
	if (items.length === 0) error(404, 'Not found');
	logPrint(db, locals.userId, items.map((i) => i.encounter.id), format);

	const name = exportName(items);
	const [body, type, ext] =
		format === 'csv'
			? [toCsv(items), 'text/csv; charset=utf-8', 'csv']
			: [JSON.stringify(toFhirBundle(items), null, 2), 'application/fhir+json; charset=utf-8', 'fhir.json'];
	return new Response(body, {
		headers: {
			'content-type': type,
			'content-disposition': `attachment; filename="${name}.${ext}"`,
			'cache-control': 'no-store'
		}
	});
};
