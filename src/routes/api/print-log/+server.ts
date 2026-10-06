import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { logPrint, MAX_PRINT } from '#lib/server/report.ts';
import type { RequestHandler } from './$types';

/** The print page reports here when the print dialog closes (spec §12.4: printing is audit-logged). */
export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}
	const ids = (body as { ids?: unknown })?.ids;
	if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_PRINT || !ids.every((n) => Number.isSafeInteger(n) && n > 0)) {
		error(400, `Expected { ids: [1..${MAX_PRINT} encounter ids] }`);
	}
	return json({ logged: logPrint(getDb(), locals.userId, ids as number[]) });
};
