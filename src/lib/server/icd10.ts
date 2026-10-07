// ICD-10-CM code set: loaded on first use from the practice's downloaded copy of the CMS FY2027 codes
// file (public domain, D49: nothing is shipped; see codepaths.ts) into the icd10 table in one
// transaction, then searched by code prefix or description words.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { DB } from './db.ts';
import { findCodeFile as findFile } from './codepaths.ts';
import { RELEASES } from '#lib/codesets/releases.ts';
import { bareCode, displayCode, parseCodeFile, rankCodes, type CodeLookup, type CodeQuery, type IcdCode } from '#lib/plan/codes.ts';

/** The cache file name of the current release (src/lib/codesets/releases.ts); the table reloads itself when it changes. */
export const ICD10_FILE = RELEASES.icd10cm.file;

/** Where a downloaded code file is (see codepaths.ts); defaults to the ICD-10-CM file. */
export function findCodeFile(name = ICD10_FILE): string | null {
	return findFile(name);
}

/**
 * Replaces the table with `text` (code-set file format) in one transaction. `source` is remembered so
 * ensureIcd10 knows what is loaded; tests pass a fixture with a source starting "fixture".
 */
export function loadIcd10(db: DB, text: string, source: string, now = new Date()): number {
	const codes = parseCodeFile(text);
	db.exec('BEGIN');
	try {
		db.exec('DELETE FROM icd10');
		const ins = db.prepare('INSERT OR REPLACE INTO icd10 (code, display, description, billable) VALUES (?, ?, ?, ?)');
		for (const c of codes) ins.run(bareCode(c.code), c.code, c.description, c.billable ? 1 : 0);
		db.prepare('INSERT OR REPLACE INTO icd10_meta (id, source, row_count, loaded_at) VALUES (1, ?, ?, ?)').run(source, codes.length, now.toISOString());
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	ready.add(db);
	return codes.length;
}

const ready = new WeakSet<DB>();

/**
 * Loads the downloaded code file once per database (idempotent; reloads when the file name changes).
 * False when there is no file: searches return nothing and typed codes are refused (D49).
 */
export function ensureIcd10(db: DB): boolean {
	if (ready.has(db)) return true;
	const meta = db.prepare('SELECT source FROM icd10_meta WHERE id = 1').get() as { source: string } | undefined;
	if (meta && (meta.source === ICD10_FILE || meta.source.startsWith('fixture'))) {
		ready.add(db);
		return true;
	}
	const path = findCodeFile();
	if (!path) return false;
	loadIcd10(db, gunzipSync(readFileSync(path)).toString('utf8'), ICD10_FILE);
	return true;
}

/** Empties the table (Settings › Code sets › Remove). Saved diagnoses keep their own code and text. */
export function unloadIcd10(db: DB): void {
	db.exec('BEGIN');
	try {
		db.exec('DELETE FROM icd10');
		db.exec('DELETE FROM icd10_meta');
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	ready.delete(db);
}

/** What is in the table: source file, number of codes and when it was loaded; null when empty. */
export function icd10Meta(db: DB): { source: string; rows: number; loadedAt: string } | null {
	const m = db.prepare('SELECT source, row_count, loaded_at FROM icd10_meta WHERE id = 1').get() as
		| { source: string; row_count: number; loaded_at: string }
		| undefined;
	return m ? { source: m.source, rows: m.row_count, loadedAt: m.loaded_at } : null;
}

type Row = { display: string; description: string; billable: number };
const toCode = (r: Row): IcdCode => ({ code: r.display, description: r.description, billable: r.billable === 1 });
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** One code by display or bare form; null when unknown or the code set is not loaded. */
export function getIcd10(db: DB, code: string): IcdCode | null {
	ensureIcd10(db);
	const d = displayCode(code);
	if (!d) return null;
	const r = db.prepare('SELECT display, description, billable FROM icd10 WHERE code = ?').get(bareCode(d)) as Row | undefined;
	return r ? toCode(r) : null;
}

/** True when billable codes exist under this code (it is a category, e.g. "H25.1"). */
export function isIcd10Category(db: DB, code: string): boolean {
	ensureIcd10(db);
	const d = displayCode(code);
	if (!d) return false;
	const bare = bareCode(d);
	return !!db.prepare("SELECT 1 AS x FROM icd10 WHERE code LIKE ? ESCAPE '\\' AND code <> ? LIMIT 1").get(`${likeEscape(bare)}%`, bare);
}

/** Whether a code set is loaded (typed codes are only checked against it when it is). */
export function icd10Loaded(db: DB): boolean {
	ensureIcd10(db);
	return !!db.prepare('SELECT 1 AS x FROM icd10 LIMIT 1').get();
}

/**
 * Code finder search: billable codes whose code starts with the query (dot optional) come first,
 * then codes whose description contains every word (case-insensitive). Top `limit`.
 */
export function searchIcd10(db: DB, q: string, limit = 25): IcdCode[] {
	ensureIcd10(db);
	const query = q.trim().slice(0, 100);
	if (!query) return [];
	const out: IcdCode[] = [];
	const seen = new Set<string>();
	const bare = query.toUpperCase().replace('.', '');
	if (/^[A-Z][0-9][0-9A-Z]{0,5}$/.test(bare)) {
		const rows = db
			.prepare("SELECT display, description, billable FROM icd10 WHERE billable = 1 AND code LIKE ? ESCAPE '\\' ORDER BY code LIMIT ?")
			.all(`${likeEscape(bare)}%`, limit) as Row[];
		for (const r of rows) {
			out.push(toCode(r));
			seen.add(r.display);
		}
	}
	const words = query.split(/\s+/).filter(Boolean).slice(0, 8);
	if (out.length < limit && words.length) {
		const where = words.map(() => "description LIKE ? ESCAPE '\\'").join(' AND ');
		const rows = db
			.prepare(`SELECT display, description, billable FROM icd10 WHERE billable = 1 AND ${where} ORDER BY length(description), code LIMIT ?`)
			.all(...words.map((w) => `%${likeEscape(w)}%`), limit + seen.size) as Row[];
		for (const r of rows) {
			if (out.length >= limit) break;
			if (!seen.has(r.display)) out.push(toCode(r));
		}
	}
	return out;
}

/** The engine's lookup over the table: SQL narrows by prefix and required phrases, rankCodes orders. */
export function icd10Lookup(db: DB): CodeLookup {
	ensureIcd10(db);
	return {
		get: (code) => getIcd10(db, code),
		best: (q: CodeQuery) => {
			const conds = ['billable = 1'];
			const args: string[] = [];
			if (q.prefix) {
				conds.push("code LIKE ? ESCAPE '\\'");
				args.push(`${likeEscape(bareCode(q.prefix))}%`);
			}
			for (const p of q.all ?? []) {
				if (!p) continue;
				conds.push("description LIKE ? ESCAPE '\\'");
				args.push(`%${likeEscape(p.trim().replace(/\s+/g, ' '))}%`);
			}
			if (args.length === 0) return null; // never rank the whole code set
			const rows = db.prepare(`SELECT display, description, billable FROM icd10 WHERE ${conds.join(' AND ')} LIMIT 5000`).all(...args) as Row[];
			return rankCodes(rows.map(toCode), q)[0] ?? null;
		}
	};
}
