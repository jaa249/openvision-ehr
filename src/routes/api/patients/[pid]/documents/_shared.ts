// Shared helpers for the document API routes.
import { error } from '@sveltejs/kit';
import type { DB } from '#lib/server/db.ts';
import { DocumentError } from '#lib/server/documents.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { guardEditable } from '#lib/server/signing.ts';

/** Parses a route id; anything that is not a positive safe integer is a plain 404. */
export function routeId(raw: string | undefined): number {
	const v = Number(raw);
	if (!Number.isSafeInteger(v) || v <= 0) error(404, 'Not found');
	return v;
}

/** Shown when the Node server refuses a large body before our code sees it (adapter-node default 512 KB). */
export const BODY_LIMIT_MESSAGE =
	'This file is larger than the server accepts. Files up to 15 MB are supported when the server runs with BODY_SIZE_LIMIT=20M (ask your administrator).';

/**
 * Files tied to a visit are part of that exam: a signed exam, or one this page does not hold the edit
 * lock for, cannot gain, change or lose documents (§15.1). Patient-level papers are not locked.
 * Returns the 423 response to send, or null when the write may go ahead. A visit that is not this
 * patient's is a plain 404 (checked before the lock, so ids cannot be probed through it).
 */
export function editGuard(db: DB, patientId: number, encounterId: number | null, userId: number, request: Request): Response | null {
	if (encounterId === null) return null;
	if (!getEncounter(db, patientId, encounterId)) error(404, 'Not found');
	return guardEditable(db, patientId, encounterId, userId, request);
}

/** Maps a DocumentError to its HTTP status; anything else is rethrown. */
export function rethrow(e: unknown): never {
	if (e instanceof DocumentError) error(e.status, e.message);
	throw e;
}

/** HTTP-quoted file name plus the UTF-8 form, so any name downloads safely. */
export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
