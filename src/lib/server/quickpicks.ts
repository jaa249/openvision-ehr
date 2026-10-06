// Per-provider quick-pick lists (spec §4.1). A provider's list is created from the
// starter seed the first time it is needed, then belongs to them.
import type { DB } from './db.ts';
import { QP_ZONES, seedRows, type PickMode, type QpZone, type QuickPick } from '#lib/exam/quickpicks.ts';
import { SECTION_DEF, type SectionId } from '#lib/exam/catalog.ts';

export function getQuickPicks(db: DB, userId: number): QuickPick[] {
	const read = () =>
		db
			.prepare('SELECT id, zone, row, label, text, mode FROM qp_items WHERE user_id = ? ORDER BY zone, seq, id')
			.all(userId) as unknown as QuickPick[];
	let rows = read();
	if (rows.length === 0) {
		seedQuickPicks(db, userId);
		rows = read();
	}
	return rows;
}

export function seedQuickPicks(db: DB, userId: number): void {
	const insert = db.prepare(
		'INSERT INTO qp_items (user_id, zone, row, label, text, mode, seq) VALUES (?, ?, ?, ?, ?, ?, ?)'
	);
	db.exec('BEGIN');
	try {
		seedRows().forEach((r, i) => insert.run(userId, r.zone, r.row, r.label, r.text, r.mode, i));
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

// ---------------------------------------------------------------- editor (the "pencil", spec §4.1)
// Every write is scoped to (user, zone): an id from someone else's list changes nothing.

export class QuickPickError extends Error {
	errors: Record<string, string>;
	constructor(errors: Record<string, string>) {
		super(Object.values(errors)[0] ?? 'Invalid quick pick');
		this.errors = errors;
	}
}

export const QP_LABEL_MAX = 40;
export const QP_TEXT_MAX = 200;
const QP_MODES: PickMode[] = ['add', 'replace', 'append'];
const QP_PER_ZONE_MAX = 300;
const CONTROL = /[\u0000-\u001f\u007f]/;

export function isQpZone(z: unknown): z is QpZone {
	return typeof z === 'string' && (QP_ZONES as string[]).includes(z);
}

/** The rows a pick in this zone may target (the section's text-grid rows). */
export function zoneRows(zone: QpZone): { id: string; label: string }[] {
	return (SECTION_DEF.get(zone as SectionId)?.rows ?? []).map((r) => ({ id: r.id, label: r.label }));
}

export type PickInput = { row: unknown; label: unknown; text: unknown; mode: unknown };

function checkPick(zone: QpZone, input: PickInput): Omit<QuickPick, 'id'> {
	const errors: Record<string, string> = {};
	const row = typeof input.row === 'string' ? input.row : '';
	const label = typeof input.label === 'string' ? input.label.trim() : '';
	const text = typeof input.text === 'string' ? input.text.trim() : '';
	const mode = input.mode as PickMode;
	if (!zoneRows(zone).some((r) => r.id === row)) errors.row = 'Choose the row this pick writes to.';
	if (!label) errors.label = 'Label is required.';
	else if (label.length > QP_LABEL_MAX) errors.label = `Label must be ${QP_LABEL_MAX} characters or fewer.`;
	else if (CONTROL.test(label)) errors.label = 'Label contains characters that are not allowed.';
	if (text.length > QP_TEXT_MAX) errors.text = `Text must be ${QP_TEXT_MAX} characters or fewer.`;
	else if (CONTROL.test(text)) errors.text = 'Text contains characters that are not allowed.';
	if (!QP_MODES.includes(mode)) errors.mode = 'Choose add, replace or append.';
	else if (!text && mode !== 'replace') errors.text = 'Text is required (only a "replace" pick may be empty: it clears the field).';
	if (Object.keys(errors).length) throw new QuickPickError(errors);
	return { zone, row, label, text, mode };
}

/** One zone's list in display order (seeding the provider's lists on first use). */
export function listZone(db: DB, userId: number, zone: QpZone): QuickPick[] {
	return getQuickPicks(db, userId).filter((p) => p.zone === zone);
}

export function addPick(db: DB, userId: number, zone: QpZone, input: PickInput): number {
	const p = checkPick(zone, input);
	getQuickPicks(db, userId); // seed first, so adding to an untouched list keeps the starter picks
	const { n, m } = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(seq), -1) AS m FROM qp_items WHERE user_id = ? AND zone = ?').get(userId, zone) as {
		n: number;
		m: number;
	};
	if (n >= QP_PER_ZONE_MAX) throw new QuickPickError({ form: `A list can hold at most ${QP_PER_ZONE_MAX} picks.` });
	const r = db
		.prepare('INSERT INTO qp_items (user_id, zone, row, label, text, mode, seq) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.run(userId, zone, p.row, p.label, p.text, p.mode, m + 1);
	return Number(r.lastInsertRowid);
}

export function updatePick(db: DB, userId: number, zone: QpZone, id: number, input: PickInput): boolean {
	const p = checkPick(zone, input);
	const r = db
		.prepare('UPDATE qp_items SET row = ?, label = ?, text = ?, mode = ? WHERE id = ? AND user_id = ? AND zone = ?')
		.run(p.row, p.label, p.text, p.mode, id, userId, zone);
	return Number(r.changes) > 0;
}

export function deletePick(db: DB, userId: number, zone: QpZone, id: number): boolean {
	return Number(db.prepare('DELETE FROM qp_items WHERE id = ? AND user_id = ? AND zone = ?').run(id, userId, zone).changes) > 0;
}

/**
 * Sets the zone's order. `ids` must be exactly the zone's pick ids (any order); anything else is
 * refused so a stale page cannot drop or duplicate picks.
 */
export function reorderZone(db: DB, userId: number, zone: QpZone, ids: number[]): boolean {
	const current = listZone(db, userId, zone).map((p) => p.id);
	if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) return false;
	const up = db.prepare('UPDATE qp_items SET seq = ? WHERE id = ? AND user_id = ? AND zone = ?');
	db.exec('BEGIN');
	try {
		ids.forEach((id, seq) => up.run(seq, id, userId, zone));
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return true;
}

/** Moves one pick up (-1) or down (+1) within its zone. */
export function movePick(db: DB, userId: number, zone: QpZone, id: number, dir: -1 | 1): boolean {
	const ids = listZone(db, userId, zone).map((p) => p.id);
	const i = ids.indexOf(id);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= ids.length) return false;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	return reorderZone(db, userId, zone, ids);
}

/** "Reset to starter list" for one zone: the provider's picks there are replaced by the seed. */
export function resetZone(db: DB, userId: number, zone: QpZone): void {
	getQuickPicks(db, userId); // seed the other zones first, or they would never be seeded
	const insert = db.prepare('INSERT INTO qp_items (user_id, zone, row, label, text, mode, seq) VALUES (?, ?, ?, ?, ?, ?, ?)');
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM qp_items WHERE user_id = ? AND zone = ?').run(userId, zone);
		seedRows()
			.filter((r) => r.zone === zone)
			.forEach((r, i) => insert.run(userId, r.zone, r.row, r.label, r.text, r.mode, i));
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}
