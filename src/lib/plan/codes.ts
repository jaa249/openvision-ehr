// ICD-10-CM helpers shared by the server, the engine and the client (no I/O here).
// The server's lookup (src/lib/server/icd10.ts) prefilters in SQL and ranks with rankCodes;
// tests build an in-memory lookup from a fixture with memoryLookup, using the same ranking.

export interface IcdCode {
	/** Display form with the dot after the 3rd character, e.g. "H25.13". */
	code: string;
	description: string;
	/** Has no longer (more specific) code under it in the code set. */
	billable: boolean;
}

/**
 * A "best code" question for the findings engine (§10.3).
 * Phrases match case-insensitively at a word start, allowing a plural ending ("scar" ~ "scars"),
 * so "proliferative" never matches inside "nonproliferative" and "eye" never matches "eyelid".
 */
export interface CodeQuery {
	/** Only codes starting with this (dot optional), e.g. "H25.1". */
	prefix?: string;
	/** Every phrase must appear. */
	all?: string[];
	/** Ranked: more of these phrases is better. */
	any?: string[];
	/** No phrase may appear. */
	none?: string[];
}

export interface CodeLookup {
	/** One code (display or bare form), billable or not; null when unknown. */
	get(code: string): IcdCode | null;
	/** The best billable code for the query; null when nothing qualifies. */
	best(q: CodeQuery): IcdCode | null;
}

/** "h4011" / "H40.11" -> "H40.11"; null when it is not shaped like an ICD-10-CM code. */
export function displayCode(raw: string): string | null {
	const s = raw.trim().toUpperCase().replace(/^ICD-?10(?:-CM)?\s*:?\s*/, '').replace('.', '');
	if (!/^[A-Z][0-9][0-9A-Z][0-9A-Z]{0,4}$/.test(s)) return null;
	return s.length > 3 ? `${s.slice(0, 3)}.${s.slice(3)}` : s;
}

/** "H40.11" -> "H4011" (the code set's stored form). */
export function bareCode(display: string): string {
	return display.replace('.', '').toUpperCase();
}

/** "ICD10:CODE (description)" for each code, "; "-separated (§10.3 code text). */
export function codeTextFor(codes: { code: string; description: string }[]): string {
	return codes.map((c) => (c.description ? `ICD10:${c.code} (${c.description})` : `ICD10:${c.code}`)).join('; ');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex for a phrase at a word start with an optional plural ending (see CodeQuery). */
export function phraseRe(phrase: string): RegExp {
	const p = escapeRe(phrase.trim()).replace(/\s+/g, '\\s+');
	return new RegExp(`(?<![A-Za-z0-9])${p}(?:s|es)?(?![A-Za-z0-9])`, 'i');
}

const STOP = new Set(['of', 'the', 'and', 'with', 'without', 'in', 'to', 'or', 'a', 'an', 'eye', 'unspecified', 'other', 'not', 'elsewhere', 'classified']);
const words = (s: string) =>
	(s.toLowerCase().match(/[a-z0-9]+/g) ?? []).map((w) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w)).filter(Boolean);

/**
 * Orders candidates for a query: drops those failing all/none/prefix, then ranks by
 * (1) how many `any` phrases they contain, (2) fewest words not asked for (so "Unspecified ptosis
 * of right eyelid" beats "Mechanical ptosis of right eyelid" for "ptosis"), (3) "Unspecified ..." first,
 * (4) shorter description, (5) code.
 */
export function rankCodes(candidates: IcdCode[], q: CodeQuery): IcdCode[] {
	const all = (q.all ?? []).filter(Boolean).map(phraseRe);
	const any = (q.any ?? []).filter(Boolean).map(phraseRe);
	const none = (q.none ?? []).filter(Boolean).map(phraseRe);
	const prefix = q.prefix ? bareCode(q.prefix) : '';
	const asked = new Set(words([...(q.all ?? []), ...(q.any ?? [])].join(' ')));
	const scored: { c: IcdCode; hits: number; extra: number; generic: number }[] = [];
	for (const c of candidates) {
		if (!c.billable) continue;
		if (prefix && !bareCode(c.code).startsWith(prefix)) continue;
		if (!all.every((r) => r.test(c.description))) continue;
		if (none.some((r) => r.test(c.description))) continue;
		const hits = any.filter((r) => r.test(c.description)).length;
		const extra = words(c.description).filter((w) => !STOP.has(w) && !asked.has(w)).length;
		// A generic "Unspecified X" code is the safer default than a named subtype (not "unspecified eye").
		const generic = /(?<![A-Za-z])unspecified(?!\s+eye)/i.test(c.description) ? 0 : 1;
		scored.push({ c, hits, extra, generic });
	}
	scored.sort(
		(a, b) =>
			b.hits - a.hits ||
			a.extra - b.extra ||
			a.generic - b.generic ||
			a.c.description.length - b.c.description.length ||
			a.c.code.localeCompare(b.c.code)
	);
	return scored.map((s) => s.c);
}

/** Parses code-set text (one "CODE    description" per line, CMS order file format) into codes with billable flags. */
export function parseCodeFile(text: string): IcdCode[] {
	const rows: { bare: string; description: string }[] = [];
	for (const line of text.split(/\r?\n/)) {
		const m = /^([A-Z][0-9][0-9A-Z][0-9A-Z]{0,4})\s+(.+?)\s*$/.exec(line);
		if (m) rows.push({ bare: m[1], description: m[2] });
	}
	const sorted = rows.map((r) => r.bare).sort();
	const hasChild = new Set<string>();
	// After sorting, a code's children (longer codes it prefixes) follow it directly.
	for (let i = 0; i < sorted.length - 1; i++) {
		if (sorted[i + 1].length > sorted[i].length && sorted[i + 1].startsWith(sorted[i])) hasChild.add(sorted[i]);
	}
	return rows.map((r) => ({
		code: r.bare.length > 3 ? `${r.bare.slice(0, 3)}.${r.bare.slice(3)}` : r.bare,
		description: r.description,
		billable: !hasChild.has(r.bare)
	}));
}

/** In-memory lookup over a small list (tests, fixtures). Same ranking as the server. */
export function memoryLookup(codes: IcdCode[]): CodeLookup {
	const byBare = new Map(codes.map((c) => [bareCode(c.code), c]));
	return {
		get: (code) => {
			const d = displayCode(code);
			return d ? (byBare.get(bareCode(d)) ?? null) : null;
		},
		best: (q) => rankCodes(codes, q)[0] ?? null
	};
}
