import { json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { idleMs, sessionRemaining, touchSession } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Session status for the automatic-logoff warning. The client polls with `x-background: 1`, so
 * polling never extends the session (hooks.server.ts). 401 (from the hook) once it has ended.
 */
export const GET: RequestHandler = ({ locals }) =>
	json({ remainingMs: sessionRemaining(getDb(), locals.sessionToken), idleMs: idleMs() }, { headers: NO_STORE });

/** "Stay signed in": explicit user activity. */
export const POST: RequestHandler = ({ locals }) => {
	const db = getDb();
	touchSession(db, locals.sessionToken);
	return json({ remainingMs: sessionRemaining(db, locals.sessionToken), idleMs: idleMs() }, { headers: NO_STORE });
};
