import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import {
	categoriesForZone,
	cleanFilename,
	deleteDocument,
	DocumentError,
	getDocumentFile,
	getDocumentMeta,
	latestDocument,
	listCategories,
	listDocuments,
	MAX_DOCUMENT_BYTES,
	sniffMime,
	updateDocument,
	uploadDocument,
	zoneSummary
} from './documents.ts';

const NOW = new Date('2026-10-06T15:00:00');

function png(tag = 0): Uint8Array {
	const b = new Uint8Array(64);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	b[40] = tag;
	return b;
}
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const pdf = () => new TextEncoder().encode('%PDF-1.7\n%fake test file\n%%EOF\n');

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
	// Demo: patient 1 has encounters 1 (today), 3 (2024-08-02), 4 (2025-09-14); patient 2 has encounter 2.
});

const up = (pid: number, over: Partial<Parameters<typeof uploadDocument>[2]> = {}, now = NOW) =>
	uploadDocument(db, pid, { category: 'FUNDUS_PHOTO', filename: 'fundus.png', bytes: png(), ...over }, 1, now);

describe('file type by magic bytes', () => {
	it('accepts PNG, JPEG and PDF by content', () => {
		expect(sniffMime(png())).toBe('image/png');
		expect(sniffMime(jpeg())).toBe('image/jpeg');
		expect(sniffMime(pdf())).toBe('application/pdf');
	});

	it('rejects other content whatever the name says', () => {
		expect(sniffMime(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBeNull();
		expect(sniffMime(new TextEncoder().encode('GIF89a......'))).toBeNull();
		expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // truncated PNG
		expect(sniffMime(new TextEncoder().encode(' %PDF-1.7 leading junk'))).toBeNull();
		expect(() => up(1, { filename: 'photo.png', bytes: new TextEncoder().encode('<svg onload=alert(1)>') })).toThrow(DocumentError);
		try {
			up(1, { bytes: new TextEncoder().encode('not an image at all') });
		} catch (e) {
			expect((e as DocumentError).status).toBe(415);
		}
	});

	it('stores the sniffed type, not the declared name', () => {
		const d = up(1, { filename: 'scan.png', bytes: pdf() })!;
		expect(d.mime).toBe('application/pdf');
		expect(d.size).toBe(pdf().length);
		expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('size cap', () => {
	it('refuses files over 15 MB with 413, accepts exactly 15 MB', () => {
		const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
		big.set(png());
		expect(() => up(1, { bytes: big })).toThrow(/15 MB/);
		try {
			up(1, { bytes: big });
		} catch (e) {
			expect((e as DocumentError).status).toBe(413);
		}
		const edge = new Uint8Array(MAX_DOCUMENT_BYTES);
		edge.set(png());
		expect(up(1, { bytes: edge })?.size).toBe(MAX_DOCUMENT_BYTES);
	});

	it('refuses an empty file', () => {
		expect(() => up(1, { bytes: new Uint8Array(0) })).toThrow(/empty/);
	});
});

describe('scoping (S9: exact keyed lookups)', () => {
	it('refuses an unknown patient or another patient’s visit', () => {
		expect(up(99)).toBeNull();
		expect(up(2, { encounterId: 1 })).toBeNull(); // encounter 1 is patient 1's
		expect(db.prepare('SELECT COUNT(*) AS n FROM documents').get()).toEqual({ n: 0 });
	});

	it('never serves another patient’s document', () => {
		const d = up(1)!;
		expect(getDocumentMeta(db, 2, d.id)).toBeNull();
		expect(getDocumentFile(db, 2, d.id)).toBeNull();
		expect(listDocuments(db, 2)).toEqual([]);
		expect(updateDocument(db, 2, d.id, { notes: 'x' }, 1)).toBeNull();
		expect(deleteDocument(db, 2, d.id, 1)).toBe(false);
		expect(getDocumentFile(db, 1, d.id)?.data).toEqual(png());
	});

	it('lists null for a missing patient', () => {
		expect(listDocuments(db, 99)).toBeNull();
		expect(zoneSummary(db, 99, 'EXT')).toBeNull();
	});

	it('defaults the date taken to the visit date, else today', () => {
		expect(up(1, { encounterId: 3 })!.takenOn).toBe('2024-08-02');
		expect(up(1)!.takenOn).toBe('2026-10-06');
		expect(up(1, { encounterId: 3 })!.encounterId).toBe(3);
		expect(up(1)!.encounterId).toBeNull();
	});
});

describe('soft delete', () => {
	it('hides the document but keeps the row with who and when', () => {
		const d = up(1)!;
		expect(deleteDocument(db, 1, d.id, 1, NOW)).toBe(true);
		expect(getDocumentMeta(db, 1, d.id)).toBeNull();
		expect(getDocumentFile(db, 1, d.id)).toBeNull();
		expect(listDocuments(db, 1)).toEqual([]);
		expect(updateDocument(db, 1, d.id, { notes: 'late' }, 1)).toBeNull();
		expect(deleteDocument(db, 1, d.id, 1)).toBe(false);
		const row = db.prepare('SELECT deleted_at, deleted_by FROM documents WHERE id = ?').get(d.id);
		expect(row).toEqual({ deleted_at: NOW.toISOString(), deleted_by: 1 });
	});
});

describe('latest by date (§15.4 FIX)', () => {
	it('picks the newest date taken, not the last uploaded', () => {
		const newer = up(1, { takenOn: '2026-05-01', bytes: png(1) }, new Date('2026-10-01T10:00:00'))!;
		up(1, { takenOn: '2025-01-15', bytes: png(2) }, new Date('2026-10-02T10:00:00')); // uploaded later, older scan
		expect(latestDocument(db, 1, 'FUNDUS_PHOTO')?.id).toBe(newer.id);
		expect(listDocuments(db, 1)!.map((d) => d.takenOn)).toEqual(['2026-05-01', '2025-01-15']);
	});

	it('same date: the later upload wins', () => {
		up(1, { takenOn: '2026-05-01' }, new Date('2026-10-01T10:00:00'));
		const later = up(1, { takenOn: '2026-05-01' }, new Date('2026-10-01T11:00:00'))!;
		expect(latestDocument(db, 1, 'FUNDUS_PHOTO')?.id).toBe(later.id);
	});

	it('rejects impossible or future dates', () => {
		expect(() => up(1, { takenOn: '2026-02-30' })).toThrow(/real date/);
		expect(() => up(1, { takenOn: '2026-10-07' })).toThrow(/future/);
		expect(() => up(1, { takenOn: '06/10/2026' })).toThrow(/real date/);
	});
});

describe('categories and zones', () => {
	it('maps categories to exam zones; a category can sit in two', () => {
		const cats = listCategories(db);
		expect(cats.find((c) => c.id === 'VISUAL_FIELD')).toMatchObject({ zones: ['NEURO', 'GLAUCOMA'], flow: 'VF' });
		expect(cats.find((c) => c.id === 'OCT_NERVE')).toMatchObject({ flow: 'OCT' });
		expect(categoriesForZone(db, 'EXT').map((c) => c.id)).toEqual(['EXT_PHOTO']);
		expect(categoriesForZone(db, 'OTHER').map((c) => c.id)).toContain('INSURANCE_CARD');
		expect(categoriesForZone(db, 'OTHER').every((c) => c.zones.length === 0)).toBe(true);
	});

	it('summarises a zone with counts and the latest file', () => {
		up(1, { category: 'TOPOGRAPHY', takenOn: '2026-01-01' });
		const latest = up(1, { category: 'TOPOGRAPHY', takenOn: '2026-03-01' })!;
		const s = zoneSummary(db, 1, 'ANTSEG')!;
		expect(s.map((c) => c.category)).toEqual(['ANTSEG_PHOTO', 'TOPOGRAPHY', 'SPECULAR']);
		expect(s[1]).toMatchObject({ count: 2, latest: { id: latest.id } });
		expect(s[0]).toMatchObject({ count: 0, latest: null });
	});

	it('filters by zone, category and flow-sheet role', () => {
		up(1, { category: 'VISUAL_FIELD', bytes: pdf() });
		up(1, { category: 'INSURANCE_CARD', bytes: jpeg() });
		expect(listDocuments(db, 1, { zone: 'GLAUCOMA' })!.map((d) => d.category)).toEqual(['VISUAL_FIELD']);
		expect(listDocuments(db, 1, { zone: 'OTHER' })!.map((d) => d.category)).toEqual(['INSURANCE_CARD']);
		expect(listDocuments(db, 1, { flow: 'VF' })).toHaveLength(1);
		expect(listDocuments(db, 1, { flow: 'OCT' })).toHaveLength(0);
	});

	it('refuses an unknown category', () => {
		expect(() => up(1, { category: 'NOPE' })).toThrow(/category/);
	});
});

describe('edits', () => {
	it('updates notes, date taken and category', () => {
		const d = up(1)!;
		const e = updateDocument(db, 1, d.id, { notes: '  OCT before injection  ', takenOn: '2026-09-30', category: 'OCT_MACULA' }, 1, NOW)!;
		expect(e).toMatchObject({ notes: 'OCT before injection', takenOn: '2026-09-30', category: 'OCT_MACULA', categoryName: 'OCT macula' });
		expect(() => updateDocument(db, 1, d.id, { notes: 'x'.repeat(2001) }, 1)).toThrow(/2000/);
		expect(() => updateDocument(db, 1, d.id, { notes: 5 }, 1)).toThrow(DocumentError);
	});

	it('cleans file names', () => {
		expect(cleanFilename('C:\\photos\\..\\eye "1".png', 'image/png')).toBe('eye 1.png');
		expect(cleanFilename('', 'application/pdf')).toBe('document.pdf');
		expect(cleanFilename('a'.repeat(300) + '.jpeg', 'image/jpeg')).toMatch(/^a+\.jpeg$/);
		expect(cleanFilename('a'.repeat(300) + '.jpeg', 'image/jpeg').length).toBe(120);
	});
});
