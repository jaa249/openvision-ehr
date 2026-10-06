import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import {
	DrawingError,
	drawingZones,
	getDrawingById,
	getLatestDrawing,
	isPng,
	listPriorDrawings,
	MAX_DRAWING_BYTES,
	saveDrawing
} from './drawings.ts';

/** A minimal byte string that passes the PNG signature + IHDR check; `tag` makes versions distinguishable. */
function png(tag = 0): Uint8Array {
	const b = new Uint8Array(64);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	b[40] = tag;
	return b;
}

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
	// Demo: patient 1 has encounters 1 (today), 3 (2024-08-02), 4 (2025-09-14); patient 2 has encounter 2.
});

describe('ownership', () => {
	it('refuses to save through the wrong patient', () => {
		expect(saveDrawing(db, 2, 1, 'EXT', png(), 1)).toBeNull();
		expect(db.prepare('SELECT COUNT(*) AS n FROM drawings').get()).toEqual({ n: 0 });
	});

	it('never reads another patient’s drawing', () => {
		const saved = saveDrawing(db, 1, 1, 'EXT', png(), 1)!;
		expect(getLatestDrawing(db, 2, 1, 'EXT')).toBeNull();
		expect(getDrawingById(db, 2, saved.id)).toBeNull();
		expect(getDrawingById(db, 1, saved.id)?.encounterId).toBe(1);
		expect(listPriorDrawings(db, 2, 1, 'EXT')).toBeNull();
		// Patient 2's own exam does not list patient 1's drawings as priors.
		expect(listPriorDrawings(db, 2, 2, 'EXT')).toEqual([]);
	});
});

describe('validation', () => {
	it('accepts only PNG bytes', () => {
		expect(isPng(png())).toBe(true);
		const jpeg = new Uint8Array(64);
		jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
		expect(isPng(jpeg)).toBe(false);
		expect(isPng(png().slice(0, 10))).toBe(false);
		expect(() => saveDrawing(db, 1, 1, 'EXT', jpeg, 1)).toThrow(DrawingError);
		expect(() => saveDrawing(db, 1, 1, 'EXT', new TextEncoder().encode('<svg onload=alert(1)>'), 1)).toThrow(DrawingError);
	});

	it('caps the size', () => {
		const big = new Uint8Array(MAX_DRAWING_BYTES + 1);
		big.set(png());
		expect(() => saveDrawing(db, 1, 1, 'EXT', big, 1)).toThrow(/too large/);
	});

	it('allows only known zones', () => {
		for (const z of ['EXT', 'ANTSEG', 'RETINA', 'HPI', 'NEURO', 'IMPPLAN']) expect(saveDrawing(db, 1, 1, z, png(), 1)).not.toBeNull();
		for (const z of ['ext', 'SDRETINA', '../EXT', '', 'EXT%']) expect(() => saveDrawing(db, 1, 1, z, png(), 1)).toThrow(DrawingError);
		expect(getLatestDrawing(db, 1, 1, 'BOGUS')).toBeNull();
	});
});

describe('versioning', () => {
	it('the latest save wins and earlier versions are kept', () => {
		const a = saveDrawing(db, 1, 1, 'ANTSEG', png(1), 1, new Date('2026-10-06T10:00:00Z'))!;
		const b = saveDrawing(db, 1, 1, 'ANTSEG', png(2), 1, new Date('2026-10-06T10:00:05Z'))!;
		expect(b.id).toBeGreaterThan(a.id);
		const latest = getLatestDrawing(db, 1, 1, 'ANTSEG')!;
		expect(latest.id).toBe(b.id);
		expect(latest.png[40]).toBe(2);
		expect(latest.savedAt).toBe('2026-10-06T10:00:05.000Z');
		expect(getDrawingById(db, 1, a.id)?.png[40]).toBe(1);
		expect(db.prepare('SELECT COUNT(*) AS n FROM drawings').get()).toEqual({ n: 2 });
	});

	it('keeps zones apart', () => {
		saveDrawing(db, 1, 1, 'EXT', png(7), 1);
		expect(getLatestDrawing(db, 1, 1, 'RETINA')).toBeNull();
		expect(drawingZones(db, 1)).toEqual(['EXT']);
		saveDrawing(db, 1, 1, 'RETINA', png(8), 1);
		expect(drawingZones(db, 1)).toEqual(['EXT', 'RETINA']);
		expect(drawingZones(db, 4)).toEqual([]);
	});
});

describe('prior drawings', () => {
	it('lists the latest drawing per other encounter, newest visit date first', () => {
		// Saved out of date order on purpose: id order differs from visit-date order.
		saveDrawing(db, 1, 4, 'RETINA', png(1), 1); // 2025-09-14
		saveDrawing(db, 1, 3, 'RETINA', png(2), 1); // 2024-08-02
		const newest4 = saveDrawing(db, 1, 4, 'RETINA', png(3), 1)!;
		saveDrawing(db, 1, 1, 'RETINA', png(4), 1); // the current encounter itself is excluded
		saveDrawing(db, 1, 3, 'EXT', png(5), 1); // other zone excluded
		const list = listPriorDrawings(db, 1, 1, 'RETINA')!;
		expect(list.map((p) => [p.encounterId, p.date])).toEqual([
			[4, '2025-09-14'],
			[3, '2024-08-02']
		]);
		expect(list[0].id).toBe(newest4.id);
	});

	it('sorts by real date, then encounter id for same-day visits', () => {
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (9, 1, 1, '2025-09-14', 'Follow-up')").run();
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (10, 1, 1, '2025-10-01', 'Follow-up')").run();
		saveDrawing(db, 1, 10, 'EXT', png(), 1);
		saveDrawing(db, 1, 9, 'EXT', png(), 1);
		saveDrawing(db, 1, 4, 'EXT', png(), 1);
		saveDrawing(db, 1, 3, 'EXT', png(), 1);
		expect(listPriorDrawings(db, 1, 1, 'EXT')!.map((p) => p.encounterId)).toEqual([10, 9, 4, 3]);
	});
});

describe('report (§13.4)', () => {
	it('lists the drawn zones of the printed visit only', async () => {
		const { getPrintable } = await import('./report.ts');
		expect(getPrintable(db, 1, 1)?.drawingZones).toEqual([]);
		saveDrawing(db, 1, 1, 'RETINA', png(), 1);
		saveDrawing(db, 1, 4, 'EXT', png(), 1);
		expect(getPrintable(db, 1, 1)?.drawingZones).toEqual(['RETINA']);
	});
});
