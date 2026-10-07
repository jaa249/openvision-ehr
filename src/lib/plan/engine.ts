// Findings -> diagnosis engine (spec §10.3 with every FIX; defect list B15).
// Pure: exam text, the patient's issues and the visit date come in; the code-set lookup is injected
// (the server passes the code-set table, tests pass a fixture). Nothing here does I/O.
//
// ICD-10-CM (the default) uses the terms' own ICD-10-CM codes and prefixes. ICD-11 (D44) never does:
// there is no crosswalk. It searches WHO's ICD-11 titles with the term's words and the field's
// description (bestIcd11), and puts the eye in a laterality extension code.
import { EXAM_SECTIONS } from '#lib/exam/catalog.ts';
import { codeTextFor as setCodeText, icd11Normalize, LATERALITY_EXT, withLaterality, type CodeSetId, type LateralitySide } from '#lib/codesets/index.ts';
import { bestIcd11, resolveIcd11, type Icd11Lookup, type Icd11Query } from '#lib/codesets/icd11.ts';
import { displayCode, memoryLookup, type CodeLookup, type CodeQuery, type IcdCode } from './codes.ts';
import { CODING_TERMS, FIELD_DESCRIPTIONS, type CodingTerm } from './terms.ts';
import type { Candidate } from './types.ts';

/** What the engine needs from an issue (a subset of history's Issue). */
export interface EngineIssue {
	id: number;
	type: string;
	title: string;
	codes: string;
	/** YYYY-MM-DD or ''. */
	begin: string;
	comments: string;
	active: boolean;
	/** The code set the issue's codes were saved with; absent = ICD-10-CM. */
	codeSystem?: CodeSetId;
}

export interface EngineInput {
	/** Exam field id -> text. */
	findings: Record<string, string>;
	issues: EngineIssue[];
	/** The visit date (YYYY-MM-DD), for the IOL 90-day rule. */
	visitDate: string;
	/** ICD-10-CM lookup (code set 'icd10cm'). */
	lookup?: CodeLookup;
	/** The practice's code set; default 'icd10cm'. */
	codeSet?: CodeSetId;
	/** ICD-11 lookup (code set 'icd11'). Without it, ICD-11 rows come out uncoded. */
	icd11?: Icd11Lookup;
	/** Defaults to CODING_TERMS. */
	terms?: CodingTerm[];
}

const NO_CODES = memoryLookup([]);

type Side = 'R' | 'L';
interface Hit {
	side: Side | null;
	field: string;
	text: string;
}

// ---------- matching (FIX: whole word, case-insensitive, literal) ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Term as a whole word: no letter/digit directly before or after (works for terms like "+1" or "A/C"). */
const termRe = (term: string) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(term.trim()).replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'gi');
const NEGATION = /(?<![A-Za-z0-9])(no|not|without|w\/o|neg|negative(?:\s+for)?|denies|absent|free\s+of|r\/o|rule\s+out)(?![A-Za-z0-9])/i;
const CLAUSE_END = /[.;,\n]/;

/** The clause (between , ; . or newline) that contains index i. */
function clauseAt(text: string, start: number, end: number): { before: string; whole: string } {
	let a = start;
	while (a > 0 && !CLAUSE_END.test(text[a - 1])) a--;
	let b = end;
	while (b < text.length && !CLAUSE_END.test(text[b])) b++;
	return { before: text.slice(a, start), whole: text.slice(a, b) };
}

/**
 * True when the term appears as a whole word and at least one appearance is not negated
 * ("no NVD", "negative for CSME", "r/o PVD" do not count). Exported for tests.
 */
export function hasTerm(text: string, term: string): boolean {
	return matchClauses(text, term).length > 0;
}

/** The clauses holding each non-negated appearance of the term. */
function matchClauses(text: string, term: string): string[] {
	if (!text || !term.trim()) return [];
	const out: string[] = [];
	for (const m of text.matchAll(termRe(term))) {
		const c = clauseAt(text, m.index, m.index + m[0].length);
		if (!NEGATION.test(c.before)) out.push(c.whole);
	}
	return out;
}

/** Whole-word containment, used for the specificity skip ("cicatricial ectropion" contains "ectropion"). */
const containsWord = (phrase: string, term: string) => new RegExp(termRe(term).source, 'i').test(phrase);

// ---------- fields and laterality (FIX: OD/R = right, OS/L = left) ----------

const ROOT_FIELDS = new Map<string, { od: string; os: string }>();
for (const s of EXAM_SECTIONS) for (const r of s.rows) ROOT_FIELDS.set(r.id, { od: r.od, os: r.os });

/** Laterality from a field id's prefix: OD.. or R.. (External) = right, OS.. or L.. = left. */
export function sideOf(field: string): Side | null {
	if (/^OD/.test(field)) return 'R';
	if (/^OS/.test(field)) return 'L';
	for (const { od, os } of ROOT_FIELDS.values()) {
		if (field === od) return 'R';
		if (field === os) return 'L';
	}
	return null;
}

/** The fields to read for a location root (both eyes), or the root itself when it is a single field. */
function fieldsFor(root: string): string[] {
	const pair = ROOT_FIELDS.get(root);
	return pair ? [pair.od, pair.os] : [root];
}

const EYE_WORD: Record<Side | 'B', string> = { R: 'right', L: 'left', B: 'bilateral' };
const NOT_EYE: Record<Side | 'B', string[]> = { R: ['left', 'bilateral'], L: ['right', 'bilateral'], B: ['right', 'left'] };
const eyeLabel = (sides: Set<Side | null>) =>
	sides.has('R') && sides.has('L') ? 'OU' : sides.has('R') ? 'OD' : sides.has('L') ? 'OS' : '';

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------- code resolution ----------

/**
 * Best code for one side (or both, 'B'): first with the eye word required and the other eyes
 * excluded; without an eye, or when the family has no lateral codes, without the eye word.
 */
function lateral(lookup: CodeLookup, base: CodeQuery, side: Side | 'B' | null): IcdCode | null {
	if (side) {
		const hit = lookup.best({ ...base, all: [...(base.all ?? []), EYE_WORD[side]], none: [...(base.none ?? []), ...NOT_EYE[side]] });
		if (hit || side === 'B') return hit;
	}
	return lookup.best({ ...base, none: [...(base.none ?? []), 'right', 'left', 'bilateral'] });
}

/** One code per side, or the bilateral code when both sides match and the family has one (FIX). */
function resolveSides(lookup: CodeLookup, sides: (Side | null)[], resolve: (side: Side | 'B' | null) => IcdCode | null): IcdCode[] {
	const uniq = [...new Set(sides)];
	if (uniq.includes('R') && uniq.includes('L')) {
		const both = resolve('B');
		if (both) return [both];
	}
	const out: IcdCode[] = [];
	for (const s of uniq) {
		const c = resolve(s);
		if (c && !out.some((o) => o.code === c.code)) out.push(c);
	}
	return out;
}

/** Path A (fixed code: itself if billable, else narrowed by eye + field description) or C (search). */
function resolveTerm(lookup: CodeLookup, row: CodingTerm, hits: Hit[], extraWords: string[] = []): IcdCode[] {
	const desc = FIELD_DESCRIPTIONS[row.location] ?? '';
	const descWords = desc.split(/\s+/).filter(Boolean);
	// A lid row reads one lid: never a code for "upper and lower eyelids".
	const none = row.location === 'UL' || row.location === 'LL' ? ['upper and lower'] : [];
	if (row.code) {
		const own = lookup.get(row.code);
		if (own?.billable) return [own];
		// A category (the code file lists only billable codes, so categories are absent): narrow it.
		const narrowed = resolveSides(lookup, hits.map((h) => h.side), (side) =>
			lateral(lookup, { prefix: row.code, any: [...descWords, ...(row.prefer ?? [])], none }, side)
		);
		if (narrowed.length) return narrowed;
		// Code set not loaded (or nothing under it): keep the row's OWN code (FIX: never the previous row's).
		const display = displayCode(row.code);
		return display ? [own ?? { code: display, description: '', billable: true }] : [];
	}
	// Path C (FIX): term + the field's description + laterality word.
	return resolveSides(lookup, hits.map((h) => h.side), (side) =>
		lateral(lookup, { all: [row.term, ...extraWords], any: [...descWords, ...(row.prefer ?? [])], none }, side)
	);
}

function candidate(set: CodeSetId, key: string, title: string, codes: IcdCode[], hits: Hit[], extraPlan: string[] = []): Candidate {
	const lines = codes.map((c) => c.description).filter(Boolean);
	return {
		key,
		source: 'finding',
		kind: 'finding',
		title,
		codes: codes.map((c) => c.code).join(', '),
		codeText: setCodeText(set, codes),
		description: lines.join('\n'),
		plan: [...lines, ...extraPlan].join('\n'),
		link: [...new Set(hits.map((h) => h.field))].join(','),
		location: [...new Set(hits.map((h) => h.field))].join(',')
	};
}

// ---------- DM: diabetic retinopathy (FIX: negations, 7th-character laterality, no dropped OS codes) ----------

type DmType = 'Type 1 diabetes mellitus' | 'Type 2 diabetes mellitus' | 'Other specified diabetes mellitus';

/** Diabetes type from the patient's active PMH titles and ICD-10-CM codes; null = no diabetes recorded. */
export function diabetesType(issues: EngineIssue[]): DmType | null {
	let found: DmType | null = null;
	const rank: Record<DmType, number> = { 'Type 1 diabetes mellitus': 3, 'Type 2 diabetes mellitus': 2, 'Other specified diabetes mellitus': 1 };
	for (const i of issues) {
		if (i.type !== 'PMH' || !i.active) continue;
		const codes = (i.codeSystem ?? 'icd10cm') === 'icd10cm' ? i.codes.toUpperCase() : '';
		const t = i.title;
		let ty: DmType | null = null;
		if (/(^|[^A-Z0-9])E10/.test(codes) || /\b(type\s*(1|I)\b|T1DM|IDDM|juvenile diabetes)/i.test(t)) ty = 'Type 1 diabetes mellitus';
		else if (/(^|[^A-Z0-9])E11/.test(codes) || /\b(type\s*(2|II)\b|T2DM|NIDDM)/i.test(t)) ty = 'Type 2 diabetes mellitus';
		else if (/(^|[^A-Z0-9])E(08|09|13)/.test(codes) || /\b(diabet\w*|DM)\b/i.test(t)) ty = 'Other specified diabetes mellitus';
		if (ty && (!found || rank[ty] > rank[found])) found = ty;
	}
	return found;
}

type Tier = 'proliferative' | 'severe nonproliferative' | 'moderate nonproliferative' | 'mild nonproliferative';

function fieldText(findings: Record<string, string>, root: string, side: Side): string {
	const pair = ROOT_FIELDS.get(root);
	return pair ? (findings[side === 'R' ? pair.od : pair.os] ?? '') : '';
}

/** Severity tier for one eye from disc, vessels, periphery and macula (§10.3 table). */
export function dmTier(findings: Record<string, string>, side: Side): Tier | null {
	const f = (root: string) => fieldText(findings, root, side);
	const [disc, vessels, periph, macula] = [f('DISC'), f('VESSELS'), f('PERIPH'), f('MACULA')];
	if (hasTerm(disc, 'NVD') || hasTerm(vessels, 'NVE') || hasTerm(periph, 'NVE')) return 'proliferative';
	if (hasTerm(vessels, 'PPDR') || [macula, vessels, periph].some((t) => hasTerm(t, 'IRMA'))) return 'severe nonproliferative';
	const bdr = [macula, vessels, periph].flatMap((t) => matchClauses(t, 'BDR'));
	if (!bdr.length) return null;
	return bdr.some((c) => /(?<![A-Za-z0-9])(trace|tr|mild)(?![A-Za-z0-9])|\+1|1\+/i.test(c)) ? 'mild nonproliferative' : 'moderate nonproliferative';
}

/** "CSME" (not negated) in the macula and the macula not called flat. */
function hasCsme(findings: Record<string, string>, side: Side): boolean {
	const m = fieldText(findings, 'MACULA', side);
	return hasTerm(m, 'CSME') && !hasTerm(m, 'flat');
}

function runDm(input: EngineInput & { lookup: CodeLookup }, sides: Set<Side>): Candidate | null {
	const type = diabetesType(input.issues);
	if (!type) return null;
	const per = new Map<Side, { tier: Tier; edema: string }>();
	for (const s of sides) {
		const tier = dmTier(input.findings, s);
		if (tier) per.set(s, { tier, edema: hasCsme(input.findings, s) ? 'with macular edema' : 'without macular edema' });
	}
	if (!per.size) return null;
	const query = (p: { tier: Tier; edema: string }): CodeQuery => ({ all: [type, `${p.tier} diabetic retinopathy ${p.edema}`] });
	const r = per.get('R');
	const l = per.get('L');
	let codes: IcdCode[] = [];
	if (r && l && r.tier === l.tier && r.edema === l.edema) {
		const both = lateral(input.lookup, query(r), 'B');
		if (both) codes = [both];
	}
	if (!codes.length) {
		for (const s of ['R', 'L'] as const) {
			const p = per.get(s);
			const c = p ? lateral(input.lookup, query(p), s) : null;
			if (c) codes.push(c);
		}
	}
	const hits: Hit[] = (['R', 'L'] as const).filter((s) => per.has(s)).map((s) => ({ side: s, field: s === 'R' ? 'ODMACULA' : 'OSMACULA', text: '' }));
	const title = `Diabetic retinopathy ${eyeLabel(new Set(per.keys()))}`.trim();
	return candidate('icd10cm', 'finding:DM', title, codes, hits);
}

// ---------- ICD-11 (D44): WHO titles + laterality extension, never the terms' ICD-10-CM codes ----------

const sideKey = (sides: (Side | null)[]): LateralitySide | null =>
	sides.includes('R') && sides.includes('L') ? 'B' : sides.includes('R') ? 'R' : sides.includes('L') ? 'L' : null;

/** The best ICD-11 code for these words, with the eye(s) as a laterality extension when the set has it. */
function icd11Code(lookup: Icd11Lookup | undefined, query: Icd11Query, sides: (Side | null)[]): IcdCode[] {
	const hit = lookup ? bestIcd11(lookup, query) : null;
	if (!lookup || !hit) return [];
	const side = sideKey(sides);
	const ext = side ? lookup.get(LATERALITY_EXT[side]) : null;
	if (!side || !ext || ext.chapter !== 'X') return [{ code: hit.code, description: hit.title, billable: true }];
	return [{ code: withLaterality(hit.code, side), description: `${hit.title}; ${ext.title}`, billable: true }];
}

/** Search words for a term: its label when it has one (abbreviations), else the term itself. */
const termWords = (row: CodingTerm, extra: string[] = []) => [row.label ?? row.term, ...extra];

function icd11ForRow(input: EngineInput, row: CodingTerm, hits: Hit[], extra: string[] = []): IcdCode[] {
	return icd11Code(input.icd11, { words: termWords(row, extra), context: [FIELD_DESCRIPTIONS[row.location] ?? ''] }, hits.map((h) => h.side));
}

/** ICD-11: any active PMH whose title says diabetes, or whose ICD-11 code's WHO title does. */
function hasDiabetes11(issues: EngineIssue[], lookup: Icd11Lookup | undefined): boolean {
	if (diabetesType(issues.map((i) => ({ ...i, codeSystem: 'icd11' as const })))) return true;
	if (!lookup) return false;
	return issues.some(
		(i) =>
			i.type === 'PMH' &&
			i.active &&
			i.codeSystem === 'icd11' &&
			i.codes.split(/[;,\s]+/).some((t) => {
				const n = t ? icd11Normalize(t) : null;
				return !!n && /diabetes mellitus/i.test(lookup.get(n.split('&')[0])?.title ?? '');
			})
	);
}

/** Diabetic retinopathy for ICD-11: proliferative or not, per eye; one code when both eyes agree. */
function runDm11(input: EngineInput, sides: Set<Side>): Candidate | null {
	if (!hasDiabetes11(input.issues, input.icd11)) return null;
	const per = new Map<Side, string>();
	for (const s of sides) {
		const tier = dmTier(input.findings, s);
		if (tier) per.set(s, tier === 'proliferative' ? 'proliferative diabetic retinopathy' : 'nonproliferative diabetic retinopathy');
	}
	if (!per.size) return null;
	const r = per.get('R');
	const l = per.get('L');
	const codes: IcdCode[] =
		r && l && r === l
			? icd11Code(input.icd11, { words: [r] }, ['R', 'L'])
			: (['R', 'L'] as const).flatMap((s) => (per.get(s) ? icd11Code(input.icd11, { words: [per.get(s)!] }, [s]) : []));
	const hits: Hit[] = (['R', 'L'] as const).filter((s) => per.has(s)).map((s) => ({ side: s, field: s === 'R' ? 'ODMACULA' : 'OSMACULA', text: '' }));
	return candidate('icd11', 'finding:DM', `Diabetic retinopathy ${eyeLabel(new Set(per.keys()))}`.trim(), codes, hits);
}

// ---------- RVO (FIX: + H35.81 retinal edema when CSME is present) ----------

function runRvo(input: EngineInput & { lookup: CodeLookup }, row: CodingTerm, hits: Hit[]): IcdCode[] {
	const sides = hits.map((h) => h.side);
	const edemaSides = new Set(sides.filter((s): s is Side => !!s && hasCsme(input.findings, s)));
	const variant = (side: Side | 'B' | null) =>
		side === 'B' ? (edemaSides.size === 2 ? 'with macular edema' : edemaSides.size === 0 ? 'stable' : null) : side && edemaSides.has(side) ? 'with macular edema' : 'stable';
	const codes = resolveSides(input.lookup, sides, (side) => {
		const v = variant(side);
		if (v === null) return null; // eyes differ: code each eye
		return lateral(input.lookup, { prefix: row.code, all: [v] }, side);
	});
	if (edemaSides.size) {
		const edema = input.lookup.get('H35.81') ?? { code: 'H35.81', description: 'Retinal edema', billable: true };
		codes.push(edema);
	}
	return codes;
}

// ---------- IOL: CME within 90 days of the most recent same-eye IOL surgery (FIX) ----------

const IOL_SURGERY = /(?<![A-Za-z0-9])(IOL|PCIOL|ACIOL|phaco\w*|cataract\s+(extraction|surgery)|CE\/IOL|lens\s+implant\w*|CEIOL)(?![A-Za-z0-9])/i;

function surgerySides(text: string): Set<Side> {
	const out = new Set<Side>();
	if (/(?<![A-Za-z0-9])(OU|both|bilateral)(?![A-Za-z0-9])/i.test(text)) return new Set<Side>(['R', 'L']);
	if (/(?<![A-Za-z0-9])(OD|right|RE)(?![A-Za-z0-9])/i.test(text)) out.add('R');
	if (/(?<![A-Za-z0-9])(OS|left|LE)(?![A-Za-z0-9])/i.test(text)) out.add('L');
	return out;
}

const dayNumber = (iso: string) => {
	const t = Date.parse(`${iso}T00:00:00Z`);
	return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
};

/** The most recent eye-surgery issue (POS) with an IOL, in this eye, 0-90 days before the visit. */
export function recentIolSurgery(issues: EngineIssue[], side: Side, visitDate: string): EngineIssue | null {
	const visit = dayNumber(visitDate);
	if (visit === null) return null;
	let best: { issue: EngineIssue; day: number } | null = null;
	for (const i of issues) {
		if (i.type !== 'POS' || !IOL_SURGERY.test(`${i.title} ${i.comments}`)) continue;
		if (!surgerySides(`${i.title} ${i.comments}`).has(side)) continue;
		const day = dayNumber(i.begin);
		if (day === null || day > visit || visit - day > 90) continue;
		if (!best || day > best.day) best = { issue: i, day };
	}
	return best?.issue ?? null;
}

// ---------- main ----------

/**
 * Runs every term over its field, in list order. Returns term -> candidate items (§10.3 output).
 * A term is skipped in a field when an earlier hit in that field already contains it.
 */
export function runEngine(input: EngineInput): Map<string, Candidate[]> {
	const terms = input.terms ?? CODING_TERMS;
	const set: CodeSetId = input.codeSet ?? 'icd10cm';
	const icd11 = set === 'icd11';
	const lookup = input.lookup ?? NO_CODES;
	const out = new Map<string, Candidate[]>();
	const hitsByField = new Map<string, string[]>();
	const dmSides = new Set<Side>();
	let dmKey: string | null = null;
	const record = (hits: Hit[], term: string) => {
		for (const h of hits) hitsByField.set(h.field, [...(hitsByField.get(h.field) ?? []), term]);
	};
	const push = (key: string, c: Candidate) => out.set(key, [...(out.get(key) ?? []), c]);

	for (const row of terms) {
		const hits: Hit[] = [];
		for (const field of fieldsFor(row.location)) {
			const text = input.findings[field] ?? '';
			if (!text || !hasTerm(text, row.term)) continue;
			if ((hitsByField.get(field) ?? []).some((earlier) => containsWord(earlier, row.term))) continue;
			hits.push({ side: sideOf(field), field, text });
		}
		if (!hits.length) continue;
		const options = row.options ?? [];
		const title = (sides: (Side | null)[]) => `${row.label ?? capitalise(row.term)} ${eyeLabel(new Set(sides))}`.trim();
		const key = row.label ?? capitalise(row.term);

		if (options.includes('DM')) {
			for (const h of hits) if (h.side) dmSides.add(h.side);
			dmKey ??= 'Diabetic retinopathy';
			if (!out.has(dmKey)) out.set(dmKey, []); // keeps list position; filled after the scan
			record(hits, row.term);
			continue;
		}
		if (options.includes('IOL')) {
			const matched: { hit: Hit; surgery: EngineIssue }[] = [];
			for (const h of hits) {
				const s = h.side ? recentIolSurgery(input.issues, h.side, input.visitDate) : null;
				if (s) matched.push({ hit: h, surgery: s });
			}
			if (!matched.length) continue; // no qualifying surgery: later rows may still code this text
			const mh = matched.map((m) => m.hit);
			const codes = icd11
				? icd11ForRow(input, row, mh)
				: resolveSides(lookup, mh.map((h) => h.side), (side) => lateral(lookup, { prefix: 'H59.03' }, side));
			const notes = matched.map((m) => `After ${m.surgery.title}${m.surgery.begin ? ` on ${m.surgery.begin}` : ''}`);
			push(key, candidate(set, `finding:${row.term}:IOL`, title(mh.map((h) => h.side)), codes, mh, [...new Set(notes)]));
			record(mh, row.term);
			continue;
		}
		if (options.includes('RVO')) {
			const codes = icd11 ? icd11ForRow(input, row, hits) : runRvo({ ...input, lookup }, row, hits);
			push(key, candidate(set, `finding:${row.term}`, title(hits.map((h) => h.side)), codes, hits));
			record(hits, row.term);
			continue;
		}
		// Any other option word joins the search (path B, generic); otherwise path A or C.
		const extra = options.filter((o) => o !== 'DM' && o !== 'RVO' && o !== 'IOL');
		const codes = icd11 ? icd11ForRow(input, row, hits, extra) : resolveTerm(lookup, extra.length ? { ...row, code: undefined } : row, hits, extra);
		push(key, candidate(set, `finding:${row.location}:${row.term}`, title(hits.map((h) => h.side)), codes, hits));
		record(hits, row.term);
	}

	if (dmKey) {
		const dm = icd11 ? runDm11(input, dmSides) : runDm({ ...input, lookup }, dmSides);
		if (dm) out.set(dmKey, [dm]);
		else out.delete(dmKey);
	}
	return out;
}

/** The engine's items as one list, merging rows that came out identical (same title and codes). */
export function findingCandidates(input: EngineInput): Candidate[] {
	const list: Candidate[] = [];
	for (const items of runEngine(input).values()) {
		for (const c of items) {
			const same = list.find((o) => o.title === c.title && o.codes === c.codes);
			if (same) {
				same.link = [...new Set([...same.link.split(','), ...c.link.split(',')])].filter(Boolean).join(',');
				same.location = same.link;
			} else list.push({ ...c });
		}
	}
	return list;
}

// ---------- issues (POH / POS / PMH) ----------

/** Splits an issue's codes ("E11.9; ICD10:I10") into valid display codes with descriptions. */
export function issueCodes(lookup: CodeLookup, raw: string): IcdCode[] {
	const out: IcdCode[] = [];
	for (const part of raw.split(/[;,\s]+/)) {
		const d = part ? displayCode(part) : null;
		if (!d || out.some((o) => o.code === d)) continue;
		out.push(lookup.get(d) ?? { code: d, description: '', billable: true });
	}
	return out;
}

/** An issue's ICD-11 codes that the code set accepts, with WHO titles (others are left out). */
export function issueCodes11(lookup: Icd11Lookup, raw: string): IcdCode[] {
	const out: IcdCode[] = [];
	for (const part of raw.replace(/\s*&\s*/g, '&').split(/[;,\s]+/)) {
		const r = part ? resolveIcd11(lookup.get, part) : null;
		if (!r || 'error' in r || out.some((o) => o.code === r.code)) continue;
		out.push({ code: r.code, description: r.description, billable: true });
	}
	return out;
}

/**
 * Builder rows from the patient's issues: POH + POS (eye) and PMH (general), active only (surgeries always).
 * An issue's codes come along only when they are in the practice's current code set (no crosswalk):
 * an issue coded in the other set becomes an uncoded row with its title.
 */
export function issueCandidates(
	lookup: CodeLookup | undefined,
	issues: EngineIssue[],
	opts: { codeSet?: CodeSetId; icd11?: Icd11Lookup } = {}
): { poh: Candidate[]; pmh: Candidate[] } {
	const set = opts.codeSet ?? 'icd10cm';
	const make = (i: EngineIssue, source: 'poh' | 'pmh'): Candidate => {
		const same = (i.codeSystem ?? 'icd10cm') === set;
		const codes = !same ? [] : set === 'icd11' ? (opts.icd11 ? issueCodes11(opts.icd11, i.codes) : []) : issueCodes(lookup ?? NO_CODES, i.codes);
		return {
			key: `issue:${i.id}`,
			source,
			kind: 'issue',
			title: i.title,
			codes: codes.map((c) => c.code).join(', '),
			codeText: setCodeText(set, codes),
			description: codes.map((c) => c.description).filter(Boolean).join('\n'),
			plan: i.comments, // §10.2: an issue item's plan starts as the issue's comments
			link: `issue:${i.id}`,
			location: i.type
		};
	};
	return {
		poh: issues.filter((i) => (i.type === 'POH' && i.active) || i.type === 'POS').map((i) => make(i, 'poh')),
		pmh: issues.filter((i) => i.type === 'PMH' && i.active).map((i) => make(i, 'pmh'))
	};
}
