// WHO ICD-11 titles in other languages (D50). WHO publishes the MMS release once per language
// (src/lib/codesets/releases.ts ICD11_LANGUAGES); the practice downloads the languages it wants in
// Settings › Code sets and each file's titles land in icd11_titles, joined to the English table by code.
// Nothing here translates: a code WHO left untranslated simply has no row, and callers show English.
// English stays in the icd11 table (src/lib/server/icd11.ts), which the findings engine searches.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { DB } from './db.ts';
import { findCodeFile } from './codepaths.ts';
import { parseIcd11File } from '#lib/codesets/icd11.ts';
import { icd11Language, ICD11_LANGUAGES } from '#lib/codesets/releases.ts';

/**
 * A title or query folded for matching only (never shown): Unicode decomposition with the marks removed
 * (accents, Arabic harakat and hamza marks), Arabic tatweel removed, lower case. CJK has no case and no
 * spaces; it is matched as a substring.
 */
export function foldTitle(s: string): string {
	return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ـ/g, '').toLowerCase().normalize('NFC');
}

const ready = new WeakMap<DB, Set<string>>();
const readySet = (db: DB) => {
	let s = ready.get(db);
	if (!s) ready.set(db, (s = new Set()));
	return s;
};

/**
 * Replaces one language's titles with those in `text` (WHO SimpleTabulation file of that language) in one
 * transaction. Only rows with a code and a non-empty title are kept. Returns the number of titles.
 */
export function loadIcd11Titles(db: DB, lang: string, text: string, source: string, sha256: string, now = new Date()): number {
	const rel = icd11Language(lang);
	if (!rel) throw new Error(`Unknown ICD-11 language ${lang}.`);
	const rows = parseIcd11File(text).filter((r) => r.title);
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM icd11_titles WHERE lang = ?').run(lang);
		const ins = db.prepare('INSERT OR REPLACE INTO icd11_titles (lang, code, uri, title, search) VALUES (?, ?, ?, ?, ?)');
		for (const r of rows) ins.run(lang, r.code, r.uri, r.title, foldTitle(r.title));
		db.prepare('INSERT OR REPLACE INTO icd11_titles_meta (lang, release, source, sha256, row_count, loaded_at) VALUES (?, ?, ?, ?, ?, ?)').run(
			lang,
			rel.release,
			source,
			sha256,
			rows.length,
			now.toISOString()
		);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	readySet(db).add(lang);
	return rows.length;
}

/** Loads a downloaded language file once per database (reloads when the release's file name changes). */
export function ensureIcd11Titles(db: DB, lang: string): boolean {
	const rel = icd11Language(lang);
	if (!rel) return false;
	if (readySet(db).has(lang)) return true;
	const meta = db.prepare('SELECT source FROM icd11_titles_meta WHERE lang = ?').get(lang) as { source: string } | undefined;
	if (meta && (meta.source === rel.file || meta.source.startsWith('fixture'))) {
		readySet(db).add(lang);
		return true;
	}
	const path = findCodeFile(rel.file);
	if (!path) return false;
	loadIcd11Titles(db, lang, gunzipSync(readFileSync(path)).toString('utf8'), rel.file, rel.sha256);
	return true;
}

/** True when WHO's titles in this language are loaded (English: always false here; it is the main table). */
export function icd11TitlesLoaded(db: DB, lang: string): boolean {
	if (!icd11Language(lang)) return false;
	ensureIcd11Titles(db, lang);
	return !!db.prepare('SELECT 1 AS x FROM icd11_titles_meta WHERE lang = ? AND row_count > 0').get(lang);
}

/** Removes one language's titles (Settings › Code sets). English and saved diagnoses are untouched. */
export function unloadIcd11Titles(db: DB, lang: string): void {
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM icd11_titles WHERE lang = ?').run(lang);
		db.prepare('DELETE FROM icd11_titles_meta WHERE lang = ?').run(lang);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	readySet(db).delete(lang);
}

export interface Icd11TitlesMeta {
	lang: string;
	release: string;
	source: string;
	sha256: string;
	rows: number;
	loadedAt: string;
}

/** What is loaded for a language; null when nothing. */
export function icd11TitlesMeta(db: DB, lang: string): Icd11TitlesMeta | null {
	const m = db.prepare('SELECT lang, release, source, sha256, row_count, loaded_at FROM icd11_titles_meta WHERE lang = ?').get(lang) as
		| { lang: string; release: string; source: string; sha256: string; row_count: number; loaded_at: string }
		| undefined;
	return m ? { lang: m.lang, release: m.release, source: m.source, sha256: m.sha256, rows: m.row_count, loadedAt: m.loaded_at } : null;
}

/** WHO's title of one code in a language (as loaded); null when not loaded or WHO has no title in it. */
export function icd11TitleIn(db: DB, code: string, lang: string): string | null {
	if (!icd11Language(lang)) return null;
	ensureIcd11Titles(db, lang);
	const r = db.prepare('SELECT title FROM icd11_titles WHERE lang = ? AND code = ?').get(lang, code) as { title: string } | undefined;
	return r?.title ?? null;
}

/** Every language with a WHO file, for status lists. */
export const ICD11_TITLE_LANGS = ICD11_LANGUAGES.map((l) => l.lang);
