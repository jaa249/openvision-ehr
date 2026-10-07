import { error } from '@sveltejs/kit';
import { isLegalDoc, legalHtml } from '#lib/server/legal.ts';
import type { PageServerLoad } from './$types';

// Terms of Use, Privacy Policy and the data safety notice (D51): public, so they can be read before
// sign-in and from the desktop app's Help menu. The text is the repo's own files (English for now).
export const load: PageServerLoad = ({ params, locals }) => {
	if (!isLegalDoc(params.doc)) error(404, 'Not found');
	return { doc: params.doc, html: legalHtml(params.doc), signedIn: !!locals.user };
};
