// Impression/Plan items and next-visit orders, stored per exam (spec §10.4-10.6 with FIXes; B28, B29).
// Every function is scoped by patient id AND encounter id (getEncounter) except the report reader,
// which the report loader calls after its own scoping. Items are saved BY ID: add, update, reorder,
// delete; a duplicate is reported (PlanDuplicateError -> 409), never dropped silently.
import type { DB } from './db.ts';
import { getEncounter } from './exam.ts';
import { listIssues } from './history.ts';
import { getIcd10, icd10Loaded, icd10Lookup, isIcd10Category } from './icd10.ts';
import { getIcd11, icd11Loaded, icd11Lookup, resolveIcd11Code } from './icd11.ts';
import { currentCodeSet, getCodeSettings } from './settings.ts';
import { displayCode, type IcdCode } from '#lib/plan/codes.ts';
import { codeSetOfCode, codeTag, codeTextFor, icd11Normalize, isCodeSetId, type CodeSetId } from '#lib/codesets/index.ts';
import { findingCandidates, issueCandidates } from '#lib/plan/engine.ts';
import { CPT_RE, ORDER_SEED } from '#lib/plan/orders.ts';
import { parseNewDx } from '#lib/plan/newdx.ts';
import type { CandidateSet, ImpItem, ImpKind, OrderOption, PlanData, PlanReport, VisitOrder } from '#lib/plan/types.ts';

export const TITLE_MAX = 200;
export const PLAN_MAX = 4000;
export const CODES_MAX = 200;
export const LINK_MAX = 400;
export const ORDER_LABEL_MAX = 80;
export const ORDER_PLAN_MAX = 4000;
export const MAX_ITEMS = 60;
export const MAX_ORDER_OPTIONS = 80;
const KINDS: readonly ImpKind[] = ['free', 'finding', 'issue'];
const LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const TEXT_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/** Bad input: message for the user (HTTP 400). */
export class PlanValidationError extends Error {}
/** Same title and same start of plan as an existing item (HTTP 409; resend with allowDuplicate to keep both). */
export class PlanDuplicateError extends Error {
	constructor(
		message: string,
		readonly existingId: number
	) {
		super(message);
	}
}
/** The client's view of the list is out of date (HTTP 409; reload). */
export class PlanConflictError extends Error {}

type ItemRow = {
	id: number;
	seq: number;
	kind: ImpKind;
	title: string;
	codes: string;
	code_text: string;
	plan: string;
	link: string;
	code_system: string;
	code_uris: string;
};
const ITEM_COLS = 'id, seq, kind, title, codes, code_text, plan, link, code_system, code_uris';
const systemOf = (r: { code_system: string }): CodeSetId => (isCodeSetId(r.code_system) ? r.code_system : 'icd10cm');

const toItem = (r: ItemRow): ImpItem => ({
	id: r.id,
	seq: r.seq,
	kind: r.kind,
	title: r.title,
	codes: r.codes,
	codeText: r.code_text,
	codeSystem: systemOf(r),
	codeUris: r.code_uris,
	plan: r.plan,
	link: r.link,
	codeType: r.codes ? codeTag(systemOf(r)) : ''
});

function itemRows(db: DB, encounterId: number): ItemRow[] {
	return db.prepare(`SELECT ${ITEM_COLS} FROM imp_items WHERE encounter_id = ? ORDER BY seq, id`).all(encounterId) as ItemRow[];
}

export function listItems(db: DB, patientId: number, encounterId: number): ImpItem[] | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	return itemRows(db, encounterId).map(toItem);
}

// ---------- validation ----------

function line(v: unknown, label: string, max: number): string {
	if (v === undefined || v === null) return '';
	if (typeof v !== 'string') throw new PlanValidationError(`${label} must be text.`);
	const s = v.trim().replace(/\s+/g, ' ');
	if (s.length > max) throw new PlanValidationError(`${label} must be ${max} characters or fewer.`);
	if (LINE_CONTROL.test(s)) throw new PlanValidationError(`${label} contains characters that are not allowed.`);
	return s;
}

function text(v: unknown, label: string, max: number): string {
	if (v === undefined || v === null) return '';
	if (typeof v !== 'string') throw new PlanValidationError(`${label} must be text.`);
	const s = v.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
	if (s.length > max) throw new PlanValidationError(`${label} must be ${max} characters or fewer.`);
	if (TEXT_CONTROL.test(s)) throw new PlanValidationError(`${label} contains characters that are not allowed.`);
	return s;
}

export interface NormalizedCodes {
	codes: string;
	codeText: string;
	codeSystem: CodeSetId;
	/** ICD-11: each code's part URIs ("&"-joined), ", "-separated like `codes`; '' for ICD-10-CM. */
	codeUris: string;
}

/**
 * Normalises a codes string to the set's codes and fresh code text from the code set (§10.4 FIX:
 * never stale). `set` defaults to the practice's current set.
 * ICD-10-CM ("h2513, ICD10:H40.1131"): with the code set loaded, each code must be a billable code.
 * ICD-11 ("9C61.0Z&XK9J"): the stem must be a leaf and every "&" part an extension code; WHO's titles
 * and URIs are stored with it (licence), so nothing is saved while the ICD-11 file is missing.
 * `lenient` (issue codes) skips codes it cannot use instead of refusing.
 */
export function normalizeCodes(db: DB, raw: unknown, lenient = false, set: CodeSetId = currentCodeSet(db)): NormalizedCodes {
	const s = line(raw, 'Codes', CODES_MAX);
	if (!s) return { codes: '', codeText: '', codeSystem: set, codeUris: '' };
	if (set === 'icd11') return normalizeIcd11(db, s, lenient);
	const checked = icd10Loaded(db);
	const out: IcdCode[] = [];
	for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
		const d = displayCode(part);
		if (!d) {
			if (lenient) continue;
			throw new PlanValidationError(`"${part}" is not an ICD-10-CM code.`);
		}
		if (out.some((c) => c.code === d)) continue;
		const found = checked ? getIcd10(db, d) : null;
		if (checked && (!found || !found.billable)) {
			if (lenient) continue;
			throw new PlanValidationError(
				(found && !found.billable) || isIcd10Category(db, d)
					? `${d} is a category; choose one of the more specific codes under it.`
					: `${d} is not in the ICD-10-CM code set.`
			);
		}
		out.push(found ?? { code: d, description: '', billable: true });
	}
	return { codes: out.map((c) => c.code).join(', '), codeText: codeTextFor('icd10cm', out), codeSystem: 'icd10cm', codeUris: '' };
}

/** ICD-11 half of normalizeCodes. */
function normalizeIcd11(db: DB, s: string, lenient: boolean): NormalizedCodes {
	const out: { code: string; description: string; uris: string }[] = [];
	const loaded = icd11Loaded(db);
	for (const part of s.replace(/\s*&\s*/g, '&').split(/[,;\s]+/).filter(Boolean)) {
		if (!loaded) {
			if (lenient) continue;
			throw new PlanValidationError('The ICD-11 code set is not available on this computer, so ICD-11 codes cannot be checked or saved.');
		}
		const r = resolveIcd11Code(db, part);
		if ('error' in r) {
			if (lenient) continue;
			if (codeSetOfCode(displayCode(part) ?? '') === 'icd10cm') {
				throw new PlanValidationError(`${displayCode(part)} is an ICD-10-CM code; this practice now codes with ICD-11. Remove it and choose an ICD-11 code.`);
			}
			throw new PlanValidationError(r.error);
		}
		if (!out.some((c) => c.code === r.code)) out.push({ code: r.code, description: r.description, uris: r.uris });
	}
	return {
		codes: out.map((c) => c.code).join(', '),
		codeText: codeTextFor('icd11', out),
		codeSystem: 'icd11',
		codeUris: out.map((c) => c.uris).join(', ')
	};
}

const dupKey = (title: string, plan: string) => `${title.trim().toLowerCase()}\u0000${plan.trim().slice(0, 20)}`;

function findDuplicate(db: DB, encounterId: number, title: string, plan: string, exceptId: number | null): ItemRow | null {
	const key = dupKey(title, plan);
	return itemRows(db, encounterId).find((r) => r.id !== exceptId && dupKey(r.title, r.plan) === key) ?? null;
}

function dupError(existing: ItemRow, title: string): PlanDuplicateError {
	return new PlanDuplicateError(
		`"${title}" is already item ${existing.seq} with the same plan. Add it anyway, or edit the existing item.`,
		existing.id
	);
}

// ---------- items ----------

export interface ItemInput {
	kind?: unknown;
	title?: unknown;
	codes?: unknown;
	plan?: unknown;
	link?: unknown;
}

/**
 * Adds one item at `index` (0-based; default: the end) and renumbers. Returns null for a wrong
 * patient/visit. A title-less coded item takes the code's description as its title.
 */
export function addItem(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	input: ItemInput,
	opts: { index?: number; allowDuplicate?: boolean; now?: Date } = {}
): ImpItem | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const kind = (input.kind ?? 'free') as ImpKind;
	if (!KINDS.includes(kind)) throw new PlanValidationError('Unknown item kind.');
	const { codes, codeText, codeSystem, codeUris } = normalizeCodes(db, input.codes, kind === 'issue');
	let title = line(input.title, 'Title', TITLE_MAX);
	if (!title && codes) {
		const first = codes.split(', ')[0];
		const fromSet = codeSystem === 'icd11' ? getIcd11(db, first.split('&')[0])?.title : getIcd10(db, first)?.description;
		title = (fromSet || codes).slice(0, TITLE_MAX);
	}
	if (!title) throw new PlanValidationError('Give the diagnosis a title.');
	const plan = text(input.plan, 'Plan', PLAN_MAX);
	const link = line(input.link, 'Link', LINK_MAX);
	const rows = itemRows(db, encounterId);
	if (rows.length >= MAX_ITEMS) throw new PlanValidationError(`An impression list holds up to ${MAX_ITEMS} items.`);
	if (!opts.allowDuplicate) {
		const dup = findDuplicate(db, encounterId, title, plan, null);
		if (dup) throw dupError(dup, title);
	}
	const at = (opts.now ?? new Date()).toISOString();
	const index = Math.max(0, Math.min(rows.length, Number.isInteger(opts.index) ? (opts.index as number) : rows.length));
	db.exec('BEGIN');
	try {
		const r = db
			.prepare(
				`INSERT INTO imp_items (encounter_id, seq, kind, title, codes, code_text, code_system, code_uris, plan, link, created_at, created_by, updated_at, updated_by)
				 VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(encounterId, kind, title, codes, codeText, codeSystem, codeUris, plan, link, at, userId, at, userId);
		const id = Number(r.lastInsertRowid);
		const order = rows.map((x) => x.id);
		order.splice(index, 0, id);
		renumber(db, order);
		db.exec('COMMIT');
		return toItem(db.prepare(`SELECT ${ITEM_COLS} FROM imp_items WHERE id = ?`).get(id) as ItemRow);
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

function renumber(db: DB, ids: number[]): void {
	const upd = db.prepare('UPDATE imp_items SET seq = ? WHERE id = ?');
	ids.forEach((id, i) => upd.run(i + 1, id));
}

export interface ItemPatch {
	title?: unknown;
	codes?: unknown;
	plan?: unknown;
}

/**
 * Changes title, codes and/or plan of one item of this visit. Editing codes refreshes the code text.
 * Code set (D44): codes are checked against the practice's current set, except that removing codes
 * from an item keeps the item's own set (an ICD-10-CM item stays ICD-10-CM after a switch to ICD-11).
 * Issue-linked items: the title change stays on this item; the issue itself is not renamed (§10.4 FIX, "don't propagate").
 */
export function updateItem(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	id: number,
	patch: ItemPatch,
	opts: { allowDuplicate?: boolean; now?: Date } = {}
): ImpItem | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	const row = db.prepare(`SELECT ${ITEM_COLS} FROM imp_items WHERE id = ? AND encounter_id = ?`).get(id, encounterId) as ItemRow | undefined;
	if (!row) return null;
	const next = { ...row };
	if (patch.title !== undefined) {
		next.title = line(patch.title, 'Title', TITLE_MAX);
		if (!next.title) throw new PlanValidationError('The title cannot be empty.');
	}
	if (patch.plan !== undefined) next.plan = text(patch.plan, 'Plan', PLAN_MAX);
	if (patch.codes !== undefined) {
		const c = normalizeCodes(db, patch.codes, false, codeSetForPatch(db, row, patch.codes));
		next.codes = c.codes;
		next.code_text = c.codeText;
		next.code_system = c.codeSystem;
		next.code_uris = c.codeUris;
	}
	if (!opts.allowDuplicate && (next.title !== row.title || next.plan.slice(0, 20) !== row.plan.slice(0, 20))) {
		const dup = findDuplicate(db, encounterId, next.title, next.plan, id);
		if (dup) throw dupError(dup, next.title);
	}
	db.prepare(
		'UPDATE imp_items SET title = ?, codes = ?, code_text = ?, code_system = ?, code_uris = ?, plan = ?, updated_at = ?, updated_by = ? WHERE id = ? AND encounter_id = ?'
	).run(
		next.title,
		next.codes,
		next.code_text,
		next.code_system,
		next.code_uris,
		next.plan,
		(opts.now ?? new Date()).toISOString(),
		userId,
		id,
		encounterId
	);
	return toItem(next);
}

/**
 * Which set to check an edited codes list with: the item's own set when every code in it is already on
 * the item (removing a code from an old ICD-10-CM item after the practice switched), else the current set.
 */
function codeSetForPatch(db: DB, row: ItemRow, raw: unknown): CodeSetId {
	const own = systemOf(row);
	const current = currentCodeSet(db);
	if (own === current || typeof raw !== 'string') return current;
	const have = row.codes.split(/,\s*/).filter(Boolean);
	const norm = (c: string) => (own === 'icd11' ? icd11Normalize(c) : displayCode(c));
	const asked = raw.replace(/\s*&\s*/g, '&').split(/[,;\s]+/).filter(Boolean);
	return asked.length > 0 && asked.every((c) => have.includes(norm(c) ?? '')) ? own : current;
}

/** Deletes one item of this visit and renumbers the rest. False when it is not this visit's item. */
export function deleteItem(db: DB, patientId: number, encounterId: number, id: number): boolean {
	if (!getEncounter(db, patientId, encounterId)) return false;
	db.exec('BEGIN');
	try {
		const r = db.prepare('DELETE FROM imp_items WHERE id = ? AND encounter_id = ?').run(id, encounterId);
		if (r.changes === 0) {
			db.exec('ROLLBACK');
			return false;
		}
		renumber(
			db,
			itemRows(db, encounterId).map((x) => x.id)
		);
		db.exec('COMMIT');
		return true;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

/** Sets the order to `ids`, which must be exactly this visit's items (else PlanConflictError: reload). */
export function reorderItems(db: DB, patientId: number, encounterId: number, ids: unknown): ImpItem[] | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	if (!Array.isArray(ids) || !ids.every((x) => Number.isSafeInteger(x))) throw new PlanValidationError('Expected a list of item ids.');
	const current = itemRows(db, encounterId).map((r) => r.id);
	const asked = ids as number[];
	if (asked.length !== current.length || new Set(asked).size !== asked.length || !asked.every((id) => current.includes(id))) {
		throw new PlanConflictError('The impression list changed in another window. It has been reloaded; try again.');
	}
	db.exec('BEGIN');
	try {
		renumber(db, asked);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return itemRows(db, encounterId).map(toItem);
}

/** "New Dx" box (§10.4): parses and adds a free item; null result when the text is too short. */
export function addNewDx(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	textIn: unknown,
	opts: { index?: number; allowDuplicate?: boolean; now?: Date } = {}
): { item: ImpItem | null } | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	if (typeof textIn !== 'string' || textIn.length > TITLE_MAX + PLAN_MAX + 100) throw new PlanValidationError('The new diagnosis text is too long.');
	const parsed = parseNewDx(textIn, currentCodeSet(db));
	if (!parsed) return { item: null };
	return { item: addItem(db, patientId, encounterId, userId, { kind: 'free', title: parsed.title, codes: parsed.code, plan: parsed.plan }, opts) };
}

// ---------- orders (§10.6) ----------

/** The provider's orders list, seeded from ORDER_SEED the first time (never again once seeded). */
export function listOrderOptions(db: DB, userId: number, now = new Date()): OrderOption[] {
	const seeded = db.prepare('SELECT 1 AS x FROM order_options_seeded WHERE user_id = ?').get(userId);
	if (!seeded && db.prepare('SELECT 1 AS x FROM users WHERE id = ?').get(userId)) {
		db.exec('BEGIN');
		try {
			const ins = db.prepare('INSERT INTO order_options (user_id, seq, label, cpt) VALUES (?, ?, ?, ?)');
			ORDER_SEED.forEach((o, i) => ins.run(userId, i + 1, o.label, o.cpt));
			db.prepare('INSERT INTO order_options_seeded (user_id, seeded_at) VALUES (?, ?)').run(userId, now.toISOString());
			db.exec('COMMIT');
		} catch (e) {
			db.exec('ROLLBACK');
			throw e;
		}
	}
	return db.prepare('SELECT id, label, cpt FROM order_options WHERE user_id = ? ORDER BY seq, id').all(userId) as unknown as OrderOption[];
}

function cleanCpt(v: unknown): string {
	const s = line(v, 'CPT code', 5).toUpperCase();
	if (s && !CPT_RE.test(s)) throw new PlanValidationError('A CPT code is 5 characters: 5 digits, or 4 digits and F or T. Leave it empty if the order is not billed.');
	return s;
}

/** Orders list editor (pencil): add / update / delete / reorder the user's own list items. */
export function addOrderOption(db: DB, userId: number, input: { label?: unknown; cpt?: unknown }): OrderOption {
	const list = listOrderOptions(db, userId);
	if (list.length >= MAX_ORDER_OPTIONS) throw new PlanValidationError(`The list holds up to ${MAX_ORDER_OPTIONS} orders.`);
	const label = line(input.label, 'Order', ORDER_LABEL_MAX);
	if (!label) throw new PlanValidationError('Name the order.');
	if (list.some((o) => o.label.toLowerCase() === label.toLowerCase())) throw new PlanValidationError(`"${label}" is already in the list.`);
	const cpt = cleanCpt(input.cpt);
	const r = db.prepare('INSERT INTO order_options (user_id, seq, label, cpt) VALUES (?, ?, ?, ?)').run(userId, list.length + 1, label, cpt);
	return { id: Number(r.lastInsertRowid), label, cpt };
}

export function updateOrderOption(db: DB, userId: number, id: number, input: { label?: unknown; cpt?: unknown }): OrderOption | null {
	const list = listOrderOptions(db, userId);
	const cur = list.find((o) => o.id === id);
	if (!cur) return null;
	const label = input.label === undefined ? cur.label : line(input.label, 'Order', ORDER_LABEL_MAX);
	if (!label) throw new PlanValidationError('Name the order.');
	if (list.some((o) => o.id !== id && o.label.toLowerCase() === label.toLowerCase())) throw new PlanValidationError(`"${label}" is already in the list.`);
	const cpt = input.cpt === undefined ? cur.cpt : cleanCpt(input.cpt);
	db.prepare('UPDATE order_options SET label = ?, cpt = ? WHERE id = ? AND user_id = ?').run(label, cpt, id, userId);
	return { id, label, cpt };
}

/** Removes a list item; visits that already have it keep their copy. */
export function deleteOrderOption(db: DB, userId: number, id: number): boolean {
	listOrderOptions(db, userId);
	return db.prepare('DELETE FROM order_options WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function reorderOrderOptions(db: DB, userId: number, ids: unknown): OrderOption[] {
	const list = listOrderOptions(db, userId);
	if (!Array.isArray(ids) || !ids.every((x) => Number.isSafeInteger(x))) throw new PlanValidationError('Expected a list of order ids.');
	const asked = ids as number[];
	if (asked.length !== list.length || new Set(asked).size !== asked.length || !asked.every((id) => list.some((o) => o.id === id))) {
		throw new PlanConflictError('The orders list changed in another window. It has been reloaded; try again.');
	}
	db.exec('BEGIN');
	try {
		const upd = db.prepare('UPDATE order_options SET seq = ? WHERE id = ? AND user_id = ?');
		asked.forEach((id, i) => upd.run(i + 1, id, userId));
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return listOrderOptions(db, userId);
}

function visitOrders(db: DB, encounterId: number): VisitOrder[] {
	return (
		db.prepare('SELECT option_id, label, cpt FROM visit_orders WHERE encounter_id = ? ORDER BY priority, id').all(encounterId) as {
			option_id: number | null;
			label: string;
			cpt: string;
		}[]
	).map((r) => ({ optionId: r.option_id, label: r.label, cpt: r.cpt }));
}

function orderPlan(db: DB, encounterId: number): string {
	return (db.prepare('SELECT plan FROM visit_order_plan WHERE encounter_id = ?').get(encounterId) as { plan: string } | undefined)?.plan ?? '';
}

/**
 * Saves this visit's checked orders and free-text plan: clears and re-inserts THIS exam's orders only
 * (§10.6 FIX: never another same-day exam's). `optionIds` are items of the visit provider's list; ids no
 * longer in the list keep the copy already saved on this visit. No orders checked is fine.
 */
export function saveOrders(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	optionIds: unknown,
	planIn: unknown,
	now = new Date()
): { orders: VisitOrder[]; orderPlan: string } | null {
	const enc = getEncounter(db, patientId, encounterId);
	if (!enc) return null;
	const ids = optionIds === undefined || optionIds === null ? [] : optionIds;
	if (!Array.isArray(ids) || !ids.every((x) => Number.isSafeInteger(x))) throw new PlanValidationError('Expected a list of order ids.');
	const plan = text(planIn, 'Plan', ORDER_PLAN_MAX);
	const options = listOrderOptions(db, enc.providerId, now);
	const previous = visitOrders(db, encounterId);
	const wanted = [...new Set(ids as number[])];
	const rows: VisitOrder[] = [];
	// Keep list order for current items; removed list items that were already saved stay after them.
	for (const o of options) if (wanted.includes(o.id)) rows.push({ optionId: o.id, label: o.label, cpt: o.cpt });
	for (const p of previous) if (p.optionId !== null && wanted.includes(p.optionId) && !options.some((o) => o.id === p.optionId)) rows.push(p);
	const unknown = wanted.filter((id) => !rows.some((r) => r.optionId === id));
	if (unknown.length) throw new PlanValidationError('An order is no longer in the list. Reload the panel.');
	const at = now.toISOString();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM visit_orders WHERE encounter_id = ?').run(encounterId);
		const ins = db.prepare(
			`INSERT INTO visit_orders (encounter_id, option_id, priority, label, cpt, status, placed_on, placed_by, saved_at, saved_by)
			 VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
		);
		rows.forEach((r, i) => ins.run(encounterId, r.optionId, i + 1, r.label, r.cpt, enc.date, enc.providerId, at, userId));
		db.prepare(
			`INSERT INTO visit_order_plan (encounter_id, plan, updated_at, updated_by) VALUES (?, ?, ?, ?)
			 ON CONFLICT(encounter_id) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
		).run(encounterId, plan, at, userId);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return { orders: visitOrders(db, encounterId), orderPlan: plan };
}

// ---------- reading ----------

/** Everything the panel (and the Coding panel) needs; null for a wrong patient/visit. */
export function getPlanData(db: DB, patientId: number, encounterId: number, userId: number): PlanData | null {
	const enc = getEncounter(db, patientId, encounterId);
	if (!enc) return null;
	const details = visitOrders(db, encounterId);
	return {
		items: itemRows(db, encounterId).map(toItem),
		orders: details.map((d) => d.label),
		orderDetails: details,
		orderPlan: orderPlan(db, encounterId),
		orderOptions: listOrderOptions(db, enc.providerId),
		canEditOrders: enc.providerId === userId,
		orderListOwner: enc.provider,
		codeSet: currentCodeSet(db),
		usBilling: getCodeSettings(db).usBilling
	};
}

/**
 * Builder rows (§10.2): the engine over `findings` (the panel's current values, so unsaved typing counts)
 * plus the patient's issues. Null for a wrong patient/visit.
 */
export function getCandidates(db: DB, patientId: number, encounterId: number, findings: Record<string, string>): CandidateSet | null {
	const enc = getEncounter(db, patientId, encounterId);
	if (!enc) return null;
	const issues = listIssues(db, patientId, enc.date);
	if (currentCodeSet(db) === 'icd11') {
		// ICD-11 (D44): WHO titles only; the ICD-10-CM table is not consulted at all.
		const icd11 = icd11Lookup(db);
		return {
			findings: findingCandidates({ findings, issues, visitDate: enc.date, codeSet: 'icd11', icd11 }),
			...issueCandidates(undefined, issues, { codeSet: 'icd11', icd11 })
		};
	}
	const lookup = icd10Lookup(db);
	return {
		findings: findingCandidates({ findings, issues, visitDate: enc.date, lookup }),
		...issueCandidates(lookup, issues)
	};
}

/** The plan as printed; null when nothing is recorded. */
export function getPlanForReport(db: DB, encounterId: number): PlanReport | null {
	const items = itemRows(db, encounterId).map((r) => ({
		title: r.title,
		codes: r.codes,
		codeText: r.code_text,
		codeSystem: systemOf(r),
		codeUris: r.code_uris,
		plan: r.plan
	}));
	const orders = visitOrders(db, encounterId).map((o) => o.label);
	const plan = orderPlan(db, encounterId);
	if (!items.length && !orders.length && !plan) return null;
	return { items, orders, orderPlan: plan };
}
