// GET: this patient's documents, newest first (?category= ?zone= ?flow=VF|OCT ?encounter=),
//      or a zone's strip (?zone=EXT&summary=1: categories with count and latest).
// POST: upload one file as the raw request body (spec §15.4). Query: category (required), filename,
//       encounter (ties it to a visit; lock-checked), takenOn (YYYY-MM-DD), notes.
//       The type comes from the bytes (PNG, JPEG, PDF); up to 15 MB.
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { isDocZone, listCategories, listDocuments, MAX_DOCUMENT_BYTES, uploadDocument, zoneSummary } from '#lib/server/documents.ts';
import { BODY_LIMIT_MESSAGE, editGuard, rethrow, routeId } from './_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const pid = routeId(params.pid);
	const db = getDb();
	const zone = url.searchParams.get('zone');
	if (zone !== null && !isDocZone(zone)) error(400, 'Unknown zone');
	if (zone && url.searchParams.get('summary') === '1') {
		const summary = zoneSummary(db, pid, zone);
		if (!summary) error(404, 'Not found');
		return json({ categories: summary });
	}
	const flow = url.searchParams.get('flow');
	if (flow !== null && flow !== 'VF' && flow !== 'OCT') error(400, 'Unknown flow-sheet role');
	const enc = url.searchParams.get('encounter');
	const docs = listDocuments(db, pid, {
		category: url.searchParams.get('category') ?? undefined,
		zone: zone ?? undefined,
		flow: flow ?? undefined,
		encounterId: enc ? routeId(enc) : undefined
	});
	if (!docs) error(404, 'Not found');
	return json({ documents: docs, categories: listCategories(db) });
};

export const POST: RequestHandler = async ({ params, url, request, locals }) => {
	const pid = routeId(params.pid);
	const q = url.searchParams;
	const enc = q.get('encounter');
	const encounterId = enc ? routeId(enc) : null;
	const db = getDb();
	const locked = editGuard(db, pid, encounterId, locals.userId, request);
	if (locked) return locked;
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_DOCUMENT_BYTES) error(413, 'File is larger than 15 MB');
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await request.arrayBuffer());
	} catch (e) {
		// adapter-node refuses bodies over BODY_SIZE_LIMIT while we read them.
		if ((e as { status?: number }).status === 413) error(413, BODY_LIMIT_MESSAGE);
		throw e;
	}
	try {
		const doc = uploadDocument(
			db,
			pid,
			{
				category: q.get('category') ?? '',
				filename: q.get('filename'),
				encounterId,
				takenOn: q.get('takenOn'),
				notes: q.get('notes'),
				bytes
			},
			locals.userId
		);
		if (!doc) error(404, 'Not found');
		return json(doc, { status: 201 });
	} catch (e) {
		rethrow(e);
	}
};
