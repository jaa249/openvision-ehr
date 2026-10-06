// This patient's drawings for the zone from other visits, newest first (spec §5.4).
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { isDrawingZone, listPriorDrawings } from '#lib/server/drawings.ts';
import { ids } from '../../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const [pid, eid] = ids(params, 'pid', 'eid');
	if (!isDrawingZone(params.zone)) error(404, 'Not found');
	const priors = listPriorDrawings(getDb(), pid, eid, params.zone);
	if (!priors) error(404, 'Not found');
	return json({ priors }, { headers: { 'cache-control': 'no-store' } });
};
