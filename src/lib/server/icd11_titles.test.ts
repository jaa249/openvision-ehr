// WHO ICD-11 titles in other languages (D50): loader, search in other scripts, English fallback, the
// saved title language, the FHIR extension, the admin API and the migration. WHO's rows come from the
// downloaded, unchanged WHO files at test time (`node scripts/fetch-codes.mjs icd11 --lang es,zh,ar`);
// without them those tests skip. Each test gets an empty OPENVISION_CODES_DIR, so nothing loads by itself.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { migrate, openDatabase, seedDemo, type DB } from './db.ts';
import { getIcd11, loadIcd11, resolveIcd11Code, searchIcd11 } from './icd11.ts';
import { foldTitle, icd11TitleIn, icd11TitlesLoaded, icd11TitlesMeta, loadIcd11Titles } from './icd11_titles.ts';
import { icd11LanguageStatus, importIcd11Language, removeIcd11Language, CodeSetError } from './codefiles.ts';
import { addItem, getCandidates, listItems, updateItem } from './plan.ts';
import { saveIssue } from './history.ts';
import { updateCodeSettings } from './settings.ts';
import { searchAudit } from './security_audit.ts';
import { TITLE_LANG_EXTENSION, toFhirBundle } from './export.ts';
import { getPrintables } from './report.ts';
import { ICD11_LANGUAGES, icd11Language, icd11LanguageName } from '#lib/codesets/releases.ts';
import {
	HAVE_ICD11_FILE,
	ICD11_FIXTURE,
	haveIcd11Language,
	icd11LanguageFilePath,
	icd11LanguageFixture,
	needsCodes
} from '#lib/codesets/icd11.fixture.ts';

// Read before the tests point OPENVISION_CODES_DIR at an empty folder.
const ES = icd11LanguageFixture('es');
const ZH = icd11LanguageFixture('zh');
const AR = icd11LanguageFixture('ar');
const ES_FULL = icd11LanguageFilePath('es') ? gunzipSync(readFileSync(icd11LanguageFilePath('es')!)) : null;
const HAVE_ES = HAVE_ICD11_FILE && haveIcd11Language('es');
const HAVE_ZH = HAVE_ICD11_FILE && haveIcd11Language('zh');
const HAVE_AR = HAVE_ICD11_FILE && haveIcd11Language('ar');
process.env.OPENVISION_DB = ':memory:';

let db: DB;
let dir: string;
const saved = process.env.OPENVISION_CODES_DIR;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'ov-icd11lang-'));
	process.env.OPENVISION_CODES_DIR = dir;
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-07');
	if (HAVE_ICD11_FILE) {
		loadIcd11(db, ICD11_FIXTURE, 'fixture-test');
		updateCodeSettings(db, { codeSet: 'icd11' }, null);
	}
});
afterEach(() => {
	if (saved === undefined) delete process.env.OPENVISION_CODES_DIR;
	else process.env.OPENVISION_CODES_DIR = saved;
	rmSync(dir, { recursive: true, force: true });
});

const load = (lang: string, text: string) => loadIcd11Titles(db, lang, text, 'fixture-test', 'fixture');

describe('releases', () => {
	it('every WHO language is pinned with its file, entry and a SHA-256; no Hindi file exists', () => {
		expect(ICD11_LANGUAGES.map((l) => l.lang)).toEqual(['es', 'fr', 'zh', 'ar', 'ru', 'pt', 'de', 'tr', 'uz', 'cs', 'kk', 'sv', 'sk', 'la']);
		for (const l of ICD11_LANGUAGES) {
			expect(l.url).toBe(`https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-${l.lang}.zip`);
			expect(l.entry).toBe(`SimpleTabulation-ICD-11-MMS-${l.lang}.txt`);
			expect(l.sha256).toMatch(/^[0-9a-f]{64}$/);
			expect(l.file).toBe(`icd11_mms_2026-01_${l.lang}.txt.gz`);
			expect(l.licence).toBe('CC BY-ND 3.0 IGO');
		}
		expect(ICD11_LANGUAGES.filter((l) => l.serves).map((l) => l.lang)).toEqual(['es', 'fr', 'zh', 'ar']);
		expect(icd11Language('hi')).toBeNull();
		expect(icd11Language('en')).toBeNull();
		expect(icd11LanguageName('de', 'en')).toBe('German');
	});
});

describe('folding for matching', () => {
	it('drops case, accents, Arabic diacritics and tatweel; keeps CJK as it is', () => {
		expect(foldTitle('Catarata relacionada con la EDAD, sin especificación')).toBe('catarata relacionada con la edad, sin especificacion');
		expect(foldTitle('زَرَق أوّلي')).toBe('زرق اولي');
		expect(foldTitle('ســاد')).toBe('ساد');
		expect(foldTitle('年龄相关性白内障')).toBe('年龄相关性白内障');
	});
});

describe('migration', () => {
	it('adds the titles tables and title_lang (empty for rows saved before)', () => {
		const raw = new DatabaseSync(':memory:');
		migrate(raw, 16);
		seedDemo(raw, '2026-10-07');
		const at = '2026-10-07T10:00:00.000Z';
		raw
			.prepare(
				`INSERT INTO imp_items (encounter_id, seq, kind, title, codes, code_text, plan, link, created_at, created_by, updated_at, updated_by)
				 VALUES (1, 1, 'free', 'Cataract', 'H25.13', 'ICD10:H25.13 (x)', '', '', ?, 1, ?, 1)`
			)
			.run(at, at);
		migrate(raw);
		expect(raw.prepare('SELECT title_lang FROM imp_items').get()).toEqual({ title_lang: '' });
		expect(raw.prepare("SELECT name FROM sqlite_master WHERE name IN ('icd11_titles', 'icd11_titles_meta') ORDER BY name").all()).toEqual([
			{ name: 'icd11_titles' },
			{ name: 'icd11_titles_meta' }
		]);
		const cols = (raw.prepare('PRAGMA table_info(issues)').all() as { name: string }[]).map((c) => c.name);
		expect(cols).toContain('title_lang');
	});
});

describe.skipIf(!HAVE_ES)(needsCodes('loader and Spanish (WHO es file)', HAVE_ES), () => {
	it('loads WHO titles by code; English is untouched; untranslated codes fall back to English', () => {
		const n = load('es', ES);
		expect(n).toBeGreaterThan(50);
		expect(icd11TitlesLoaded(db, 'es')).toBe(true);
		expect(icd11TitleIn(db, '9B10.0Z', 'es')).toBe('Catarata relacionada con la edad, sin especificación');
		expect(getIcd11(db, '9B10.0Z')!.title).toBe('Age-related cataract, unspecified');
		expect(getIcd11(db, '9B10.0Z', 'es')).toMatchObject({ title: 'Catarata relacionada con la edad, sin especificación', titleLang: 'es' });
		// Not loaded: English, no titleLang.
		expect(getIcd11(db, '9B10.0Z', 'fr')).toMatchObject({ title: 'Age-related cataract, unspecified' });
		expect(getIcd11(db, '9B10.0Z', 'fr')!.titleLang).toBeUndefined();
		expect(icd11TitlesMeta(db, 'es')).toMatchObject({ lang: 'es', release: '2026-01', rows: n });
	});

	it('search: Spanish words (accents optional), English words and codes all work; titles shown in Spanish', () => {
		load('es', ES);
		const es = searchIcd11(db, 'catarata edad', 25, 'es');
		expect(es.length).toBeGreaterThan(0);
		expect(es[0]).toMatchObject({ titleLang: 'es' });
		expect(es.every((e) => /catarata/i.test(e.title))).toBe(true);
		expect(searchIcd11(db, 'especificacion catarata', 25, 'es').some((e) => e.code === '9B10.0Z')).toBe(true);
		const en = searchIcd11(db, 'glaucoma unspecified', 25, 'es');
		expect(en.find((e) => e.code === '9C61.0Z')).toMatchObject({ title: 'Glaucoma primario de ángulo abierto, sin especificación', titleLang: 'es' });
		expect(searchIcd11(db, '9C61.0Z', 25, 'es')[0]).toMatchObject({ code: '9C61.0Z', titleLang: 'es' });
		// Without the language: English only.
		expect(searchIcd11(db, 'catarata', 25, 'fr')).toEqual([]);
		expect(searchIcd11(db, 'cataract', 25)[0].titleLang).toBeUndefined();
	});

	it('saving: the title is saved in the user language when loaded, else English, with its language', () => {
		load('es', ES);
		const a = addItem(db, 1, 1, 1, { codes: '9b10.0z&xk9j' }, { lang: 'es' })!;
		expect(a).toMatchObject({
			title: 'Catarata relacionada con la edad, sin especificación',
			codeText: 'ICD11:9B10.0Z&XK9J (Catarata relacionada con la edad, sin especificación; Bilateral)',
			titleLang: 'es',
			codeUris: 'http://id.who.int/icd/release/11/mms/1412073350/unspecified&http://id.who.int/icd/release/11/mms/627678743'
		});
		const b = addItem(db, 1, 1, 1, { title: 'Glaucoma', codes: '9C61.0Z' }, { lang: 'fr' })!;
		expect(b).toMatchObject({ codeText: 'ICD11:9C61.0Z (Primary open-angle glaucoma, unspecified)', titleLang: 'en' });
		const c = updateItem(db, 1, 1, 1, b.id, { codes: '9C61.0Z' }, { lang: 'es' })!;
		expect(c).toMatchObject({ codeText: 'ICD11:9C61.0Z (Glaucoma primario de ángulo abierto, sin especificación)', titleLang: 'es' });
		expect(listItems(db, 1, 1)!.map((i) => i.titleLang)).toEqual(['es', 'es']);
		expect(resolveIcd11Code(db, '9C61.0Z', 'hi')).toMatchObject({ description: 'Primary open-angle glaucoma, unspecified', titleLang: 'en' });
	});

	it('history codes keep their title language too', () => {
		load('es', ES);
		const r = saveIssue(db, 1, 1, { type: 'POH', title: 'Glaucoma', codes: '9C61.0Z' }, { lang: 'es' })!;
		expect(db.prepare('SELECT code_text, title_lang FROM issues WHERE id = ?').get(r.id)).toEqual({
			code_text: 'ICD11:9C61.0Z (Glaucoma primario de ángulo abierto, sin especificación)',
			title_lang: 'es'
		});
	});

	it('Builder rows show WHO titles in the user language; the engine still matches English findings', () => {
		load('es', ES);
		const en = getCandidates(db, 1, 1, { ODLENS: '2+ NS', OSLENS: '2+ NS' })!;
		const es = getCandidates(db, 1, 1, { ODLENS: '2+ NS', OSLENS: '2+ NS' }, 'es')!;
		const coded = en.findings.filter((c) => c.codes);
		expect(coded.length).toBeGreaterThan(0);
		const esRow = es.findings.find((c) => c.key === coded[0].key)!;
		expect(esRow.codes).toBe(coded[0].codes);
		expect(esRow.description).not.toBe(coded[0].description);
		expect(esRow.codeText).toMatch(/^ICD11:/);
	});

	it('FHIR: display is the stored title, its language in our extension', () => {
		load('es', ES);
		addItem(db, 1, 1, 1, { codes: '9C61.0Z' }, { lang: 'es' });
		const bundle = toFhirBundle(getPrintables(db, [1])) as { entry: { resource: Record<string, unknown> }[] };
		const cond = bundle.entry.map((e) => e.resource).find((r) => r.resourceType === 'Condition') as { code: { coding: Record<string, unknown>[] } };
		expect(cond.code.coding[0]).toMatchObject({
			code: '9C61.0Z',
			display: 'Glaucoma primario de ángulo abierto, sin especificación',
			extension: expect.arrayContaining([{ url: TITLE_LANG_EXTENSION, valueCode: 'es' }])
		});
	});

	it('the code finder API searches the signed-in user language and says so', async () => {
		load('es', ES);
		const { getDb } = await import('./db.ts');
		const shared = getDb();
		loadIcd11(shared, ICD11_FIXTURE, 'fixture-test');
		updateCodeSettings(shared, { codeSet: 'icd11' }, null);
		loadIcd11Titles(shared, 'es', ES, 'fixture-test', 'fixture');
		const { GET } = (await import('../../routes/api/codes/dx/+server.ts')) as unknown as { GET: (e: unknown) => Promise<Response> | Response };
		const get = async (q: string, locale: string) => (await GET({ url: new URL(`http://localhost/api/codes/dx?q=${encodeURIComponent(q)}`), locals: { locale } })).json();
		const es = await get('catarata', 'es');
		expect(es.lang).toBe('es');
		expect(es.codes[0]).toMatchObject({ titleLang: 'es' });
		const fr = await get('catarata', 'fr');
		expect(fr.lang).toBeUndefined();
		expect(fr.codes).toEqual([]);
	});
});

describe.skipIf(!HAVE_ZH)(needsCodes('Chinese search (WHO zh file)', HAVE_ZH), () => {
	it('substring search without spaces finds WHO Chinese titles', () => {
		load('zh', ZH);
		const r = searchIcd11(db, '白内障', 25, 'zh');
		expect(r.some((e) => e.code === '9B10.0Z' && e.title === '年龄相关性白内障，未特指' && e.titleLang === 'zh')).toBe(true);
		expect(searchIcd11(db, '开角型青光眼', 25, 'zh').some((e) => e.code === '9C61.0Z')).toBe(true);
	});
});

describe.skipIf(!HAVE_AR)(needsCodes('Arabic search (WHO ar file)', HAVE_AR), () => {
	it('matches without the diacritics WHO writes', () => {
		load('ar', AR);
		const r = searchIcd11(db, 'زرق اولي', 25, 'ar');
		expect(r.find((e) => e.code === '9C61.0Z')).toMatchObject({ title: 'زَرَق أوّلي مفتوح الزاويَة، لم يتم تعيينه', titleLang: 'ar' });
	});
});

describe('admin: download, import and remove one language', () => {
	type Handler = (event: unknown) => Promise<Response>;
	const event = (role: string | null, set: string, lang: string, body?: BodyInit) => ({
		params: { set, lang },
		locals: { user: role ? { id: 3, role } : undefined, userId: role ? 3 : undefined, locale: 'en' },
		request: new Request('http://localhost/api', { method: 'POST', body })
	});

	it('admins only; unknown languages and sets 404; a file that is not the pinned release is refused', async () => {
		const { POST } = (await import('../../routes/api/admin/codesets/[set]/languages/[lang]/import/+server.ts')) as unknown as { POST: Handler };
		expect((await POST(event(null, 'icd11', 'es', 'x'))).status).toBe(401);
		expect((await POST(event('provider', 'icd11', 'es', 'x'))).status).toBe(403);
		expect((await POST(event('admin', 'icd11', 'hi', 'x'))).status).toBe(404);
		expect((await POST(event('admin', 'icd10cm', 'es', 'x'))).status).toBe(404);
		const wrong = await POST(event('admin', 'icd11', 'es', 'Foundation URI\tfictional\n'));
		expect(wrong.status).toBe(422);
		expect((await wrong.json()).message).toMatch(/not the expected release \(2026-01\)/);
		await expect(importIcd11Language(db, 'xx', new Uint8Array([1]), 1)).rejects.toBeInstanceOf(CodeSetError);
	});

	it.skipIf(!HAVE_ICD11_FILE || !ES_FULL)(needsCodes('imports WHO es file (hash-checked), audits it, removes it; English stays', !!ES_FULL), async () => {
		const st = await importIcd11Language(db, 'es', new Uint8Array(ES_FULL!), 1);
		expect(st.rows).toBeGreaterThan(30000);
		expect(st.upToDate).toBe(true);
		const audit = JSON.parse(searchAudit(db, { action: 'settings.codes' }).rows[0].detail);
		expect(audit).toMatchObject({ op: 'import', set: 'icd11', lang: 'es', release: '2026-01', sha256: icd11Language('es')!.sha256 });
		expect(icd11LanguageStatus(db).find((s) => s.lang === 'es')!.rows).toBe(st.rows);
		const english = (db.prepare('SELECT COUNT(*) AS n FROM icd11').get() as { n: number }).n;
		const gone = await removeIcd11Language(db, 'es', 1);
		expect(gone.rows).toBe(0);
		expect((db.prepare('SELECT COUNT(*) AS n FROM icd11').get() as { n: number }).n).toBe(english);
		expect(JSON.parse(searchAudit(db, { action: 'settings.codes' }).rows[0].detail)).toMatchObject({ op: 'remove', lang: 'es' });
	});
});

describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('every downloaded WHO language file has the same codes and URIs as English', HAVE_ICD11_FILE), () => {
	it('same (Code, Linearization URI) set as English', async () => {
		const { parseIcd11File } = await import('#lib/codesets/icd11.ts');
		const { RELEASES } = await import('#lib/codesets/releases.ts');
		const { findCodeFile } = await import('./codepaths.ts');
		delete process.env.OPENVISION_CODES_DIR; // the development cache
		const read = (file: string) => gunzipSync(readFileSync(findCodeFile(file)!)).toString('utf8');
		const key = (text: string) => new Set(parseIcd11File(text).map((r) => `${r.code}\t${r.uri}`));
		const en = key(read(RELEASES.icd11.file));
		for (const l of ICD11_LANGUAGES.filter((x) => findCodeFile(x.file))) {
			const other = key(read(l.file));
			expect(other.size, l.lang).toBe(en.size);
			expect([...other].every((k) => en.has(k)), l.lang).toBe(true);
		}
	}, 60_000);
});
