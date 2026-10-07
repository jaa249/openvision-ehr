import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { codeSetStatus, icd11LanguageStatus } from '#lib/server/codefiles.ts';
import type { PageServerLoad } from './$types';

// Admin only (D49): download, import or remove the diagnosis code sets. The changes go through
// /api/admin/codesets/<set>/... (audited as settings.codes). Loading this page loads a downloaded file
// into its table the first time, which takes a few seconds. WHO language files go through
// /api/admin/codesets/icd11/languages/<lang>/... the same way.
export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals, 'admin');
	const db = getDb();
	// WHO's ICD-11 titles in other languages (D50): listed under ICD-11.
	return { sets: codeSetStatus(db), languages: icd11LanguageStatus(db) };
};
