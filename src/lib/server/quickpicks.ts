// Per-provider quick-pick lists (spec §4.1). A provider's list is created from the
// starter seed the first time it is needed, then belongs to them.
import type { DB } from './db.ts';
import { seedRows, type QuickPick } from '#lib/exam/quickpicks.ts';

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
