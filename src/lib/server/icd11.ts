// WHO ICD-11 MMS code set (D44): loaded on first use from the practice's downloaded copy of WHO's
// SimpleTabulation file (unchanged, CC BY-ND 3.0 IGO; D49: never shipped or redistributed by us) into
// the icd11 table in one transaction, then searched by code prefix or title words. Same pattern as icd10.ts.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { DB } from './db.ts';
import { findCodeFile } from './codepaths.ts';
import { RELEASES } from '#lib/codesets/releases.ts';
import { spellingVariants } from '#lib/codesets/index.ts';
import { parseIcd11File, resolveIcd11, type Icd11Entity, type Icd11Lookup, type Icd11Resolved } from '#lib/codesets/icd11.ts';
import { icd11Language } from '#lib/codesets/releases.ts';
import { foldTitle, icd11TitleIn, icd11TitlesLoaded } from './icd11_titles.ts';

/** The cache file name of the current release (src/lib/codesets/releases.ts); the table reloads itself when it changes. */
export const ICD11_FILE = RELEASES.icd11.file;

/** Replaces the table with `text` (WHO SimpleTabulation format) in one transaction; `source` as in loadIcd10. */
export function loadIcd11(db: DB, text: string, source: string, now = new Date()): number {
	const rows = parseIcd11File(text);
	db.exec('BEGIN');
	try {
		db.exec('DELETE FROM icd11');
		const ins = db.prepare(
			'INSERT OR REPLACE INTO icd11 (code, bare, uri, title, is_leaf, is_residual, chapter, parent, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		);
		for (const r of rows) ins.run(r.code, r.code.replace('.', ''), r.uri, r.title, r.leaf ? 1 : 0, r.residual ? 1 : 0, r.chapter, r.parent, r.kind);
		db.prepare('INSERT OR REPLACE INTO icd11_meta (id, source, row_count, loaded_at) VALUES (1, ?, ?, ?)').run(source, rows.length, now.toISOString());
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	ready.add(db);
	cache.delete(db);
	return rows.length;
}

const ready = new WeakSet<DB>();

/** Loads the downloaded file once per database (idempotent; reloads when the file name changes). */
export function ensureIcd11(db: DB): boolean {
	if (ready.has(db)) return true;
	const meta = db.prepare('SELECT source FROM icd11_meta WHERE id = 1').get() as { source: string } | undefined;
	if (meta && (meta.source === ICD11_FILE || meta.source.startsWith('fixture'))) {
		ready.add(db);
		return true;
	}
	const path = findCodeFile(ICD11_FILE);
	if (!path) return false;
	loadIcd11(db, gunzipSync(readFileSync(path)).toString('utf8'), ICD11_FILE);
	return true;
}

/** Whether the code set is loaded (ICD-11 codes can only be saved with WHO's title and URI). */
export function icd11Loaded(db: DB): boolean {
	ensureIcd11(db);
	return !!db.prepare('SELECT 1 AS x FROM icd11 LIMIT 1').get();
}

/** Empties the table (Settings › Code sets › Remove). Saved diagnoses keep their code, WHO title and URI. */
export function unloadIcd11(db: DB): void {
	db.exec('BEGIN');
	try {
		db.exec('DELETE FROM icd11');
		db.exec('DELETE FROM icd11_meta');
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	ready.delete(db);
	cache.delete(db);
}

/** What is in the table: source file, number of codes and when it was loaded; null when empty. */
export function icd11Meta(db: DB): { source: string; rows: number; loadedAt: string } | null {
	const m = db.prepare('SELECT source, row_count, loaded_at FROM icd11_meta WHERE id = 1').get() as
		| { source: string; row_count: number; loaded_at: string }
		| undefined;
	return m ? { source: m.source, rows: m.row_count, loadedAt: m.loaded_at } : null;
}

type Row = { code: string; uri: string; title: string; is_leaf: number; is_residual: number; chapter: string; parent: string; kind: string };
const COLS = 'code, uri, title, is_leaf, is_residual, chapter, parent, kind';
const toEntity = (r: Row): Icd11Entity => ({
	code: r.code,
	uri: r.uri,
	title: r.title,
	leaf: r.is_leaf === 1,
	residual: r.is_residual === 1,
	chapter: r.chapter,
	parent: r.parent,
	kind: r.kind
});
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * One entity by code (stem or extension); null when unknown or not loaded. With `lang` (D50), the title is
 * WHO's title in that language when it is loaded and has one (`titleLang` set); else English.
 */
export function getIcd11(db: DB, code: string, lang?: string): Icd11Entity | null {
	ensureIcd11(db);
	const c = code.trim().toUpperCase();
	const r = db.prepare(`SELECT ${COLS} FROM icd11 WHERE code = ? OR bare = ?`).get(c, c.replace('.', '')) as Row | undefined;
	return r ? localized(db, toEntity(r), lang) : null;
}

/** The entity with WHO's title in `lang` when there is one (D50); English otherwise. */
function localized(db: DB, e: Icd11Entity, lang: string | undefined): Icd11Entity {
	if (!lang || lang === 'en' || !icd11Language(lang)) return e;
	const t = icd11TitleIn(db, e.code, lang);
	return t ? { ...e, title: t, titleLang: lang } : e;
}

/**
 * A typed code checked against the set (see resolveIcd11). The code is always checked against the English
 * table; with `lang` (the saving user's language, D50) the description is WHO's titles in that language when
 * every part has one, else English. `titleLang` says which.
 */
export function resolveIcd11Code(db: DB, raw: string, lang?: string): Icd11Resolved | { error: string } {
	ensureIcd11(db);
	const r = resolveIcd11((c) => getIcd11(db, c), raw);
	if ('error' in r) return r;
	if (lang && lang !== 'en' && icd11TitlesLoaded(db, lang)) {
		const titles = r.code.split('&').map((part) => icd11TitleIn(db, part, lang));
		if (titles.every((t): t is string => !!t)) return { ...r, description: titles.join('; '), titleLang: lang };
	}
	return { ...r, titleLang: 'en' };
}

/**
 * Code finder search: codes starting with the query (dot optional) first, then titles holding every
 * word (US spellings find WHO's British ones). Leaves first, chapter 09 (visual system) before others,
 * shorter titles first. Extension codes (chapter X) are never returned: they are only appended.
 * With `lang` (the user's interface language, D50) and WHO's titles in it loaded, titles in that language
 * are searched first (folded: no case, no accents or Arabic diacritics; CJK by substring), then English,
 * and every result shows its title in that language when WHO has one.
 */
export function searchIcd11(db: DB, q: string, limit = 25, lang?: string): Icd11Entity[] {
	ensureIcd11(db);
	const query = q.trim().slice(0, 100);
	if (!query) return [];
	const out: Icd11Entity[] = [];
	const seen = new Set<string>();
	const push = (r: Row) => {
		if (out.length >= limit || seen.has(r.code)) return;
		seen.add(r.code);
		out.push(toEntity(r));
	};
	const bare = query.toUpperCase().replace('.', '');
	if (/^[0-9A-Z]{2,6}$/.test(bare) && /[0-9]/.test(bare)) {
		const rows = db
			.prepare(`SELECT ${COLS} FROM icd11 WHERE chapter <> 'X' AND bare LIKE ? ESCAPE '\\' ORDER BY is_leaf DESC, code LIMIT ?`)
			.all(`${likeEscape(bare)}%`, limit) as Row[];
		rows.forEach(push);
	}
	const words = query.split(/\s+/).filter(Boolean).slice(0, 8);
	const other = lang && lang !== 'en' && icd11TitlesLoaded(db, lang) ? lang : null;
	if (other && out.length < limit && words.length) {
		// WHO's titles in the user's language, matched on the folded copy.
		const folded = words.map(foldTitle).filter(Boolean);
		if (folded.length) {
			const conds = folded.map(() => "t.search LIKE ? ESCAPE '\\'").join(' AND ');
			const rows = db
				.prepare(
					`SELECT ${COLS.split(', ').map((c) => `i.${c}`).join(', ')} FROM icd11_titles t JOIN icd11 i ON i.code = t.code
					 WHERE t.lang = ? AND i.chapter <> 'X' AND ${conds}
					 ORDER BY i.is_leaf DESC, (t.search LIKE ? ESCAPE '\\') DESC, (i.chapter = '09') DESC, length(t.title), i.code LIMIT ?`
				)
				.all(other, ...folded.map((w) => `%${likeEscape(w)}%`), `${likeEscape(folded[0])}%`, limit + seen.size) as Row[];
			rows.forEach(push);
		}
	}
	if (out.length < limit && words.length) {
		const conds: string[] = [];
		const args: string[] = [];
		for (const w of words) {
			const vs = spellingVariants(w);
			conds.push(`(${vs.map(() => "title LIKE ? ESCAPE '\\'").join(' OR ')})`);
			args.push(...vs.map((v) => `%${likeEscape(v)}%`));
		}
		// Titles starting with the first word come first, so "cataract" lists "Cataract, unspecified"
		// before "After-cataract"; then the eye chapter, then shorter titles.
		const first = spellingVariants(words[0]);
		const starts = `(${first.map(() => "title LIKE ? ESCAPE '\\'").join(' OR ')})`;
		const rows = db
			.prepare(
				`SELECT ${COLS} FROM icd11 WHERE chapter <> 'X' AND ${conds.join(' AND ')}
				 ORDER BY is_leaf DESC, ${starts} DESC, (chapter = '09') DESC, length(title), code LIMIT ?`
			)
			.all(...args, ...first.map((v) => `${likeEscape(v)}%`), limit + seen.size) as Row[];
		rows.forEach(push);
	}
	return other ? out.map((e) => localized(db, e, other)) : out;
}

const cache = new WeakMap<DB, Map<string, Icd11Entity[]>>();

/** The engine's lookup over the table (chapter lists are read once per database and kept). */
export function icd11Lookup(db: DB): Icd11Lookup {
	ensureIcd11(db);
	return {
		get: (code) => getIcd11(db, code),
		inChapters: (chapters) => {
			let byKey = cache.get(db);
			if (!byKey) cache.set(db, (byKey = new Map()));
			const key = [...chapters].sort().join(',');
			let list = byKey.get(key);
			if (!list) {
				list = (
					db.prepare(`SELECT ${COLS} FROM icd11 WHERE chapter <> 'X' AND chapter IN (${chapters.map(() => '?').join(',')}) ORDER BY code`).all(...chapters) as Row[]
				).map(toEntity);
				byKey.set(key, list);
			}
			return list;
		}
	};
}
