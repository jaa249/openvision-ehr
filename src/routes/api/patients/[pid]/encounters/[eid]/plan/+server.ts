import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter } from '#lib/server/exam.ts';
import { assertEditable, EncounterLockedError } from '#lib/server/signing.ts';
import {
	addItem,
	addNewDx,
	deleteItem,
	getPlanData,
	listItems,
	PlanConflictError,
	PlanDuplicateError,
	PlanValidationError,
	reorderItems,
	saveOrders,
	updateItem
} from '#lib/server/plan.ts';
import type { RequestHandler } from './$types';

/** The plan is always reached through its own patient: a wrong pair is a 404, never another chart. */
function scope(params: { pid: string; eid: string }) {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	if (!getEncounter(getDb(), pid, eid)) error(404, 'Not found');
	return { pid, eid };
}

/** PlanData (see src/lib/plan/types.ts): items, orders, orderDetails, orderPlan, orderOptions, canEditOrders, orderListOwner. */
export const GET: RequestHandler = ({ params, locals }) => {
	const { pid, eid } = scope(params);
	return json(getPlanData(getDb(), pid, eid, locals.userId));
};

/**
 * One action per request (all change the exam, so the edit lock is checked first; 423 when locked):
 * - add {item: {kind, title, codes, plan, link}, index?, allowDuplicate?} -> {item, items}
 * - newDx {text, index?, allowDuplicate?} -> {item | null, items}
 * - update {id, title?, codes?, plan?, allowDuplicate?} -> {item}
 * - delete {id} -> {items}
 * - reorder {ids} -> {items}
 * - orders {optionIds, plan} -> {orders, orderDetails, orderPlan}
 * Errors: 400 {message} bad input; 404 unknown item; 409 {message, duplicateOf} duplicate (resend with
 * allowDuplicate: true to keep both) or {message, items} when the list changed elsewhere.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { pid, eid } = scope(params);
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
		assertEditable(db, pid, eid, user, request.headers.get('x-lock-token'));
	} catch (e) {
		if (e instanceof EncounterLockedError) error(423, e.message);
		throw e;
	}
	const allowDuplicate = body.allowDuplicate === true;
	const index = Number.isSafeInteger(body.index) ? (body.index as number) : undefined;
	const items = () => listItems(db, pid, eid) ?? [];
	try {
		switch (body.action) {
			case 'add': {
				const input = body.item;
				if (!input || typeof input !== 'object' || Array.isArray(input)) error(400, 'Expected { item }');
				const item = addItem(db, pid, eid, user, input as Record<string, unknown>, { index, allowDuplicate });
				return json({ item, items: items() });
			}
			case 'newDx': {
				const r = addNewDx(db, pid, eid, user, body.text, { index, allowDuplicate });
				return json({ item: r?.item ?? null, items: items() });
			}
			case 'update': {
				const id = Number(body.id);
				if (!Number.isSafeInteger(id)) error(400, 'Expected { id }');
				const item = updateItem(db, pid, eid, user, id, { title: body.title, codes: body.codes, plan: body.plan }, { allowDuplicate });
				if (!item) error(404, 'That item no longer exists.');
				return json({ item });
			}
			case 'delete': {
				const id = Number(body.id);
				if (!Number.isSafeInteger(id)) error(400, 'Expected { id }');
				if (!deleteItem(db, pid, eid, id)) error(404, 'That item no longer exists.');
				return json({ items: items() });
			}
			case 'reorder':
				return json({ items: reorderItems(db, pid, eid, body.ids) });
			case 'orders': {
				const r = saveOrders(db, pid, eid, user, body.optionIds, body.plan)!;
				return json({ orders: r.orders.map((o) => o.label), orderDetails: r.orders, orderPlan: r.orderPlan });
			}
			default:
				error(400, 'Unknown action');
		}
	} catch (e) {
		if (e instanceof PlanValidationError) return json({ message: e.message }, { status: 400 });
		if (e instanceof PlanDuplicateError) return json({ message: e.message, duplicateOf: e.existingId }, { status: 409 });
		if (e instanceof PlanConflictError) return json({ message: e.message, items: items() }, { status: 409 });
		throw e;
	}
};
