// WHO ICD-11 MMS: reading WHO's SimpleTabulation file and picking a code by searching WHO titles.
// Pure (no I/O): the server loads the downloaded file (D49) into a table (src/lib/server/icd11.ts); tests use
// a few real rows. Nothing here pairs a clinical term with an ICD-11 code (D44): the findings engine
// passes words, and bestIcd11 searches the titles WHO publishes.
import { ICD11_CODE_RE, ICD11_EXT_RE, icd11Normalize, icd11Parts, spellingVariants } from './index.ts';

/** One coded ICD-11 entity (a category; blocks and chapters have no code and are not kept). */
export interface Icd11Entity {
	/** e.g. "9C61.0Z", "XK9J". */
	code: string;
	/** Linearization (release) URI, e.g. http://id.who.int/icd/release/11/mms/1849071057/unspecified. */
	uri: string;
	/** WHO title without the leading "- - " depth markers. */
	title: string;
	leaf: boolean;
	/** "Other specified" / "unspecified" residual category. */
	residual: boolean;
	/** "01".."26", "V" or "X" (extension codes). */
	chapter: string;
	/** Parent entity (WHO foundation URI, as in the file). */
	parent: string;
	/** WHO ClassKind ("category" for every coded row). */
	kind: string;
	/** Language of `title` when it is WHO's title in another language (D50); absent = English. */
	titleLang?: string;
}

/** Splits WHO's tab-separated text: UTF-8 BOM, quoted fields with "" escapes, tabs or newlines inside quotes. */
export function parseTsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	let atStart = true;
	for (; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += ch;
			continue;
		}
		if (ch === '"' && atStart) {
			quoted = true;
			atStart = false;
		} else if (ch === '\t') {
			row.push(field);
			field = '';
			atStart = true;
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			atStart = true;
		} else {
			field += ch;
			atStart = false;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** Title for display: WHO's leading "- - " depth markers removed (presentation only). */
export const cleanTitle = (t: string) => t.replace(/^(?:-\s+)+/, '').trim();

/** Parses the SimpleTabulation file into its coded entities (columns found by header name). */
export function parseIcd11File(text: string): Icd11Entity[] {
	const rows = parseTsv(text);
	const header = (rows.shift() ?? []).map((h) => h.trim());
	const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
	const ix = {
		uri: col('Linearization URI'),
		code: col('Code'),
		title: col('Title'),
		kind: col('ClassKind'),
		residual: col('IsResidual'),
		chapter: col('ChapterNo'),
		leaf: col('isLeaf'),
		parent: col('Parent')
	};
	if (Object.values(ix).some((n) => n < 0)) throw new Error('Not an ICD-11 SimpleTabulation file (missing columns).');
	const out: Icd11Entity[] = [];
	for (const r of rows) {
		const code = (r[ix.code] ?? '').trim();
		if (!code) continue;
		out.push({
			code,
			uri: (r[ix.uri] ?? '').trim(),
			title: cleanTitle(r[ix.title] ?? ''),
			leaf: (r[ix.leaf] ?? '').trim().toLowerCase() === 'true',
			residual: (r[ix.residual] ?? '').trim().toLowerCase() === 'true',
			chapter: (r[ix.chapter] ?? '').trim(),
			parent: (r[ix.parent] ?? '').trim(),
			kind: (r[ix.kind] ?? '').trim()
		});
	}
	return out;
}

// ---------- validating a code to save ----------

export interface Icd11Resolved {
	/** Normalised, e.g. "9C61.0Z&XK9J". */
	code: string;
	/** Titles joined: "Primary open-angle glaucoma, unspecified; Bilateral". */
	description: string;
	/** URIs in the same order as the parts, "&"-joined. */
	uris: string;
	/** Language of the titles in `description` (D50): 'en', or WHO's language file when every part has a title in it. */
	titleLang?: string;
}

/**
 * Checks a typed code against the code set: the stem must exist, be a leaf and not be an extension
 * code; every "&" part must be an extension code (chapter X). Returns the code with titles and URIs,
 * or the message for the user.
 */
export function resolveIcd11(get: (code: string) => Icd11Entity | null, raw: string): Icd11Resolved | { error: string } {
	const code = icd11Normalize(raw);
	if (!code || !ICD11_CODE_RE.test(code)) return { error: `"${raw.trim()}" is not an ICD-11 code.` };
	const { stem, extensions } = icd11Parts(code);
	const s = get(stem);
	if (!s) return { error: `${stem} is not in the ICD-11 code set.` };
	if (s.chapter === 'X') return { error: `${stem} is an extension code; add it after a diagnosis code with "&".` };
	if (!s.leaf) return { error: `${stem} is a category; choose one of the more specific codes under it.` };
	const parts: Icd11Entity[] = [s];
	for (const x of extensions) {
		const e = ICD11_EXT_RE.test(x) ? get(x) : null;
		if (!e || e.chapter !== 'X') return { error: `${x} is not an ICD-11 extension code.` };
		parts.push(e);
	}
	return { code, description: parts.map((p) => p.title).join('; '), uris: parts.map((p) => p.uri).join('&') };
}

// ---------- picking a code from WHO titles (findings engine, ICD-11) ----------

/** What the engine needs from the code set. */
export interface Icd11Lookup {
	get(code: string): Icd11Entity | null;
	/** Every category in these chapters (extension codes are never candidates). */
	inChapters(chapters: string[]): Icd11Entity[];
}

export function memoryIcd11Lookup(entities: Icd11Entity[]): Icd11Lookup {
	const byCode = new Map(entities.map((e) => [e.code, e]));
	return {
		get: (code) => byCode.get(code) ?? null,
		inChapters: (chapters) => entities.filter((e) => e.chapter !== 'X' && chapters.includes(e.chapter))
	};
}

/** Words that never make a title more or less specific. */
const STOP = new Set([
	'of', 'the', 'and', 'with', 'in', 'to', 'a', 'an', 'by', 'due', 'or', 'for', 'on', 'at', 'as',
	'eye', 'eyes', 'eyeball', 'unspecified', 'specified', 'other', 'certain', 'disorder', 'disorders', 'type'
]);
/** Prefixes that turn a word into its opposite or a look-alike: "nonproliferative", "pseudodrusen". */
const NEGATING = /^(non|pseudo|anti)/;

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];

/**
 * Whether query word `w` (any spelling) is in title token `t`: at the token start, at a hyphen part
 * ("age-related" has "related") unless after "non-", or inside a compound after the combining vowel
 * "o" ("blepharoptosis" has "ptosis"). Short words (2 letters) must be the whole token.
 */
function wordIn(variants: string[], t: string): boolean {
	const parts = t.split('-');
	for (const v of variants) {
		// A hyphenated query word ("age-related", "after-cataract") matches the same hyphenated title word.
		if (v.includes('-')) {
			if (t === v || t.startsWith(`${v}-`)) return true;
			continue;
		}
		if (v.length <= 2) {
			if (parts.includes(v)) return true;
			continue;
		}
		for (let p = 0; p < parts.length; p++) {
			if (p > 0 && parts[p - 1] === 'non') continue;
			const part = parts[p];
			if (part.startsWith(v)) return true;
			const at = part.indexOf(v, 1);
			if (at > 0 && part[at - 1] === 'o' && !NEGATING.test(part)) return true;
		}
	}
	return false;
}

export interface Icd11Query {
	/** Every word must be in the title (the term, or its label). */
	words: string[];
	/** Words that may be in the title without counting against it (the exam field's description). */
	context?: string[];
	/** Chapters to search; default ["09"] (diseases of the visual system). */
	chapters?: string[];
}

interface Scored {
	e: Icd11Entity;
	extra: number;
	contextHits: number;
	unspecified: number;
}

/** How well one title (or one " or " alternative of it) covers the query; null when a word is missing. */
function scoreText(text: string, q: string[][], context: string[][]): { extra: number; contextHits: number } | null {
	const toks = tokens(text);
	if (!q.every((variants) => toks.some((t) => wordIn(variants, t)))) return null;
	let extra = 0;
	let contextHits = 0;
	for (const t of toks) {
		if (STOP.has(t) || q.some((v) => wordIn(v, t))) continue;
		if (context.some((v) => wordIn(v, t) || v.some((x) => t.length > 2 && x.startsWith(t)))) {
			contextHits++;
			continue;
		}
		extra++;
	}
	return { extra, contextHits };
}

/**
 * The best ICD-11 code for a few words, or null when there is no good one (never a guess):
 * - Only categories whose title has every word (any spelling); text after "without" does not count,
 *   and a title "A or B" is judged on A and on B as well as whole.
 * - "Other specified" residuals are never chosen.
 * - Fewest extra (unasked) words wins; more than one extra word is no hit, and one extra word is a hit
 *   only when no other title ties at one (two named subtypes = we cannot tell which).
 * - Ties: chapter 09 first, more field-description words, "unspecified" first, shorter title.
 * - A non-leaf answer becomes its "unspecified" residual child (code + "Z"); none = no hit.
 */
export function bestIcd11(lookup: Icd11Lookup, query: Icd11Query): Icd11Entity | null {
	const q = query.words
		.flatMap(tokens)
		.filter((w) => !STOP.has(w))
		.map(spellingVariants);
	if (!q.length) return null;
	const context = (query.context ?? []).flatMap(tokens).filter((w) => !STOP.has(w)).map(spellingVariants);
	const scored: Scored[] = [];
	for (const e of lookup.inChapters(query.chapters ?? ['09'])) {
		if (e.residual && !/unspecified/i.test(e.title)) continue;
		const main = e.title.split(/\bwithout\b/i)[0];
		const texts = [main, ...main.split(/\s+or\s+/i).filter((_, __, all) => all.length > 1)];
		let best: { extra: number; contextHits: number } | null = null;
		for (const t of texts) {
			const s = scoreText(t, q, context);
			if (s && (!best || s.extra < best.extra || (s.extra === best.extra && s.contextHits > best.contextHits))) best = s;
		}
		if (best && best.extra <= 1) scored.push({ e, ...best, unspecified: /unspecified/i.test(e.title) ? 0 : 1 });
	}
	if (!scored.length) return null;
	const nine = (s: Scored) => (s.e.chapter === '09' ? 0 : 1);
	scored.sort(
		(a, b) =>
			a.extra - b.extra ||
			nine(a) - nine(b) ||
			b.contextHits - a.contextHits ||
			a.unspecified - b.unspecified ||
			a.e.title.length - b.e.title.length ||
			a.e.code.localeCompare(b.e.code)
	);
	const resolve = (e: Icd11Entity): Icd11Entity | null => {
		if (e.leaf) return e;
		const child = lookup.get(`${e.code}${e.code.includes('.') ? '' : '.'}Z`);
		return child && child.leaf && child.residual ? child : null;
	};
	const top = scored[0];
	if (top.extra === 1) {
		const answers = new Set(scored.filter((s) => s.extra === 1).map((s) => resolve(s.e)?.code ?? s.e.code));
		if (answers.size > 1) return null;
	}
	return resolve(top.e);
}
