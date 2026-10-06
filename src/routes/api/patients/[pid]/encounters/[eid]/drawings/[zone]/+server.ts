// GET: latest drawing for this exam and zone (404 when none). PUT: save a new version (raw image/png body).
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { DrawingError, getLatestDrawing, isDrawingZone, MAX_DRAWING_BYTES, saveDrawing } from '#lib/server/drawings.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { noteTechnician } from '#lib/server/patients.ts';
import { guardEditable } from '#lib/server/signing.ts';
import { ids, pngResponse } from '../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const [pid, eid] = ids(params, 'pid', 'eid');
	const d = getLatestDrawing(getDb(), pid, eid, params.zone);
	if (!d) error(404, 'Not found');
	const res = pngResponse(d.png);
	res.headers.set('x-drawing-id', String(d.id));
	return res;
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const [pid, eid] = ids(params, 'pid', 'eid');
	if (!isDrawingZone(params.zone)) error(404, 'Not found');
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');
	// 423 when the exam is signed or this page does not hold the edit lock (spec §15.1 FIX).
	const locked = guardEditable(db, pid, eid, locals.userId, request);
	if (locked) return locked;
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	if (type !== 'image/png') error(415, 'Send the drawing as image/png');
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_DRAWING_BYTES) error(413, 'Drawing is too large');
	const body = new Uint8Array(await request.arrayBuffer());
	try {
		const saved = saveDrawing(db, pid, eid, params.zone, body, locals.userId);
		if (!saved) error(404, 'Not found');
		noteTechnician(db, eid, locals.user);
		return json(saved);
	} catch (e) {
		if (e instanceof DrawingError) error(/too large/.test(e.message) ? 413 : 400, e.message);
		throw e;
	}
};
