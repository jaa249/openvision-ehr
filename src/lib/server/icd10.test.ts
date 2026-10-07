import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DB } from './db.ts';
import { ensureIcd10, findCodeFile, getIcd10, icd10Lookup, loadIcd10, searchIcd10 } from './icd10.ts';
import { ICD10_FIXTURE } from '#lib/plan/icd10.fixture.ts';
import { parseCodeFile } from '#lib/plan/codes.ts';
import { HAVE_ICD10_FILE, needsCodes } from '#lib/codesets/icd11.fixture.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	loadIcd10(db, ICD10_FIXTURE, 'fixture-test');
});

describe('loader', () => {
	it('parses CMS lines (CRLF too), adds the dot and flags billable codes', () => {
		const codes = parseCodeFile('H25     Age-related cataract\r\nH2511   Age-related nuclear cataract, right eye\r\nI10     Essential (primary) hypertension\r\n');
		expect(codes).toEqual([
			{ code: 'H25', description: 'Age-related cataract', billable: false },
			{ code: 'H25.11', description: 'Age-related nuclear cataract, right eye', billable: true },
			{ code: 'I10', description: 'Essential (primary) hypertension', billable: true }
		]);
	});
	it('loads in one go, is idempotent, and records what it loaded', () => {
		const n = (db.prepare('SELECT COUNT(*) AS n FROM icd10').get() as { n: number }).n;
		expect(n).toBeGreaterThan(100);
		expect(loadIcd10(db, ICD10_FIXTURE, 'fixture-test')).toBe(n);
		expect((db.prepare('SELECT COUNT(*) AS n FROM icd10').get() as { n: number }).n).toBe(n);
		expect(ensureIcd10(db)).toBe(true); // a fixture is never replaced by the downloaded file
		expect(db.prepare('SELECT source, row_count FROM icd10_meta').get()).toEqual({ source: 'fixture-test', row_count: n });
	});
	it.skipIf(!HAVE_ICD10_FILE)(needsCodes('finds the downloaded code file (development: codes/)', HAVE_ICD10_FILE), () => {
		expect(findCodeFile()).toMatch(/codes[\\/]icd10cm_codes_2027\.txt\.gz$/);
	});
	it('looks codes up by display or bare form', () => {
		expect(getIcd10(db, 'h2513')).toEqual({ code: 'H25.13', description: 'Age-related nuclear cataract, bilateral', billable: true });
		expect(getIcd10(db, 'H25.13')?.code).toBe('H25.13');
		expect(getIcd10(db, 'Q99.99')).toBeNull();
		expect(getIcd10(db, 'not a code')).toBeNull();
	});
});

describe('search', () => {
	it('matches a code prefix with or without the dot', () => {
		expect(searchIcd10(db, 'H25.1').map((c) => c.code)).toEqual(['H25.10', 'H25.11', 'H25.12', 'H25.13']);
		expect(searchIcd10(db, 'h251').map((c) => c.code)).toEqual(['H25.10', 'H25.11', 'H25.12', 'H25.13']);
	});
	it('matches every word of the description, in any order, case-insensitively', () => {
		const r = searchIcd10(db, 'RIGHT dermatochalasis upper');
		expect(r.map((c) => c.code)).toEqual(['H02.831']);
	});
	it('caps results and treats LIKE wildcards literally', () => {
		expect(searchIcd10(db, 'eye').length).toBeLessThanOrEqual(25);
		expect(searchIcd10(db, '%')).toEqual([]);
		expect(searchIcd10(db, '   ')).toEqual([]);
	});
	it('returns billable codes only', () => {
		loadIcd10(db, 'H25     Age-related cataract\nH2511   Age-related nuclear cataract, right eye\n', 'fixture-tiny');
		expect(searchIcd10(db, 'H25').map((c) => c.code)).toEqual(['H25.11']);
		expect(searchIcd10(db, 'cataract').map((c) => c.code)).toEqual(['H25.11']);
	});
	it('the engine lookup narrows by prefix and ranks', () => {
		const l = icd10Lookup(db);
		expect(l.best({ prefix: 'H02.83', all: ['left'], any: ['upper', 'eyelid'] })?.code).toBe('H02.834');
		expect(l.best({})).toBeNull();
	});
});

describe.skipIf(!HAVE_ICD10_FILE)(needsCodes('the downloaded CMS file', HAVE_ICD10_FILE), () => {
	it('loads all 2027 codes quickly and finds an eye code', () => {
		const fresh = openDatabase(':memory:');
		const t = performance.now();
		expect(ensureIcd10(fresh)).toBe(true);
		const ms = performance.now() - t;
		const n = (fresh.prepare('SELECT COUNT(*) AS n FROM icd10').get() as { n: number }).n;
		expect(n).toBeGreaterThan(70000);
		expect(ms).toBeLessThan(15000);
		expect(searchIcd10(fresh, 'H40.1131')[0]?.description).toMatch(/Primary open-angle glaucoma, bilateral/);
		expect(ensureIcd10(fresh)).toBe(true); // second call: no reload
	}, 30000);
});
