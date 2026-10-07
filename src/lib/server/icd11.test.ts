import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { openDatabase, type DB } from './db.ts';
import { ensureIcd11, getIcd11, ICD11_FILE, loadIcd11, resolveIcd11Code, searchIcd11 } from './icd11.ts';
import { ICD11_CODE_RE, ICD11_EXT_RE, ICD11_STEM_RE } from '#lib/codesets/index.ts';
import { parseIcd11File } from '#lib/codesets/icd11.ts';
import { HAVE_ICD11_FILE, ICD11_FIXTURE, ICD11_FILE_PATH, needsCodes } from '#lib/codesets/icd11.fixture.ts';

describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('the downloaded WHO file', HAVE_ICD11_FILE), () => {
	const text = ICD11_FILE_PATH ? gunzipSync(readFileSync(ICD11_FILE_PATH)).toString('utf8') : '';
	const rows = text ? parseIcd11File(text) : [];

	it('has every coded entity, with title and URI', () => {
		expect(rows.length).toBe(35664);
		expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
		expect(rows.every((r) => r.title && r.uri.startsWith('http://id.who.int/icd/release/11/'))).toBe(true);
		expect(rows.some((r) => r.title.startsWith('-'))).toBe(false);
	});

	it('every Code matches our code shapes: stems outside chapter X, extension codes in it', () => {
		const bad = rows.filter((r) => (r.chapter === 'X' ? !ICD11_EXT_RE.test(r.code) : !ICD11_STEM_RE.test(r.code)));
		expect(bad.map((r) => r.code)).toEqual([]);
		expect(rows.filter((r) => r.chapter !== 'X').every((r) => ICD11_CODE_RE.test(r.code))).toBe(true);
	});

	it('known codes: 9C61.0Z, the 9B10 family, the laterality extensions', () => {
		const by = new Map(rows.map((r) => [r.code, r]));
		expect(by.get('9C61.0Z')).toMatchObject({ title: 'Primary open-angle glaucoma, unspecified', leaf: true, chapter: '09' });
		expect(by.get('9B10')).toMatchObject({ title: 'Cataract', leaf: false });
		expect(rows.filter((r) => r.code.startsWith('9B10')).length).toBeGreaterThanOrEqual(15);
		expect(by.get('XK9J')).toMatchObject({ title: 'Bilateral', chapter: 'X' });
		expect(by.get('XK9K')).toMatchObject({ title: 'Right', chapter: 'X' });
		expect(by.get('XK8G')).toMatchObject({ title: 'Left', chapter: 'X' });
	});
});

describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('loader and search (real file in the table)', HAVE_ICD11_FILE), () => {
	let db: DB;
	beforeAll(() => {
		db = openDatabase(':memory:');
		expect(ensureIcd11(db)).toBe(true);
	});

	it('loads once and records the source', () => {
		expect(db.prepare('SELECT source, row_count FROM icd11_meta').get()).toEqual({ source: ICD11_FILE, row_count: 35664 });
		expect(getIcd11(db, '9c610z')?.code).toBe('9C61.0Z');
	});

	it('code prefix first (dot optional), leaves first, never extension codes', () => {
		const r = searchIcd11(db, '9C610');
		expect(r[0].code).toBe('9C61.00');
		expect(r.every((c) => c.code.startsWith('9C61.0'))).toBe(true);
		expect(r.at(-1)?.code).toBe('9C61.0'); // the category comes after its leaves
		expect(searchIcd11(db, 'XK9').length).toBe(0);
		expect(searchIcd11(db, 'bilateral').every((c) => c.chapter !== 'X')).toBe(true);
	});

	it('title words in any order and spelling, visual system first', () => {
		const r = searchIcd11(db, 'vitreous hemorrhage');
		expect(r[0]).toMatchObject({ code: '9B83', title: 'Vitreous haemorrhage' });
		const g = searchIcd11(db, 'glaucoma');
		expect(g[0].chapter).toBe('09');
		expect(searchIcd11(db, '%')).toEqual([]);
	});

	it('titles that start with the word come before ones that only contain it', () => {
		const r = searchIcd11(db, 'cataract').map((c) => c.title);
		expect(r[0]).toMatch(/^Cataract/);
		expect(r.indexOf('Cataract, unspecified')).toBeLessThan(r.indexOf('After-cataract'));
	});

	it('postcoordination with laterality', () => {
		expect(resolveIcd11Code(db, '9C61.0Z & XK9K')).toMatchObject({ code: '9C61.0Z&XK9K', description: 'Primary open-angle glaucoma, unspecified; Right' });
		expect(resolveIcd11Code(db, '9C61.0Z&5A11')).toMatchObject({ error: expect.any(String) });
	});

	it('a fixture load replaces the table', () => {
		const small = openDatabase(':memory:');
		expect(loadIcd11(small, ICD11_FIXTURE, 'fixture-test')).toBe(60);
		expect(ensureIcd11(small)).toBe(true);
		expect(searchIcd11(small, 'cataract').map((c) => c.code)).toContain('9B10.Z');
	});
});
