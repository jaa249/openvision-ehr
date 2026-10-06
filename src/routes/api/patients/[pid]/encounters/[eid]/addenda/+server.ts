// POST { text }: append an addendum to a signed exam. Addenda are never edited or removed.
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { addAddendum, SigningError } from '#lib/server/signing.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	let text: unknown;
	try {
		text = ((await request.json()) as { text?: unknown } | null)?.text;
	} catch {
		error(400, 'Expected { text }');
	}
	try {
		return json({ signature: addAddendum(getDb(), pid, eid, locals.user, text) }, { status: 201 });
	} catch (e) {
		if (e instanceof SigningError) error(e.status, e.message);
		throw e;
	}
};
