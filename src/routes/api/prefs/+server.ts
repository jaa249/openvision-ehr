import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getPrefs, PrefError, setPrefs } from '#lib/server/prefs.ts';
import type { RequestHandler } from './$types';

/** The signed-in user's layout prefs (spec §1.7), every whitelisted key with its value or default. */
export const GET: RequestHandler = ({ locals }) => json({ prefs: getPrefs(getDb(), locals.userId) });

/** Body: { prefs: { key: value, ... } }. Always the current user's own prefs; unknown keys or wrong types → 400. */
export const PUT: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}
	try {
		return json({ prefs: setPrefs(getDb(), locals.userId, (body as { prefs?: unknown })?.prefs) });
	} catch (e) {
		if (e instanceof PrefError) error(400, e.message);
		throw e;
	}
};
