import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { isKnownField } from '#lib/exam/catalog.ts';
import { getCandidates } from '#lib/server/plan.ts';
import type { RequestHandler } from './$types';

const MAX_VALUE = 4000;

/**
 * Builder rows (§10.2) for this visit: POST { findings: { fieldId: text } } with the panel's current
 * exam values (so text not yet autosaved counts). Read-only: nothing is stored, so no edit lock.
 * Response: CandidateSet { findings, poh, pmh }.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
	const raw = (body as { findings?: unknown } | null)?.findings;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) error(400, 'Expected { findings }');
	const findings: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof v === 'string' && v && isKnownField(k)) findings[k] = v.slice(0, MAX_VALUE);
	}
	const set = getCandidates(getDb(), pid, eid, findings);
	if (!set) error(404, 'Not found');
	return json(set);
};
