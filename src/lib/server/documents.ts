// Patient documents and images (docs/spec/BEHAVIOR.md §15.4, flow sheet §8.3).
// - Every lookup is an exact key: document id AND patient id (§17 S9 FIX; the original matched
//   file names with a wildcard and could show or delete another patient's file).
// - The type is decided by the file's first bytes, never its name or the browser's claim, and the
//   size is capped (§17 S17 FIX). Only PNG, JPEG and PDF are stored.
// - "Latest" means the newest clinical date (taken_on), then upload time (§15.4 FIX).
// - Delete is soft: the row keeps who and when, and is never served again.
import { createHash } from 'node:crypto';
import type { DB } from './db.ts';
import { getEncounter } from './exam.ts';
import { localToday } from './patients.ts';
import {
	DOC_ZONES,
	MAX_DOCUMENT_BYTES,
	type DocCategory,
	type DocMeta,
	type DocMime,
	type DocZone,
	type ZoneCategorySummary
} from '#lib/components/documents/types.ts';

export { MAX_DOCUMENT_BYTES };

export const MAX_NOTES = 2000;
const MAX_FILENAME = 120;

/** A bad upload or edit. `status` is the HTTP status the API should answer with. */
export class DocumentError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 413 | 415 = 400
	) {
		super(message);
	}
}

export function isDocZone(z: unknown): z is DocZone {
	return typeof z === 'string' && (DOC_ZONES as readonly string[]).includes(z);
}

/** The real type of the bytes, or null when they are not a PNG, JPEG or PDF. */
export function sniffMime(b: Uint8Array): DocMime | null {
	// PNG: 8-byte signature, then an IHDR chunk.
	if (
		b.length >= 33 &&
		b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
		b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a &&
		b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52
	) {
		return 'image/png';
	}
	// JPEG: SOI marker followed by another marker.
	if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	// PDF: "%PDF-" at the very start (we do not accept junk before the header).
	if (b.length >= 8 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
	return null;
}

const EXT: Record<DocMime, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };

/** A display file name: no folders, no control or quote characters, bounded length, never empty. */
export function cleanFilename(name: string | null | undefined, mime: DocMime): string {
	let n = String(name ?? '')
		.split(/[\\/]/)
		.pop()!
		.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '')
		.trim();
	if (n.length > MAX_FILENAME) {
		const dot = n.lastIndexOf('.');
		const ext = dot > 0 && n.length - dot <= 6 ? n.slice(dot) : '';
		n = n.slice(0, MAX_FILENAME - ext.length) + ext;
	}
	return n && n !== '.' && n !== '..' ? n : `document.${EXT[mime]}`;
}

function isRealDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function checkDate(s: string, today: string): string {
	if (!isRealDate(s)) throw new DocumentError('Date taken must be a real date (YYYY-MM-DD)');
	if (s > today) throw new DocumentError('Date taken cannot be in the future');
	if (s < '1900-01-01') throw new DocumentError('Date taken is too far in the past');
	return s;
}

// ---------- categories ----------

export function listCategories(db: DB): DocCategory[] {
	const cats = db.prepare('SELECT id, name, flow FROM document_categories ORDER BY seq, name').all() as {
		id: string;
		name: string;
		flow: 'VF' | 'OCT' | null;
	}[];
	const zones = db.prepare('SELECT category_id, zone FROM document_category_zones').all() as { category_id: string; zone: DocZone }[];
	return cats.map((c) => ({
		id: c.id,
		name: c.name,
		flow: c.flow,
		zones: DOC_ZONES.filter((z) => zones.some((r) => r.category_id === c.id && r.zone === z))
	}));
}

/** Categories shown in a zone, in display order. OTHER = categories with no zone. */
export function categoriesForZone(db: DB, zone: DocZone): DocCategory[] {
	return listCategories(db).filter((c) => (zone === 'OTHER' ? c.zones.length === 0 : c.zones.includes(zone)));
}

// ---------- reads ----------

interface Row {
	id: number;
	patient_id: number;
	encounter_id: number | null;
	category: string;
	category_name: string;
	filename: string;
	mime: DocMime;
	size: number;
	sha256: string;
	taken_on: string;
	notes: string;
	created_at: string;
	created_by_name: string;
}

const META_COLS = `d.id, d.patient_id, d.encounter_id, d.category, c.name AS category_name, d.filename, d.mime, d.size,
	d.sha256, d.taken_on, d.notes, d.created_at, u.display_name AS created_by_name`;
const FROM = `FROM documents d
	JOIN document_categories c ON c.id = d.category
	JOIN users u ON u.id = d.created_by`;
/** Newest clinical date first; same day: last uploaded first (§15.4 FIX: never insertion order alone). */
const NEWEST = 'ORDER BY d.taken_on DESC, d.created_at DESC, d.id DESC';

const toMeta = (r: Row): DocMeta => ({
	id: r.id,
	patientId: r.patient_id,
	encounterId: r.encounter_id,
	category: r.category,
	categoryName: r.category_name,
	filename: r.filename,
	mime: r.mime,
	size: r.size,
	sha256: r.sha256,
	takenOn: r.taken_on,
	notes: r.notes,
	createdAt: r.created_at,
	createdBy: r.created_by_name
});

const patientExists = (db: DB, pid: number) => !!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(pid);

export interface DocFilter {
	category?: string;
	zone?: DocZone;
	flow?: 'VF' | 'OCT';
	encounterId?: number;
}

/** This patient's documents, newest first. Null when the patient does not exist. */
export function listDocuments(db: DB, patientId: number, filter: DocFilter = {}): DocMeta[] | null {
	if (!patientExists(db, patientId)) return null;
	const where = ['d.patient_id = ?', 'd.deleted_at IS NULL'];
	const args: (string | number)[] = [patientId];
	if (filter.category) {
		where.push('d.category = ?');
		args.push(filter.category);
	}
	if (filter.flow) {
		where.push('c.flow = ?');
		args.push(filter.flow);
	}
	if (filter.encounterId !== undefined) {
		where.push('d.encounter_id = ?');
		args.push(filter.encounterId);
	}
	if (filter.zone === 'OTHER') {
		where.push('NOT EXISTS (SELECT 1 FROM document_category_zones z WHERE z.category_id = d.category)');
	} else if (filter.zone) {
		where.push('EXISTS (SELECT 1 FROM document_category_zones z WHERE z.category_id = d.category AND z.zone = ?)');
		args.push(filter.zone);
	}
	const rows = db.prepare(`SELECT ${META_COLS} ${FROM} WHERE ${where.join(' AND ')} ${NEWEST}`).all(...args) as unknown as Row[];
	return rows.map(toMeta);
}

/** One document's details, only when it belongs to this patient and is not deleted. */
export function getDocumentMeta(db: DB, patientId: number, id: number): DocMeta | null {
	const r = db
		.prepare(`SELECT ${META_COLS} ${FROM} WHERE d.id = ? AND d.patient_id = ? AND d.deleted_at IS NULL`)
		.get(id, patientId) as unknown as Row | undefined;
	return r ? toMeta(r) : null;
}

/** The file itself (same scoping as getDocumentMeta). */
export function getDocumentFile(db: DB, patientId: number, id: number): (DocMeta & { data: Uint8Array }) | null {
	const meta = getDocumentMeta(db, patientId, id);
	if (!meta) return null;
	const r = db.prepare('SELECT data FROM documents WHERE id = ? AND patient_id = ?').get(id, patientId) as { data: Uint8Array };
	return { ...meta, data: r.data };
}

/** The latest document of a category by clinical date (§15.4 FIX). */
export function latestDocument(db: DB, patientId: number, category: string): DocMeta | null {
	return listDocuments(db, patientId, { category })?.[0] ?? null;
}

/** For a zone's documents strip: every category of the zone with its count and latest file. */
export function zoneSummary(db: DB, patientId: number, zone: DocZone): ZoneCategorySummary[] | null {
	const docs = listDocuments(db, patientId, { zone });
	if (!docs) return null;
	return categoriesForZone(db, zone).map((c) => {
		const mine = docs.filter((d) => d.category === c.id);
		return { category: c.id, name: c.name, count: mine.length, latest: mine[0] ?? null };
	});
}

// ---------- writes ----------

export interface UploadInput {
	category: string;
	filename?: string | null;
	/** Ties the file to one visit (exam documents); omitted = patient-level. */
	encounterId?: number | null;
	/** YYYY-MM-DD; default: the visit's date, else today. */
	takenOn?: string | null;
	notes?: string | null;
	bytes: Uint8Array;
}

/**
 * Stores a new document. Returns null when the patient (or the visit, for this patient) does not
 * exist; throws DocumentError for a bad category, type, size, date or note.
 */
export function uploadDocument(db: DB, patientId: number, input: UploadInput, userId: number, now = new Date()): DocMeta | null {
	const { bytes } = input;
	if (bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentError('File is larger than 15 MB', 413);
	if (bytes.length === 0) throw new DocumentError('The file is empty');
	const mime = sniffMime(bytes);
	if (!mime) throw new DocumentError('Only PNG, JPEG and PDF files can be stored', 415);
	if (!db.prepare('SELECT 1 FROM document_categories WHERE id = ?').get(input.category)) {
		throw new DocumentError('Unknown document category');
	}
	const notes = (input.notes ?? '').trim();
	if (notes.length > MAX_NOTES) throw new DocumentError(`Notes are limited to ${MAX_NOTES} characters`);
	if (!patientExists(db, patientId)) return null;
	let encounterDate: string | null = null;
	if (input.encounterId != null) {
		const enc = getEncounter(db, patientId, input.encounterId);
		if (!enc) return null;
		encounterDate = enc.date;
	}
	const today = localToday(now);
	const takenOn = input.takenOn ? checkDate(input.takenOn, today) : (encounterDate ?? today);
	const r = db
		.prepare(
			`INSERT INTO documents (patient_id, encounter_id, category, filename, mime, size, sha256, data, taken_on, notes, created_at, created_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			patientId,
			input.encounterId ?? null,
			input.category,
			cleanFilename(input.filename, mime),
			mime,
			bytes.length,
			createHash('sha256').update(bytes).digest('hex'),
			bytes,
			takenOn,
			notes,
			now.toISOString(),
			userId
		);
	return getDocumentMeta(db, patientId, Number(r.lastInsertRowid));
}

export interface DocumentEdit {
	notes?: unknown;
	takenOn?: unknown;
	category?: unknown;
}

/** Edits notes / date taken / category. Null when the document is not this patient's (or deleted). */
export function updateDocument(db: DB, patientId: number, id: number, edit: DocumentEdit, userId: number, now = new Date()): DocMeta | null {
	const cur = getDocumentMeta(db, patientId, id);
	if (!cur) return null;
	let { notes, takenOn, category } = cur;
	if (edit.notes !== undefined) {
		if (typeof edit.notes !== 'string') throw new DocumentError('Notes must be text');
		notes = edit.notes.trim();
		if (notes.length > MAX_NOTES) throw new DocumentError(`Notes are limited to ${MAX_NOTES} characters`);
	}
	if (edit.takenOn !== undefined) {
		if (typeof edit.takenOn !== 'string') throw new DocumentError('Date taken must be text');
		takenOn = checkDate(edit.takenOn, localToday(now));
	}
	if (edit.category !== undefined) {
		if (typeof edit.category !== 'string' || !db.prepare('SELECT 1 FROM document_categories WHERE id = ?').get(edit.category)) {
			throw new DocumentError('Unknown document category');
		}
		category = edit.category;
	}
	db.prepare(
		`UPDATE documents SET notes = ?, taken_on = ?, category = ?, updated_at = ?, updated_by = ?
		  WHERE id = ? AND patient_id = ? AND deleted_at IS NULL`
	).run(notes, takenOn, category, now.toISOString(), userId, id, patientId);
	return getDocumentMeta(db, patientId, id);
}

/** Soft delete. False when the document is not this patient's or is already deleted. */
export function deleteDocument(db: DB, patientId: number, id: number, userId: number, now = new Date()): boolean {
	const r = db
		.prepare('UPDATE documents SET deleted_at = ?, deleted_by = ? WHERE id = ? AND patient_id = ? AND deleted_at IS NULL')
		.run(now.toISOString(), userId, id, patientId);
	return Number(r.changes) === 1;
}
