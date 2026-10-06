// Exam drawings (docs/spec/BEHAVIOR.md §5). Stored as PNG, keyed by the exact encounter and zone,
// and every save is a new row so history is kept (§5.3 FIX). The latest drawing is the highest id.
// Every read and write goes through the patient id as well, so a guessed id never reaches
// another patient's drawing (the original matched documents by a wildcard name).
import type { DB } from './db.ts';
import { getEncounter } from './exam.ts';

/** Zones that own a canvas (§5.1). SDRETINA arrives with scleral depression. */
export const DRAWING_ZONES = ['EXT', 'ANTSEG', 'RETINA', 'HPI', 'NEURO', 'IMPPLAN'] as const;
export type DrawingZone = (typeof DRAWING_ZONES)[number];

/** Upper bound for one PNG. A 900×500 line drawing is usually well under 200 KB. */
export const MAX_DRAWING_BYTES = 1_500_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class DrawingError extends Error {}

export function isDrawingZone(zone: unknown): zone is DrawingZone {
	return typeof zone === 'string' && (DRAWING_ZONES as readonly string[]).includes(zone);
}

/** True when the bytes start with the PNG signature and an IHDR chunk. */
export function isPng(bytes: Uint8Array): boolean {
	if (bytes.length < 33) return false;
	for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
	// First chunk must be IHDR (length 13).
	return bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
}

export interface SavedDrawing {
	id: number;
	savedAt: string;
}

/**
 * Stores a new version of the drawing. Returns null when the encounter does not belong to
 * the patient; throws DrawingError for a bad zone or image.
 */
export function saveDrawing(
	db: DB,
	patientId: number,
	encounterId: number,
	zone: string,
	png: Uint8Array,
	userId: number,
	now = new Date()
): SavedDrawing | null {
	if (!isDrawingZone(zone)) throw new DrawingError(`Unknown drawing zone ${zone}`);
	if (png.length > MAX_DRAWING_BYTES) throw new DrawingError('Drawing is too large');
	if (!isPng(png)) throw new DrawingError('Drawing must be a PNG image');
	if (!getEncounter(db, patientId, encounterId)) return null;
	const savedAt = now.toISOString();
	const r = db
		.prepare('INSERT INTO drawings (encounter_id, zone, png, created_at, created_by) VALUES (?, ?, ?, ?, ?)')
		.run(encounterId, zone, png, savedAt, userId);
	return { id: Number(r.lastInsertRowid), savedAt };
}

export interface DrawingImage {
	id: number;
	encounterId: number;
	zone: DrawingZone;
	png: Uint8Array;
	savedAt: string;
}

interface Row {
	id: number;
	encounter_id: number;
	zone: DrawingZone;
	png: Uint8Array;
	created_at: string;
}

const toImage = (r: Row): DrawingImage => ({
	id: r.id,
	encounterId: r.encounter_id,
	zone: r.zone,
	png: r.png,
	savedAt: r.created_at
});

/** Latest version for this exam and zone, or null (no drawing, bad zone, or wrong patient). */
export function getLatestDrawing(db: DB, patientId: number, encounterId: number, zone: string): DrawingImage | null {
	if (!isDrawingZone(zone) || !getEncounter(db, patientId, encounterId)) return null;
	const r = db
		.prepare(
			`SELECT id, encounter_id, zone, png, created_at FROM drawings
			  WHERE encounter_id = ? AND zone = ? ORDER BY id DESC LIMIT 1`
		)
		.get(encounterId, zone) as Row | undefined;
	return r ? toImage(r) : null;
}

/** One stored version by id, only when it belongs to one of this patient's encounters. */
export function getDrawingById(db: DB, patientId: number, drawingId: number): DrawingImage | null {
	const r = db
		.prepare(
			`SELECT d.id, d.encounter_id, d.zone, d.png, d.created_at
			   FROM drawings d JOIN encounters e ON e.id = d.encounter_id
			  WHERE d.id = ? AND e.patient_id = ?`
		)
		.get(drawingId, patientId) as Row | undefined;
	return r ? toImage(r) : null;
}

export interface PriorDrawing {
	id: number;
	encounterId: number;
	date: string;
	visitType: string;
}

/**
 * This patient's latest drawing for the zone from every OTHER encounter, newest visit first
 * (§5.4). Sorted by the real visit date, then encounter id (FIX: the original sorted formatted
 * date strings). Null when the encounter does not belong to the patient.
 */
export function listPriorDrawings(db: DB, patientId: number, encounterId: number, zone: string): PriorDrawing[] | null {
	if (!getEncounter(db, patientId, encounterId)) return null;
	if (!isDrawingZone(zone)) return [];
	return (
		db
			.prepare(
				`SELECT MAX(d.id) AS id, e.id AS encounter_id, e.date, e.visit_type
				   FROM drawings d JOIN encounters e ON e.id = d.encounter_id
				  WHERE e.patient_id = ? AND e.id <> ? AND d.zone = ?
				  GROUP BY e.id
				  ORDER BY e.date DESC, e.id DESC`
			)
			.all(patientId, encounterId, zone) as { id: number; encounter_id: number; date: string; visit_type: string }[]
	).map((r) => ({ id: r.id, encounterId: r.encounter_id, date: r.date, visitType: r.visit_type }));
}

/** Zones of this encounter that have at least one saved drawing (for the report, §13.4). */
export function drawingZones(db: DB, encounterId: number): DrawingZone[] {
	const rows = db.prepare('SELECT DISTINCT zone FROM drawings WHERE encounter_id = ?').all(encounterId) as { zone: string }[];
	const have = new Set(rows.map((r) => r.zone));
	return DRAWING_ZONES.filter((z) => have.has(z));
}
