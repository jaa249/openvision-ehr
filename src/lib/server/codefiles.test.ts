// Code sets downloaded by the practice (D49): download, import, remove, the not-downloaded state and the
// admin API. Each test gets an empty OPENVISION_CODES_DIR, so nothing comes from the repo's codes/.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { codeSetAvailable, codeSetReady, codeSetStatus, CodeSetError, downloadCodeSet, importCodeSet, removeCodeSet } from './codefiles.ts';
import { codesCacheDir, findCodeFile } from './codepaths.ts';
import { searchIcd10 } from './icd10.ts';
import { addItem, CODES_NOT_DOWNLOADED, PlanValidationError } from './plan.ts';
import { updateCodeSettings } from './settings.ts';
import { searchAudit } from './security_audit.ts';
import { makeZip } from './zip.fixture.ts';
import { RELEASES } from '#lib/codesets/releases.ts';
import { HAVE_ICD10_FILE, needsCodes } from '#lib/codesets/icd11.fixture.ts';

// The real CMS text (from the development cache) for the tests that need the pinned release.
const REAL_ICD10 = HAVE_ICD10_FILE ? gunzipSync(readFileSync(findCodeFile(RELEASES.icd10cm.file)!)) : null;
// The admin API routes use the shared database: keep it in memory.
process.env.OPENVISION_DB = ':memory:';
const FICTIONAL = 'Z0000   Fictional code for a test\n';

let db: DB;
let dir: string;
const saved = process.env.OPENVISION_CODES_DIR;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'ov-codes-'));
	process.env.OPENVISION_CODES_DIR = dir;
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-07');
});
afterEach(() => {
	if (saved === undefined) delete process.env.OPENVISION_CODES_DIR;
	else process.env.OPENVISION_CODES_DIR = saved;
	rmSync(dir, { recursive: true, force: true });
});

const refusal = async (p: Promise<unknown>) => {
	try {
		await p;
	} catch (e) {
		if (e instanceof CodeSetError) return { key: e.key, status: e.status };
		throw e;
	}
	return null;
};

/** A fetch stand-in: answers from a list of responses, recording the URLs asked for. */
function fakeFetch(answers: (() => Response)[]) {
	const urls: string[] = [];
	const fn = (async (url: string) => {
		urls.push(url);
		const next = answers.shift();
		if (!next) throw new Error('no more answers');
		return next();
	}) as unknown as typeof fetch;
	return { fn, urls };
}

describe('paths', () => {
	it('OPENVISION_CODES_DIR is the only place looked in when set; else <db folder>/codes', () => {
		expect(codesCacheDir()).toBe(dir);
		expect(findCodeFile(RELEASES.icd10cm.file)).toBeNull();
		delete process.env.OPENVISION_CODES_DIR;
		const before = process.env.OPENVISION_DB;
		process.env.OPENVISION_DB = join(dir, 'db', 'openvision.sqlite');
		try {
			expect(codesCacheDir()).toBe(join(dir, 'db', 'codes'));
		} finally {
			if (before === undefined) delete process.env.OPENVISION_DB;
			else process.env.OPENVISION_DB = before;
		}
	});
});

describe('not downloaded', () => {
	it('nothing to search, typed codes refused with the not-downloaded message, coded-free items fine', () => {
		expect(codeSetReady(db, 'icd10cm')).toBe(false);
		expect(codeSetAvailable(db, 'icd10cm')).toBe(false);
		expect(searchIcd10(db, 'H40')).toEqual([]);
		expect(() => addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'H40.003' })).toThrow(PlanValidationError);
		expect(() => addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'H40.003' })).toThrow(CODES_NOT_DOWNLOADED);
		expect(addItem(db, 1, 1, 1, { title: 'Glaucoma suspect' })?.title).toBe('Glaucoma suspect');
		updateCodeSettings(db, { codeSet: 'icd11' }, 3);
		expect(() => addItem(db, 1, 1, 1, { codes: '9C61.0Z' })).toThrow(CODES_NOT_DOWNLOADED);
		const st = codeSetStatus(db);
		expect(st.map((s) => [s.set, s.rows, s.current])).toEqual([
			['icd10cm', 0, false],
			['icd11', 0, true]
		]);
	});
});

describe('import', () => {
	it('refuses files that are not the pinned release, empty files and broken zips', async () => {
		expect(await refusal(importCodeSet(db, 'icd10cm', Buffer.from(FICTIONAL), 3))).toEqual({ key: 'server.codesImportWrongRelease', status: 422 });
		expect(await refusal(importCodeSet(db, 'icd10cm', new Uint8Array(), 3))).toEqual({ key: 'server.codesEmptyFile', status: 400 });
		const zip = makeZip([{ name: 'other.txt', data: FICTIONAL }]);
		expect(await refusal(importCodeSet(db, 'icd10cm', zip, 3))).toEqual({ key: 'server.codesBadZip', status: 422 });
		const wrong = makeZip([{ name: RELEASES.icd10cm.entry, data: FICTIONAL, deflate: true }]);
		expect(await refusal(importCodeSet(db, 'icd10cm', wrong, 3))).toEqual({ key: 'server.codesImportWrongRelease', status: 422 });
		expect(existsSync(join(dir, RELEASES.icd10cm.file))).toBe(false);
		expect(codeSetReady(db, 'icd10cm')).toBe(false);
	});

	it.skipIf(!REAL_ICD10)(needsCodes('the official text file or zip: stored unchanged (gzip), loaded and audited', !!REAL_ICD10), async () => {
		const st = await importCodeSet(db, 'icd10cm', REAL_ICD10!, 3);
		expect(st.rows).toBeGreaterThan(70000);
		expect(st.upToDate).toBe(true);
		expect(gunzipSync(readFileSync(join(dir, RELEASES.icd10cm.file))).equals(REAL_ICD10!)).toBe(true);
		expect(searchIcd10(db, 'H40.003')[0]?.code).toBe('H40.003');
		expect(addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'h40003' })?.codes).toBe('H40.003');
		const row = searchAudit(db, { action: 'settings.codes' }).rows[0];
		expect(JSON.parse(row.detail)).toMatchObject({ op: 'import', set: 'icd10cm', release: 'FY2027', source: 'upload', sha256: RELEASES.icd10cm.sha256 });
		// The zip works the same; a fresh database loads the stored file by itself.
		const zip = makeZip([{ name: RELEASES.icd10cm.entry, data: REAL_ICD10!, deflate: true }]);
		const other = openDatabase(':memory:');
		seedDemo(other, '2026-10-07');
		expect((await importCodeSet(other, 'icd10cm', zip, 3)).rows).toBe(st.rows);
		expect(codeSetReady(openDatabase(':memory:'), 'icd10cm')).toBe(true);
	}, 60000);
});

describe('download', () => {
	const zipResponse = (body: Buffer) => () => new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': 'application/zip' } });

	it('a network failure, an http redirect or the wrong file is refused with a clear message', async () => {
		const down = fakeFetch([
			() => {
				throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
			}
		]);
		expect(await refusal(downloadCodeSet(db, 'icd10cm', 3, { fetchImpl: down.fn }))).toEqual({ key: 'server.codesDownloadFailed', status: 502 });
		expect(down.urls).toEqual([RELEASES.icd10cm.url]);
		const http = fakeFetch([() => new Response(null, { status: 302, headers: { location: 'http://example.invalid/file.zip' } })]);
		expect(await refusal(downloadCodeSet(db, 'icd10cm', 3, { fetchImpl: http.fn }))).toEqual({ key: 'server.codesDownloadFailed', status: 502 });
		const wrong = fakeFetch([zipResponse(makeZip([{ name: RELEASES.icd10cm.entry, data: FICTIONAL }]))]);
		expect(await refusal(downloadCodeSet(db, 'icd10cm', 3, { fetchImpl: wrong.fn }))).toEqual({ key: 'server.codesWrongRelease', status: 422 });
		const html = fakeFetch([() => new Response('<html>Fictional error page</html>', { status: 200 })]);
		expect(await refusal(downloadCodeSet(db, 'icd10cm', 3, { fetchImpl: html.fn }))).toEqual({ key: 'server.codesWrongRelease', status: 422 });
		expect(codeSetReady(db, 'icd10cm')).toBe(false);
	});

	it.skipIf(!REAL_ICD10)(needsCodes('follows an https redirect, checks the hash and loads', !!REAL_ICD10), async () => {
		const zip = makeZip([{ name: RELEASES.icd10cm.entry, data: REAL_ICD10!, deflate: true }]);
		const f = fakeFetch([() => new Response(null, { status: 301, headers: { location: 'https://mirror.example.invalid/codes.zip' } }), zipResponse(zip)]);
		const st = await downloadCodeSet(db, 'icd10cm', 3, { fetchImpl: f.fn });
		expect(f.urls).toEqual([RELEASES.icd10cm.url, 'https://mirror.example.invalid/codes.zip']);
		expect(st.rows).toBeGreaterThan(70000);
		expect(JSON.parse(searchAudit(db, { action: 'settings.codes' }).rows[0].detail)).toMatchObject({ op: 'download', source: RELEASES.icd10cm.url });
	}, 60000);
});

describe('remove', () => {
	it.skipIf(!REAL_ICD10)(needsCodes("never the practice's current set; saved diagnoses stay as they are", !!REAL_ICD10), async () => {
		await importCodeSet(db, 'icd10cm', REAL_ICD10!, 3);
		const item = addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'H40.003' })!;
		expect(await refusal(removeCodeSet(db, 'icd10cm', 3))).toEqual({ key: 'server.codesRemoveCurrent', status: 409 });
		updateCodeSettings(db, { codeSet: 'icd11' }, 3);
		const st = await removeCodeSet(db, 'icd10cm', 3);
		expect(st.rows).toBe(0);
		expect(existsSync(join(dir, RELEASES.icd10cm.file))).toBe(false);
		const kept = db.prepare('SELECT codes, code_text FROM imp_items WHERE id = ?').get(item.id) as { codes: string; code_text: string };
		expect(kept.codes).toBe('H40.003');
		expect(kept.code_text).toContain('Preglaucoma, unspecified, bilateral');
		expect(JSON.parse(searchAudit(db, { action: 'settings.codes' }).rows[0].detail)).toMatchObject({ op: 'remove', set: 'icd10cm' });
	}, 60000);
});

describe('admin API', () => {
	type Handler = (event: unknown) => Promise<Response>;
	const event = (role: string | null, set = 'icd10cm', body?: BodyInit) => ({
		params: { set },
		locals: { user: role ? { id: 3, role } : undefined, userId: role ? 3 : undefined, locale: 'en' },
		request: new Request('http://localhost/api', { method: 'POST', body })
	});

	it('admins only; unknown sets 404; refusals come back as { message } with their status', async () => {
		const { POST } = (await import('../../routes/api/admin/codesets/[set]/import/+server.ts')) as unknown as { POST: Handler };
		const { DELETE } = (await import('../../routes/api/admin/codesets/[set]/+server.ts')) as unknown as { DELETE: Handler };
		expect((await POST(event('provider', 'icd10cm', FICTIONAL))).status).toBe(403);
		expect((await POST(event(null, 'icd10cm', FICTIONAL))).status).toBe(401);
		expect((await POST(event('admin', 'icd9', FICTIONAL))).status).toBe(404);
		const wrong = await POST(event('admin', 'icd10cm', FICTIONAL));
		expect(wrong.status).toBe(422);
		expect((await wrong.json()).message).toMatch(/not the expected release \(FY2027\)/);
		const current = await DELETE(event('admin', 'icd10cm'));
		expect(current.status).toBe(409);
		expect((await current.json()).message).toMatch(/codes with this set/);
	});
});
