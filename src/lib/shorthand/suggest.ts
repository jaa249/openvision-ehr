// Shorthand bar suggestions (DESIGN §5.3, §7): which codes and findings to offer while the user types,
// and the code table of the keyboard help sheet. Pure functions (no DOM, no i18n), unit-tested in
// suggest.test.ts; the bar and the help sheet only add the translated descriptions.

import { FIELDS, FIELD_BY_ID, SECTIONS, type SectionId } from '#lib/exam/catalog.ts';
import type { IssueType } from '#lib/history/types.ts';
import { ALIASES, COMMANDS, SPECIAL, type Command } from './codes.ts';
import { ISSUE_CODES, resolveCode, suggest } from './parse.ts';

// ---------- the vocabulary ----------

/**
 * One typeable code. kind: 'alias' (short code), 'field' (a field id, also a valid code), 'command'
 * (D, DAS, CEXT…: a whole entry, no colon), 'issue' (POH:, PMH:… patient history), 'special' (HERT).
 */
export type CodeKind = 'alias' | 'field' | 'command' | 'issue' | 'special';
export interface CodeEntry {
	code: string;
	kind: CodeKind;
	/** Target field ids (alias, field, special). */
	fields: string[];
	/** The section the code writes to; null for history codes and all-section commands. */
	section: SectionId | null;
	command?: Command;
	issue?: IssueType;
}

const KIND_ORDER: Record<CodeKind, number> = { alias: 0, command: 1, issue: 2, special: 3, field: 4 };
export const HERTEL_FIELDS = ['ODHERTEL', 'HERTELBASE', 'OSHERTEL'];

function sectionOf(fields: string[]): SectionId | null {
	return FIELD_BY_ID.get(fields[0])?.section ?? null;
}

/** Every code the parser accepts, aliases first (the parser's own resolution order decides clashes). */
export const CODE_ENTRIES: CodeEntry[] = (() => {
	const out: CodeEntry[] = [];
	const seen = new Set<string>();
	const add = (e: CodeEntry) => {
		if (seen.has(e.code)) return;
		seen.add(e.code);
		out.push(e);
	};
	// Same precedence as parseShorthand: commands, then history codes, then HERT, then aliases / field ids.
	for (const [code, command] of Object.entries(COMMANDS))
		add({ code, kind: 'command', fields: [], section: command.sections === 'all' || command.sections.length !== 1 ? null : command.sections[0], command });
	for (const [code, issue] of Object.entries(ISSUE_CODES)) add({ code, kind: 'issue', fields: [], section: null, issue });
	for (const code of SPECIAL) add({ code, kind: 'special', fields: HERTEL_FIELDS, section: 'EXT' });
	for (const [code, fields] of Object.entries(ALIASES)) {
		// A field id wins over an alias of the same name in the parser, so describe what really happens.
		const real = resolveCode(code) ?? fields;
		add({ code, kind: FIELD_BY_ID.has(code) ? 'field' : 'alias', fields: real, section: sectionOf(real) });
	}
	for (const f of FIELDS) add({ code: f.id, kind: 'field', fields: [f.id], section: f.section });
	return out;
})();

export const CODE_ENTRY = new Map(CODE_ENTRIES.map((e) => [e.code, e]));

// ---------- where the caret is ----------

/** Grade or size typed before a finding ("1+ inj", "trace spk"): kept when a suggestion is accepted. */
const GRADE_RE = /^(?:no|tr|trace|mild|mod|moderate|severe|\+?[1-4]\+?|[1-9](?:\.\d)?\s?mm)\s+/i;

export type ShorthandContext =
	| { mode: 'code'; start: number; end: number; query: string }
	| { mode: 'term'; start: number; end: number; query: string; code: string };

/**
 * What the caret is in: a code being typed ("rc|"), or a finding after a code ("rc:1+ in|").
 * start/end: the part of `text` an accepted suggestion replaces. null: nothing to suggest.
 */
export function shorthandContext(text: string, caret: number): ShorthandContext | null {
	caret = Math.max(0, Math.min(caret, text.length));
	const segStart = text.lastIndexOf(';', caret - 1) + 1;
	const before = text.slice(segStart, caret);
	const lead = before.match(/^[\s\W_]*/)?.[0].length ?? 0; // the parser ignores leading punctuation too
	const entry = before.slice(lead);
	const colon = entry.indexOf(':');
	if (colon < 0) {
		if (!/^[A-Za-z0-9_]+$/.test(entry)) return null;
		const tail = text.slice(caret).match(/^[A-Za-z0-9_]*/)?.[0].length ?? 0;
		return { mode: 'code', start: segStart + lead, end: caret + tail, query: entry };
	}
	const code = entry.slice(0, colon).trim();
	if (!/^[A-Za-z0-9_]+$/.test(code)) return null;
	const after = entry.slice(colon + 1);
	const fragAt = after.lastIndexOf(',') + 1;
	const frag = after.slice(fragAt);
	const ws = frag.match(/^\s*/)?.[0].length ?? 0;
	const grade = frag.slice(ws).match(GRADE_RE)?.[0].length ?? 0;
	const query = frag.slice(ws + grade).replace(/\.a$/, '');
	const start = segStart + lead + colon + 1 + fragAt + ws + grade;
	// Replace up to the end of this finding (next comma / semicolon), but keep a trailing ".a".
	let rest = text.slice(caret).match(/^[^,;]*/)?.[0] ?? '';
	rest = rest.replace(/\s*(?:\.a)?\s*$/, '');
	return { mode: 'term', start, end: caret + rest.length, query, code: code.toUpperCase() };
}

/** Text after accepting `insert` for the context; caret goes right after the inserted text. */
export function acceptInto(text: string, ctx: ShorthandContext, insert: string): { text: string; caret: number } {
	let ins = insert;
	if (ctx.mode === 'code' && ins.endsWith(':') && text[ctx.end] === ':') ins = ins.slice(0, -1);
	const next = text.slice(0, ctx.start) + ins + text.slice(ctx.end);
	return { text: next, caret: ctx.start + ins.length + (ins !== insert ? 1 : 0) };
}

/** What a code inserts: lower case like the user types; field-writing codes get their colon. */
export function codeInsert(e: CodeEntry): string {
	return e.code.toLowerCase() + (e.kind === 'command' ? '' : ':');
}

// ---------- ranking ----------

export interface Rankable {
	/** The code or quick-pick label (matched by prefix first). */
	primary: string;
	/** Plain-words description (matched by word start, then anywhere). */
	secondary?: string;
	/** Smaller sorts first among equal matches (e.g. aliases before field ids, normal value first). */
	order?: number;
}

const WORD_SPLIT = /[\s,;:/()+·.\-–—]+/;

/** 0 prefix of primary, 1 word start (either text), 2 contained anywhere, -1 no match. */
export function matchTier(item: Rankable, query: string): number {
	const q = query.toLocaleLowerCase().trim();
	if (!q) return 0;
	const p = item.primary.toLocaleLowerCase();
	const s = (item.secondary ?? '').toLocaleLowerCase();
	if (p.startsWith(q)) return 0;
	if ([...p.split(WORD_SPLIT), ...s.split(WORD_SPLIT)].some((w) => w && w.startsWith(q))) return 1;
	if (p.includes(q) || s.includes(q)) return 2;
	return -1;
}

/**
 * Filters and orders: prefix > word start > contains; then recently used, exact match, the item's own
 * order, shorter, alphabetical. `recent` lists primaries, most recent first (case-insensitive).
 */
export function rank<T extends Rankable>(items: readonly T[], query: string, opts: { recent?: readonly string[]; limit?: number } = {}): T[] {
	const q = query.toLocaleLowerCase().trim();
	const recent = (opts.recent ?? []).map((r) => r.toLocaleLowerCase());
	const recentAt = (p: string) => {
		const i = recent.indexOf(p.toLocaleLowerCase());
		return i < 0 ? Infinity : i;
	};
	return items
		.map((item, i) => ({ item, i, tier: matchTier(item, q) }))
		.filter((x) => x.tier >= 0)
		.sort(
			(a, b) =>
				a.tier - b.tier ||
				recentAt(a.item.primary) - recentAt(b.item.primary) ||
				Number(b.item.primary.toLocaleLowerCase() === q) - Number(a.item.primary.toLocaleLowerCase() === q) ||
				(a.item.order ?? 0) - (b.item.order ?? 0) ||
				(q ? a.item.primary.length - b.item.primary.length : 0) ||
				(q ? a.item.primary.localeCompare(b.item.primary) : a.i - b.i)
		)
		.slice(0, opts.limit ?? 8)
		.map((x) => x.item);
}

export interface CodeSuggestion extends Rankable {
	entry: CodeEntry;
	/** Offered as "did you mean" (a near miss), not a match. */
	fuzzy?: boolean;
}

/**
 * Code suggestions for what is typed before the colon. `describe` gives each entry's plain words
 * (translated by the caller). Near misses from the parser's "did you mean" fill the list when matches
 * run short, so a typo shows its correction before Enter.
 */
export function suggestCodes(
	query: string,
	describe: (e: CodeEntry) => string,
	opts: { recent?: readonly string[]; limit?: number; entries?: readonly CodeEntry[] } = {}
): CodeSuggestion[] {
	const limit = opts.limit ?? 8;
	if (!query.trim()) return [];
	const items: CodeSuggestion[] = (opts.entries ?? CODE_ENTRIES).map((entry) => ({
		entry,
		primary: entry.code,
		secondary: describe(entry),
		order: KIND_ORDER[entry.kind]
	}));
	const out = rank(items, query, { recent: opts.recent, limit });
	if (out.length < limit && query.trim().length >= 2 && !CODE_ENTRY.has(query.trim().toUpperCase())) {
		const have = new Set(out.map((s) => s.entry.code));
		for (const code of suggest(query.trim().toUpperCase(), limit)) {
			const entry = CODE_ENTRY.get(code);
			if (!entry || have.has(code) || out.length >= limit) continue;
			out.push({ entry, primary: code, secondary: describe(entry), order: KIND_ORDER[entry.kind], fuzzy: true });
		}
	}
	return out;
}

// ---------- findings after the colon ----------

export interface TermSuggestion extends Rankable {
	/** What is inserted. */
	text: string;
	/** The user's normal value for this field (from Settings › Normals). */
	normal?: boolean;
}

/** A quick pick as far as suggestions care (the user's own list, any zone). */
export interface PickLike {
	zone: string;
	row: string;
	label: string;
	text: string;
}

/**
 * Findings to offer for a code's fields: the user's normal value first, then the quick picks of the
 * same row (their own list), without "clear field" picks and duplicates.
 */
export function termsFor(code: string, picks: readonly PickLike[], defaults: Record<string, string>): TermSuggestion[] {
	const fields = resolveCode(code.toUpperCase());
	if (!fields?.length) return [];
	const out: TermSuggestion[] = [];
	const seen = new Set<string>();
	const push = (t: TermSuggestion) => {
		const k = t.text.toLocaleLowerCase();
		if (!t.text || seen.has(k)) return;
		seen.add(k);
		out.push(t);
	};
	for (const id of fields) {
		const n = defaults[id];
		if (n) push({ primary: n, text: n, normal: true, order: 0 });
	}
	const rows = new Set(fields.map((id) => FIELD_BY_ID.get(id)).filter((f) => !!f).map((f) => `${f.section}/${f.row}`));
	for (const p of picks) {
		if (!rows.has(`${p.zone}/${p.row}`) || !p.text) continue;
		push({ primary: p.label, secondary: p.text !== p.label ? p.text : undefined, text: p.text, order: 1 });
	}
	return out;
}

// ---------- the help sheet's code table ----------

export interface CodeRow {
	/** Codes that do the same thing, shortest first ("BC", "C"). */
	codes: string[];
	entry: CodeEntry;
}

const SECTION_ORDER = new Map(SECTIONS.map((s, i) => [s.id, i]));
const FIELD_ORDER = new Map(FIELDS.map((f, i) => [f.id, i]));

/**
 * One row per distinct effect: every alias, command and history code, grouped when several codes do
 * the same thing. Field ids are left out (the sheet says every field name also works).
 */
export function codeRows(): CodeRow[] {
	const groups = new Map<string, CodeRow>();
	for (const e of CODE_ENTRIES) {
		if (e.kind === 'field') continue;
		const key =
			e.kind === 'command'
				? `cmd:${e.command!.kind}:${e.command!.sections === 'all' ? 'all' : e.command!.sections.join(',')}`
				: e.kind === 'issue'
					? `issue:${e.issue}`
					: `f:${e.fields.join(',')}`;
		const g = groups.get(key);
		if (g) g.codes.push(e.code);
		else groups.set(key, { codes: [e.code], entry: e });
	}
	const sectionRank = (e: CodeEntry) => (e.section ? (SECTION_ORDER.get(e.section) ?? 99) : e.kind === 'issue' ? -1 : -2);
	return [...groups.values()]
		.map((g) => ({ ...g, codes: [...g.codes].sort((a, b) => a.length - b.length || a.localeCompare(b)) }))
		.sort(
			(a, b) =>
				sectionRank(a.entry) - sectionRank(b.entry) ||
				(FIELD_ORDER.get(a.entry.fields[0]) ?? 0) - (FIELD_ORDER.get(b.entry.fields[0]) ?? 0) ||
				a.entry.fields.length - b.entry.fields.length ||
				a.codes[0].localeCompare(b.codes[0])
		);
}

// ---------- recently used codes (this browser only) ----------

const RECENT_KEY = 'openvision.shorthand.recent';
const RECENT_MAX = 20;

/** Codes committed most recently first; empty when storage is unavailable. */
export function loadRecent(): string[] {
	try {
		const v = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? '[]');
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
	} catch {
		return [];
	}
}

/** Moves these codes to the front of the list (upper case) and stores it. Returns the new list. */
export function rememberCodes(codes: readonly string[], current: readonly string[] = loadRecent()): string[] {
	const up = codes.map((c) => c.toUpperCase()).filter((c) => CODE_ENTRY.has(c));
	const next = [...new Set([...up, ...current])].slice(0, RECENT_MAX);
	try {
		globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(next));
	} catch {
		/* private window or storage off: recents last for this page only */
	}
	return next;
}

/** The leading code of each committed entry ("rc:quiet" -> RC), for rememberCodes. */
export function codesOf(sources: readonly string[]): string[] {
	return sources.map((s) => s.match(/^[A-Za-z0-9_]+/)?.[0] ?? '').filter(Boolean);
}
