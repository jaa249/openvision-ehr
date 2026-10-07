import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter } from '#lib/server/exam.ts';
import {
	addIssuesFromShorthand,
	deleteIssue,
	getPmsfh,
	HistoryValidationError,
	quickPickTitles,
	saveFamily,
	saveIssue,
	saveSocial,
	setNoKnownAllergies
} from '#lib/server/history.ts';
import { guardEditable } from '#lib/server/signing.ts';
import { ISSUE_TYPES, type IssueType, type PmsfhResponse } from '#lib/history/types.ts';
import type { RequestHandler } from './$types';

/** Patient history is patient-level, but it is always reached through a visit of that patient. */
function scope(params: { pid: string; eid: string }) {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const encounter = getEncounter(getDb(), pid, eid);
	if (!encounter) error(404, 'Not found');
	return { pid, eid, encounter };
}

function response(pid: number, providerId: number): PmsfhResponse {
	const db = getDb();
	return { ...getPmsfh(db, pid), quickPicks: quickPickTitles(db, providerId) };
}

export const GET: RequestHandler = ({ params }) => {
	const { pid, encounter } = scope(params);
	return json(response(pid, encounter.providerId));
};

/**
 * One endpoint, one action per request:
 * saveIssue {issue} · deleteIssue {id} · nkda {on} · family {data} · social {data} · shorthand {type, text}.
 * Answers with the fresh history (plus `result` for saveIssue and shorthand). Validation errors: 400 with
 * { message, errors } so the editor can show each message next to its field.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { pid, eid, encounter } = scope(params);
	let body: Record<string, unknown>;
	try {
		const parsed = await request.json();
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) error(400, 'Expected a JSON object');
		body = parsed as Record<string, unknown>;
	} catch (e) {
		if (e instanceof SyntaxError) error(400, 'Invalid JSON');
		throw e;
	}
	const db = getDb();
	const user = locals.userId;
	let result: unknown = undefined;
	try {
		switch (body.action) {
			case 'saveIssue':
				result = saveIssue(db, pid, user, body.issue, { encounterId: eid, lang: locals.locale });
				if (!result) error(404, 'Not found');
				break;
			case 'deleteIssue':
				if (!deleteIssue(db, pid, Number(body.id))) error(404, 'Not found');
				break;
			case 'nkda':
				if (typeof body.on !== 'boolean') error(400, 'Expected { on: true | false }');
				setNoKnownAllergies(db, pid, user, body.on);
				break;
			case 'family':
				saveFamily(db, pid, user, body.data);
				break;
			case 'social':
				saveSocial(db, pid, user, body.data);
				break;
			case 'shorthand': {
				// The shorthand action is typed in the exam's shorthand bar and links the new issues to
				// this exam, so it follows the exam's edit lock and signature (423). The other actions
				// edit patient-level history (the chart, not this visit's exam): they stay allowed while
				// someone else edits the exam and after it is signed, since history keeps changing
				// over the patient's life and every edit records who and when.
				const locked = guardEditable(db, pid, eid, user, request);
				if (locked) return locked;
				const type = body.type as IssueType;
				if (!ISSUE_TYPES.includes(type) || typeof body.text !== 'string') error(400, 'Expected { type, text }');
				if (body.text.length > 4000) error(400, 'Shorthand text is too long');
				result = addIssuesFromShorthand(db, pid, eid, user, type, body.text);
				break;
			}
			default:
				error(400, 'Unknown action');
		}
	} catch (e) {
		if (e instanceof HistoryValidationError) return json({ message: e.message, errors: e.errors }, { status: 400 });
		throw e;
	}
	return json({ ...response(pid, encounter.providerId), result });
};
