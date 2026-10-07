// Diagnosis code sets downloaded by the practice (D49): download from the official address, import a
// file brought on a USB stick, remove, and the status shown in Settings › Code sets.
// Every file is checked against the SHA-256 pinned in src/lib/codesets/releases.ts before it is kept;
// the code text is stored gzip-compressed and otherwise unchanged in the code cache folder
// (codepaths.ts) and loaded into its table. Each change is audited as settings.codes.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { DB } from './db.ts';
import { codesCacheDir, findCodeFile } from './codepaths.ts';
import { ensureIcd10, icd10Meta, loadIcd10, unloadIcd10 } from './icd10.ts';
import { ensureIcd11, icd11Meta, loadIcd11, unloadIcd11 } from './icd11.ts';
import { ensureIcd11Titles, icd11TitlesMeta, loadIcd11Titles, unloadIcd11Titles } from './icd11_titles.ts';
import { currentCodeSet } from './settings.ts';
import { securityAudit } from './security_audit.ts';
import { extractEntry, looksLikeZip, MAX_ZIP_BYTES, ZipError } from './unzip.ts';
import { CODE_SET_IDS, type CodeSetId } from '#lib/codesets/index.ts';
import { ICD11_LANGUAGES, icd11Language, RELEASES, type CodeSetRelease, type Icd11LanguageRelease } from '#lib/codesets/releases.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';

/** A refusal with its HTTP status and a server message key (translated by the route). */
export class CodeSetError extends Error {
	constructor(
		public key: MessageKey,
		public status: number,
		public params: Record<string, string | number> = {}
	) {
		super(key);
	}
}

/** Largest upload we read (a zip or the plain code file). */
export const MAX_IMPORT_BYTES = MAX_ZIP_BYTES;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_REDIRECTS = 5;

export interface CodeSetStatus {
	set: CodeSetId;
	release: CodeSetRelease;
	/** The practice codes with this set now. */
	current: boolean;
	/** Codes in the table (0 = not downloaded). */
	rows: number;
	loadedAt: string | null;
	/** The release in the table is the current one (false: an older release is still loaded). */
	upToDate: boolean;
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ensure = (db: DB, set: CodeSetId) => (set === 'icd11' ? ensureIcd11(db) : ensureIcd10(db));
const meta = (db: DB, set: CodeSetId) => (set === 'icd11' ? icd11Meta(db) : icd10Meta(db));

/** Status of every set (loads a downloaded file into its table on first call, which takes a few seconds). */
export function codeSetStatus(db: DB): CodeSetStatus[] {
	const current = currentCodeSet(db);
	return CODE_SET_IDS.map((set) => {
		ensure(db, set);
		const m = meta(db, set);
		const release = RELEASES[set];
		return {
			set,
			release,
			current: set === current,
			rows: m?.rows ?? 0,
			loadedAt: m?.loadedAt ?? null,
			upToDate: !!m && (m.source === release.file || m.source.startsWith('fixture'))
		};
	});
}

/** True when the set has codes to search (its file was downloaded or imported). */
export function codeSetReady(db: DB, set: CodeSetId): boolean {
	ensure(db, set);
	return (meta(db, set)?.rows ?? 0) > 0;
}

/** Cheap check without loading anything: codes in the table, or the downloaded file waiting to load. */
export function codeSetAvailable(db: DB, set: CodeSetId): boolean {
	if ((meta(db, set)?.rows ?? 0) > 0) return true;
	return findCodeFile(RELEASES[set].file) !== null;
}

const busy = new Set<string>();

/** One change at a time per set or language file (a second click while a download runs is refused). */
async function exclusive<T>(set: string, fn: () => Promise<T> | T): Promise<T> {
	if (busy.has(set)) throw new CodeSetError('server.codesBusy', 409);
	busy.add(set);
	try {
		return await fn();
	} finally {
		busy.delete(set);
	}
}

/** Checks the code text against the release, stores it (gzip, unchanged) and loads the table. Returns the row count. */
function keep(db: DB, set: CodeSetId, text: Buffer, source: string, actorId: number, wrongKey: MessageKey): number {
	const rel = RELEASES[set];
	const hash = sha256(text);
	if (hash !== rel.sha256) throw new CodeSetError(wrongKey, 422, { release: `${rel.release}`, url: rel.url });
	const dir = codesCacheDir();
	mkdirSync(dir, { recursive: true });
	const tmp = join(dir, `${rel.file}.${process.pid}.tmp`);
	writeFileSync(tmp, gzipSync(text));
	renameSync(tmp, join(dir, rel.file));
	const utf8 = text.toString('utf8');
	const rows = set === 'icd11' ? loadIcd11(db, utf8, rel.file) : loadIcd10(db, utf8, rel.file);
	securityAudit(db, { action: 'settings.codes', userId: actorId, detail: { op: source === 'upload' ? 'import' : 'download', set, release: rel.release, source, sha256: hash, rows } });
	return rows;
}

/** The code file from a zip (the release's entry) or the plain text as it is. */
function codeText(set: CodeSetId, bytes: Uint8Array): Buffer {
	return entryText(RELEASES[set].entry, bytes);
}

function entryText(entry: string, bytes: Uint8Array): Buffer {
	if (!looksLikeZip(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	try {
		return extractEntry(bytes, entry);
	} catch (e) {
		if (e instanceof ZipError) throw new CodeSetError('server.codesBadZip', 422, { error: e.message });
		throw e;
	}
}

/** GET with a time limit and size cap; redirects are followed only to https addresses. */
async function fetchZip(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Uint8Array> {
	const signal = AbortSignal.timeout(timeoutMs);
	let target = url;
	for (let hop = 0; ; hop++) {
		if (!target.startsWith('https://')) throw new CodeSetError('server.codesDownloadFailed', 502, { error: 'redirect to a non-https address' });
		const res = await fetchImpl(target, { redirect: 'manual', signal });
		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			if (!loc || hop >= MAX_REDIRECTS) throw new CodeSetError('server.codesDownloadFailed', 502, { error: `HTTP ${res.status}` });
			target = new URL(loc, target).href;
			continue;
		}
		if (!res.ok || !res.body) throw new CodeSetError('server.codesDownloadFailed', 502, { error: `HTTP ${res.status}` });
		if (Number(res.headers.get('content-length') ?? 0) > MAX_ZIP_BYTES) throw new CodeSetError('server.codesTooLarge', 413);
		const chunks: Uint8Array[] = [];
		let total = 0;
		const reader = res.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_ZIP_BYTES) {
				await reader.cancel().catch(() => {});
				throw new CodeSetError('server.codesTooLarge', 413);
			}
			chunks.push(value);
		}
		return Buffer.concat(chunks, total);
	}
}

/**
 * Downloads the set's current release from its official address, checks it and loads it.
 * `fetchImpl` and `timeoutMs` are for tests.
 */
export async function downloadCodeSet(
	db: DB,
	set: CodeSetId,
	actorId: number,
	opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<CodeSetStatus> {
	const rel = RELEASES[set];
	await exclusive(set, async () => {
		let zip: Uint8Array;
		try {
			zip = await fetchZip(rel.url, opts.fetchImpl ?? fetch, opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
		} catch (e) {
			if (e instanceof CodeSetError) throw e;
			const err = e as Error & { cause?: { code?: string } };
			const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out' : (err.cause?.code ?? err.message);
			throw new CodeSetError('server.codesDownloadFailed', 502, { error: reason });
		}
		if (!looksLikeZip(zip)) throw new CodeSetError('server.codesWrongRelease', 422);
		keep(db, set, codeText(set, zip), rel.url, actorId, 'server.codesWrongRelease');
	});
	return codeSetStatus(db).find((s) => s.set === set)!;
}

/** Imports the official zip, or the plain code file taken out of it, e.g. from a USB stick. */
export async function importCodeSet(db: DB, set: CodeSetId, bytes: Uint8Array, actorId: number): Promise<CodeSetStatus> {
	if (bytes.byteLength === 0) throw new CodeSetError('server.codesEmptyFile', 400);
	if (bytes.byteLength > MAX_IMPORT_BYTES) throw new CodeSetError('server.codesTooLarge', 413);
	await exclusive(set, () => {
		keep(db, set, codeText(set, bytes), 'upload', actorId, 'server.codesImportWrongRelease');
	});
	return codeSetStatus(db).find((s) => s.set === set)!;
}

/**
 * Removes a set's codes (table and downloaded file). Not the practice's current set. Saved diagnoses
 * are untouched: they store their own code and text (and WHO URI).
 */
export async function removeCodeSet(db: DB, set: CodeSetId, actorId: number): Promise<CodeSetStatus> {
	if (currentCodeSet(db) === set) throw new CodeSetError('server.codesRemoveCurrent', 409);
	await exclusive(set, () => {
		const rel = RELEASES[set];
		const before = meta(db, set);
		rmSync(join(codesCacheDir(), rel.file), { force: true });
		if (set === 'icd11') unloadIcd11(db);
		else unloadIcd10(db);
		securityAudit(db, { action: 'settings.codes', userId: actorId, detail: { op: 'remove', set, release: rel.release, rows: before?.rows ?? 0 } });
	});
	return codeSetStatus(db).find((s) => s.set === set)!;
}

// ---------- ICD-11 titles in other languages (D50) ----------
// WHO's SimpleTabulation file of another language, handled exactly like the English one: official address
// or a file brought on a USB stick, SHA-256 pinned in releases.ts (ICD11_LANGUAGES), stored gzip-compressed
// and unchanged, loaded into icd11_titles. Loading or removing a language never touches English (the icd11
// table) or saved diagnoses. Audited as settings.codes with the language.

export interface Icd11LanguageStatus {
	lang: string;
	release: Icd11LanguageRelease;
	/** Titles loaded (0 = not downloaded). */
	rows: number;
	loadedAt: string | null;
	upToDate: boolean;
}

function languageState(db: DB, rel: Icd11LanguageRelease): Icd11LanguageStatus {
	ensureIcd11Titles(db, rel.lang);
	const m = icd11TitlesMeta(db, rel.lang);
	return {
		lang: rel.lang,
		release: rel,
		rows: m?.rows ?? 0,
		loadedAt: m?.loadedAt ?? null,
		upToDate: !!m && (m.source === rel.file || m.source.startsWith('fixture'))
	};
}

/** Status of every WHO language file (loads a downloaded file on first call). */
export function icd11LanguageStatus(db: DB): Icd11LanguageStatus[] {
	return ICD11_LANGUAGES.map((rel) => languageState(db, rel));
}

function languageRelease(lang: string): Icd11LanguageRelease {
	const rel = icd11Language(lang);
	if (!rel) throw new CodeSetError('server.codesUnknownLanguage', 404);
	return rel;
}

/** Checks a language file against its release, stores it (gzip, unchanged) and loads its titles. */
function keepLanguage(db: DB, rel: Icd11LanguageRelease, text: Buffer, source: string, actorId: number, wrongKey: MessageKey): number {
	const hash = sha256(text);
	if (hash !== rel.sha256) throw new CodeSetError(wrongKey, 422, { release: rel.release, url: rel.url });
	const dir = codesCacheDir();
	mkdirSync(dir, { recursive: true });
	const tmp = join(dir, `${rel.file}.${process.pid}.tmp`);
	writeFileSync(tmp, gzipSync(text));
	renameSync(tmp, join(dir, rel.file));
	const rows = loadIcd11Titles(db, rel.lang, text.toString('utf8'), rel.file, hash);
	securityAudit(db, {
		action: 'settings.codes',
		userId: actorId,
		detail: { op: source === 'upload' ? 'import' : 'download', set: 'icd11', lang: rel.lang, release: rel.release, source, sha256: hash, rows }
	});
	return rows;
}

/** Downloads WHO's file for one language from its official address, checks it and loads the titles. */
export async function downloadIcd11Language(
	db: DB,
	lang: string,
	actorId: number,
	opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<Icd11LanguageStatus> {
	const rel = languageRelease(lang);
	await exclusive(`icd11:${rel.lang}`, async () => {
		let zip: Uint8Array;
		try {
			zip = await fetchZip(rel.url, opts.fetchImpl ?? fetch, opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
		} catch (e) {
			if (e instanceof CodeSetError) throw e;
			const err = e as Error & { cause?: { code?: string } };
			const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out' : (err.cause?.code ?? err.message);
			throw new CodeSetError('server.codesDownloadFailed', 502, { error: reason });
		}
		if (!looksLikeZip(zip)) throw new CodeSetError('server.codesWrongRelease', 422, { release: rel.release, url: rel.url });
		keepLanguage(db, rel, entryText(rel.entry, zip), rel.url, actorId, 'server.codesWrongRelease');
	});
	return languageState(db, rel);
}

/** Imports WHO's zip for one language, or the text file taken out of it. */
export async function importIcd11Language(db: DB, lang: string, bytes: Uint8Array, actorId: number): Promise<Icd11LanguageStatus> {
	const rel = languageRelease(lang);
	if (bytes.byteLength === 0) throw new CodeSetError('server.codesEmptyFile', 400);
	if (bytes.byteLength > MAX_IMPORT_BYTES) throw new CodeSetError('server.codesTooLarge', 413);
	await exclusive(`icd11:${rel.lang}`, () => {
		keepLanguage(db, rel, entryText(rel.entry, bytes), 'upload', actorId, 'server.codesImportWrongRelease');
	});
	return languageState(db, rel);
}

/** Removes one language's titles and downloaded file. Diagnoses already saved keep their stored titles. */
export async function removeIcd11Language(db: DB, lang: string, actorId: number): Promise<Icd11LanguageStatus> {
	const rel = languageRelease(lang);
	await exclusive(`icd11:${rel.lang}`, () => {
		const before = icd11TitlesMeta(db, rel.lang);
		rmSync(join(codesCacheDir(), rel.file), { force: true });
		unloadIcd11Titles(db, rel.lang);
		securityAudit(db, { action: 'settings.codes', userId: actorId, detail: { op: 'remove', set: 'icd11', lang: rel.lang, release: rel.release, rows: before?.rows ?? 0 } });
	});
	return languageState(db, rel);
}
