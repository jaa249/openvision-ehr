// One prior drawing image. It must belong to this patient, be for this zone, and the
// encounter in the URL must also be this patient's (same 404 rule as the findings API).
import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { getDrawingById } from '#lib/server/drawings.ts';
import { ids, pngResponse } from '../../../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const [pid, eid, id] = ids(params, 'pid', 'eid', 'id');
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');
	const d = getDrawingById(db, pid, id);
	if (!d || d.zone !== params.zone) error(404, 'Not found');
	return pngResponse(d.png);
};
