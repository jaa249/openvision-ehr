// GET: the file, with its stored type and Content-Disposition inline (?download=1 = attachment).
//      Audited: document.download every time, document.view once per user and file per 5 minutes.
//      X-Content-Type-Options: nosniff is set globally (hooks.server.ts).
// PATCH: { notes?, takenOn?, category? }.  DELETE: soft delete.
// Files tied to a visit follow that exam's lock (signed or edited elsewhere = 423).
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { logDocumentAccess } from '#lib/server/audit.ts';
import { deleteDocument, getDocumentFile, getDocumentMeta, updateDocument } from '#lib/server/documents.ts';
import { contentDisposition, editWrite, rethrow, routeId } from '../_shared.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, locals }) => {
	const pid = routeId(params.pid);
	const id = routeId(params.id);
	const db = getDb();
	const doc = getDocumentFile(db, pid, id);
	if (!doc) error(404, 'Not found');
	const kind = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
	// No file leaves without its audit row (HIPAA 164.312(b)).
	logDocumentAccess(db, locals.userId, doc, kind === 'attachment');
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
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}
	if (!body || typeof body !== 'object') error(400, 'Expected an object');
	try {
		// A visit's file: lock and signature checked now that the body is here, inside the write.
		return editWrite(db, pid, cur.encounterId, locals.userId, request, () => {
			const doc = updateDocument(db, pid, id, body as Record<string, unknown>, locals.userId);
			if (!doc) error(404, 'Not found');
			return json(doc);
		});
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
	return editWrite(db, pid, cur.encounterId, locals.userId, request, () => {
		if (!deleteDocument(db, pid, id, locals.userId)) error(404, 'Not found');
		return new Response(null, { status: 204 });
	});
};
