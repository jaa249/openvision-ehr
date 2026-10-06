import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import {
	addOrderOption,
	deleteOrderOption,
	listOrderOptions,
	PlanConflictError,
	PlanValidationError,
	reorderOrderOptions,
	updateOrderOption
} from '#lib/server/plan.ts';
import type { RequestHandler } from './$types';

/** The signed-in user's own next-visit orders list (§10.6), seeded on first use. */
export const GET: RequestHandler = ({ locals }) => json(listOrderOptions(getDb(), locals.userId));

/**
 * List editor (pencil), one action per request, always on the signed-in user's own list:
 * add {label, cpt} · update {id, label?, cpt?} · delete {id} · reorder {ids}. Answers with the list.
 * Not exam data: past visits keep their own copy of each order, so no exam lock applies.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
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
	try {
		switch (body.action) {
			case 'add':
				addOrderOption(db, user, { label: body.label, cpt: body.cpt });
				break;
			case 'update':
				if (!updateOrderOption(db, user, Number(body.id), { label: body.label, cpt: body.cpt })) error(404, 'That order is no longer in the list.');
				break;
			case 'delete':
				if (!deleteOrderOption(db, user, Number(body.id))) error(404, 'That order is no longer in the list.');
				break;
			case 'reorder':
				reorderOrderOptions(db, user, body.ids);
				break;
			default:
				error(400, 'Unknown action');
		}
	} catch (e) {
		if (e instanceof PlanValidationError) return json({ message: e.message }, { status: 400 });
		if (e instanceof PlanConflictError) return json({ message: e.message, options: listOrderOptions(db, user) }, { status: 409 });
		throw e;
	}
	return json(listOrderOptions(db, user));
};
