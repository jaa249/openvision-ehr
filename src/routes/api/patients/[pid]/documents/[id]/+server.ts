// GET: the file, with its stored type and Content-Disposition inline (?download=1 = attachment).
//      X-Content-Type-Options: nosniff is set globally (hooks.server.ts).
// PATCH: { notes?, takenOn?, category? }.  DELETE: soft delete.
// Files tied to a visit follow that exam's lock (signed or edited elsewhere = 423).
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { deleteDocument, getDocumentFile, getDocumentMeta, updateDocument } from '#lib/server/documents.ts';
import { editGuard, contentDisposition, rethrow, routeId } from '../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const pid = routeId(params.pid);
	const id = routeId(params.id);
	const doc = getDocumentFile(getDb(), pid, id);
	if (!doc) error(404, 'Not found');
	const kind = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
	const headers: Record<string, string> = {
		'content-type': doc.mime,
		'content-length': String(doc.data.byteLength),
		'content-disposition': contentDisposition(kind, doc.filename),
		// Patient data: never kept in any cache.
		'cache-control': 'private, no-store'
	};
	// An image opened on its own can never run scripts or load anything. (Not set on PDFs: browsers'
	// built-in PDF viewers break under a restrictive policy.)
	if (doc.mime !== 'application/pdf') headers['content-security-policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
	return new Response(new Uint8Array(doc.data), { headers });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const pid = routeId(params.pid);
	const id = routeId(params.id);
	const db = getDb();
	const cur = getDocumentMeta(db, pid, id);
	if (!cur) error(404, 'Not found');
	const locked = editGuard(db, pid, cur.encounterId, locals.userId, request);
	if (locked) return locked;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}
	if (!body || typeof body !== 'object') error(400, 'Expected an object');
	try {
		const doc = updateDocument(db, pid, id, body as Record<string, unknown>, locals.userId);
		if (!doc) error(404, 'Not found');
		return json(doc);
	} catch (e) {
		rethrow(e);
	}
};

export const DELETE: RequestHandler = ({ params, request, locals }) => {
	const pid = routeId(params.pid);
	const id = routeId(params.id);
	const db = getDb();
	const cur = getDocumentMeta(db, pid, id);
	if (!cur) error(404, 'Not found');
	const locked = editGuard(db, pid, cur.encounterId, locals.userId, request);
	if (locked) return locked;
	if (!deleteDocument(db, pid, id, locals.userId)) error(404, 'Not found');
	return new Response(null, { status: 204 });
};
