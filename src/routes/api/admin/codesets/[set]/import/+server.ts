// POST /api/admin/codesets/<set>/import: for computers without internet. The body is the official zip
// or the plain code file taken out of it, either as the raw request body or as the field "file" of a
// multipart form. Same check as a download (SHA-256 of the release). Up to 50 MB; the Node server
// must accept bodies that big (BODY_SIZE_LIMIT=20M covers every current release's zip and text file).
// Admin only, audited (settings.codes).
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { importCodeSet, MAX_IMPORT_BYTES } from '#lib/server/codefiles.ts';
import { serverT } from '#lib/server/i18n.ts';
import { adminOnly, notFound, refusal, routeSet, statusJson } from '../../_shared.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const set = routeSet(params.set);
	if (!set) return notFound(locals);
	const { t } = serverT(locals.locale);
	const tooLarge = () => json({ message: t('server.codesTooLarge') }, { status: 413 });
	if (Number(request.headers.get('content-length') ?? 0) > MAX_IMPORT_BYTES + 64 * 1024) return tooLarge();
	let bytes: Uint8Array;
	try {
		if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
			const file = (await request.formData()).get('file');
			if (!(file instanceof Blob)) return json({ message: t('server.codesEmptyFile') }, { status: 400 });
			bytes = new Uint8Array(await file.arrayBuffer());
		} else {
			bytes = new Uint8Array(await request.arrayBuffer());
		}
	} catch (e) {
		// adapter-node refuses bodies over BODY_SIZE_LIMIT while we read them.
		if ((e as { status?: number }).status === 413) return json({ message: t('server.codesBodyLimit') }, { status: 413 });
		throw e;
	}
	try {
		return json(statusJson(await importCodeSet(getDb(), set, bytes, locals.userId!)));
	} catch (e) {
		return refusal(e, locals);
	}
};
