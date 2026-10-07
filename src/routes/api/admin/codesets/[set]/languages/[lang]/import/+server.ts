// POST /api/admin/codesets/icd11/languages/<lang>/import: for computers without internet (D50). The body is
// WHO's zip for that language or the text file inside it, raw or as the field "file" of a multipart form.
// Same check, limits and audit as the code-set import. Admin only.
import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { importIcd11Language, MAX_IMPORT_BYTES } from '#lib/server/codefiles.ts';
import { serverT } from '#lib/server/i18n.ts';
import { adminOnly, languageJson, languageNotFound, refusal, routeLanguage } from '../../../../_shared.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const denied = adminOnly(locals);
	if (denied) return denied;
	const lang = routeLanguage(params.set, params.lang);
	if (!lang) return languageNotFound(locals);
	const { t } = serverT(locals.locale);
	if (Number(request.headers.get('content-length') ?? 0) > MAX_IMPORT_BYTES + 64 * 1024) return json({ message: t('server.codesTooLarge') }, { status: 413 });
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
		return json(languageJson(await importIcd11Language(getDb(), lang, bytes, locals.userId!)));
	} catch (e) {
		return refusal(e, locals);
	}
};
