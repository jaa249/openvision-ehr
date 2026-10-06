import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { assertEditable, EncounterLockedError } from '#lib/server/signing.ts';
import {
	canEditCoding,
	CodingValidationError,
	getCodingResponse,
	getCodingState,
	saveCodingLines,
	saveCodingState,
	setVisitStatus,
	validateCodingState,
	validateLines
} from '#lib/server/coding.ts';
import type { RequestHandler } from './$types';

/** Coding is always reached through its own patient: a wrong pair is a 404, never another chart. */
function scope(params: { pid: string; eid: string }) {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	if (!getEncounter(getDb(), pid, eid)) error(404, 'Not found');
	return { pid, eid };
}

async function body(request: Request): Promise<Record<string, unknown>> {
	try {
		const parsed = await request.json();
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) error(400, 'Expected a JSON object');
		return parsed as Record<string, unknown>;
	} catch (e) {
		if (e instanceof SyntaxError) error(400, 'Invalid JSON');
		throw e;
	}
}

function requireCoder(role: App.Locals['user']['role'] | undefined) {
	if (!canEditCoding(role)) error(403, 'Only a provider or admin can change coding. You can view it.');
}

/** Coding is part of the exam: signed or locked exams refuse changes (423). */
function editable(pid: number, eid: number, userId: number, request: Request) {
	try {
		assertEditable(getDb(), pid, eid, userId, request.headers.get('x-lock-token'));
	} catch (e) {
		if (e instanceof EncounterLockedError) error(423, e.message);
		throw e;
	}
}

/** State, the computed suggestion, saved lines and visit status. Techs can view. */
export const GET: RequestHandler = ({ params, locals }) => {
	const { pid, eid } = scope(params);
	return json(getCodingResponse(getDb(), pid, eid, locals.user?.role));
};

/** Autosave of the panel's choices: { state }. Provider or admin only. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { pid, eid } = scope(params);
	requireCoder(locals.user?.role);
	const b = await body(request);
	let state;
	try {
		state = validateCodingState(b.state);
	} catch (e) {
		if (e instanceof CodingValidationError) error(400, e.message);
		throw e;
	}
	editable(pid, eid, locals.userId, request);
	const db = getDb();
	const savedAt = saveCodingState(db, pid, eid, locals.userId, state);
	if (!savedAt) error(404, 'Not found');
	return json({ savedAt, state: getCodingState(db, pid, eid) });
};

/**
 * One action per request:
 * saveLines { dx, cpt } — "Save coding lines" (provider or admin; exam must be editable).
 * status { status } — visit status; any signed-in user (check-out happens after signing, so the
 *   exam lock does not apply: the status is workflow, not exam content).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { pid, eid } = scope(params);
	const b = await body(request);
	const db = getDb();
	try {
		if (b.action === 'saveLines') {
			requireCoder(locals.user?.role);
			const lines = validateLines(b);
			editable(pid, eid, locals.userId, request);
			const saved = saveCodingLines(db, pid, eid, locals.userId, lines);
			if (!saved) error(404, 'Not found');
			return json({ lines: saved });
		}
		if (b.action === 'status') {
			const r = setVisitStatus(db, pid, eid, locals.userId, b.status);
			if (!r) error(404, 'Not found');
			return json(r);
		}
	} catch (e) {
		if (e instanceof CodingValidationError) error(400, e.message);
		throw e;
	}
	error(400, 'Unknown action');
};
