import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { addPick, deletePick, getQuickPicks, listZone, movePick, QuickPickError, reorderZone, resetZone, updatePick } from './quickpicks.ts';
import { applyPick, seedRows } from '#lib/exam/quickpicks.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});
const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof QuickPickError) return e.errors;
		throw e;
	}
	return null;
};
const starter = (zone: string) => seedRows().filter((r) => r.zone === zone).length;

describe('quick-pick editor', () => {
	it('adds to the end of a zone, seeding the starter list first', () => {
		const id = addPick(db, 1, 'ANTSEG', { row: 'CONJ', label: 'SCH', text: 'subconjunctival hemorrhage', mode: 'add' });
		const list = listZone(db, 1, 'ANTSEG');
		expect(list).toHaveLength(starter('ANTSEG') + 1);
		expect(list.at(-1)).toMatchObject({ id, label: 'SCH', text: 'subconjunctival hemorrhage', mode: 'add' });
		expect(listZone(db, 1, 'EXT')).toHaveLength(starter('EXT'));
	});

	it('validates row, label, text and mode', () => {
		const errs = errorsOf(() => addPick(db, 1, 'ANTSEG', { row: 'DISC', label: '', text: 'x'.repeat(201), mode: 'merge' }))!;
		expect(Object.keys(errs).sort()).toEqual(['label', 'mode', 'row', 'text']);
		expect(errorsOf(() => addPick(db, 1, 'ANTSEG', { row: 'CONJ', label: 'empty', text: '', mode: 'add' }))?.text).toBeTruthy();
		expect(addPick(db, 1, 'ANTSEG', { row: 'CONJ', label: 'clear field 2', text: '', mode: 'replace' })).toBeGreaterThan(0);
	});

	it("edits keep each pick's own mode (spec §4.1 FIX)", () => {
		const [a, b] = listZone(db, 1, 'ANTSEG').filter((p) => p.row === 'CORNEA');
		updatePick(db, 1, 'ANTSEG', a.id, { row: 'CORNEA', label: 'clear', text: 'clear', mode: 'append' });
		const after = listZone(db, 1, 'ANTSEG');
		expect(after.find((p) => p.id === a.id)?.mode).toBe('append');
		expect(after.find((p) => p.id === b.id)?.mode).toBe(b.mode);
		const pick = after.find((p) => p.id === a.id)!;
		expect(applyPick({ ODCORNEA: { value: 'edema ', isDefault: false } }, pick, 'OD', null).findings.ODCORNEA.value).toBe('edema clear');
	});

	it('is scoped to the user and zone', () => {
		const mine = listZone(db, 1, 'EXT')[0];
		expect(updatePick(db, 2, 'EXT', mine.id, { row: 'UL', label: 'hijack', text: 'x', mode: 'add' })).toBe(false);
		expect(updatePick(db, 1, 'RETINA', mine.id, { row: 'DISC', label: 'hijack', text: 'x', mode: 'add' })).toBe(false);
		expect(deletePick(db, 2, 'EXT', mine.id)).toBe(false);
		expect(deletePick(db, 1, 'EXT', mine.id)).toBe(true);
		expect(listZone(db, 1, 'EXT').some((p) => p.id === mine.id)).toBe(false);
	});

	it('reorders by buttons and by a full id list; refuses a stale list', () => {
		const ids = listZone(db, 1, 'RETINA').map((p) => p.id);
		expect(movePick(db, 1, 'RETINA', ids[1], -1)).toBe(true);
		expect(listZone(db, 1, 'RETINA').map((p) => p.id).slice(0, 2)).toEqual([ids[1], ids[0]]);
		expect(movePick(db, 1, 'RETINA', ids[1], -1)).toBe(false);
		const reversed = [...ids].reverse();
		expect(reorderZone(db, 1, 'RETINA', reversed)).toBe(true);
		expect(listZone(db, 1, 'RETINA').map((p) => p.id)).toEqual(reversed);
		expect(reorderZone(db, 1, 'RETINA', reversed.slice(1))).toBe(false);
		expect(reorderZone(db, 1, 'RETINA', [...reversed.slice(1), reversed[1]])).toBe(false);
		// the exam sees the same order
		expect(getQuickPicks(db, 1).filter((p) => p.zone === 'RETINA').map((p) => p.id)).toEqual(reversed);
	});

	it('resets one zone to the starter list without touching the others', () => {
		addPick(db, 1, 'EXT', { row: 'UL', label: 'mine', text: 'mine', mode: 'add' });
		deletePick(db, 1, 'ANTSEG', listZone(db, 1, 'ANTSEG')[0].id);
		resetZone(db, 1, 'EXT');
		expect(listZone(db, 1, 'EXT').map((p) => p.label)).toEqual(seedRows().filter((r) => r.zone === 'EXT').map((r) => r.label));
		expect(listZone(db, 1, 'ANTSEG')).toHaveLength(starter('ANTSEG') - 1);
		resetZone(db, 2, 'RETINA'); // a user who never opened the editor still gets every zone
		expect(listZone(db, 2, 'EXT')).toHaveLength(starter('EXT'));
	});
});
