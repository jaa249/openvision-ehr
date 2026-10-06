// The exam edit lock (spec §15.1 FIX). The page's random token travels in the X-Lock-Token header.
// GET: lock + signature state and the current findings (read-only pages poll this every 15 s).
// POST { action }: acquire | heartbeat | release | takeover.
//   acquire   takes a free lock; when another page holds it, answers the state with mine = false.
//   heartbeat keeps the holder's lock alive (423 for anyone else: their page goes read-only).
//   release   page hide/unload (sent with fetch keepalive); only the holder's token releases.
//   takeover  explicit, audited takeover of someone else's lock.
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getFindings } from '#lib/server/exam.ts';
import {
	acquireLock,
	EncounterLockedError,
	getLockState,
	heartbeatLock,
	lockedResponse,
	lockToken,
	releaseLock,
	SigningError,
	takeOverLock
} from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

function ids(params: { pid: string; eid: string }) {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid) || pid <= 0 || eid <= 0) error(404, 'Not found');
	return { pid, eid };
}

export const GET: RequestHandler = ({ params, request, locals }) => {
	const { pid, eid } = ids(params);
	const db = getDb();
	if (!getEncounter(db, pid, eid)) error(404, 'Not found');
	const state = getLockState(db, eid, locals.userId, lockToken(request));
	return json({ ...state, findings: getFindings(db, pid, eid) ?? {} }, { headers: NO_STORE });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { pid, eid } = ids(params);
	let action: unknown;
	try {
		action = ((await request.json()) as { action?: unknown } | null)?.action;
	} catch {
		error(400, 'Expected { action }');
	}
	const db = getDb();
	const token = lockToken(request);
	try {
		switch (action) {
			case 'acquire':
				return json(acquireLock(db, pid, eid, locals.userId, token), { headers: NO_STORE });
			case 'heartbeat':
				return json(heartbeatLock(db, pid, eid, locals.userId, token), { headers: NO_STORE });
			case 'takeover':
				return json(takeOverLock(db, pid, eid, locals.userId, token), { headers: NO_STORE });
			case 'release':
				return json({ released: releaseLock(db, pid, eid, locals.userId, token) }, { headers: NO_STORE });
			default:
				error(400, 'Unknown action');
		}
	} catch (e) {
		if (e instanceof EncounterLockedError) return lockedResponse(e);
		if (e instanceof SigningError) error(e.status, e.message);
		throw e;
	}
};
