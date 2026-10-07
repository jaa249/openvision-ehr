// Diagnosis code sets (decision D44): the practice chooses ICD-10-CM (US) or WHO ICD-11 MMS.
// Shared by the server, the engine and the client (no I/O here). Callers ask this module for the
// tag, label and code shape of a set instead of assuming ICD-10-CM.
//
// WHO licence (CC BY-ND 3.0 IGO): there is NO mapping between ICD-10(-CM) and ICD-11 anywhere in
// OpenVision, and no table pairing our clinical terms with ICD-11 codes. ICD-11 suggestions come
// from searching WHO's own titles. The only ICD-11 codes written here are the laterality
// extension codes (verified in the 2026-01 release).
import { displayCode } from '#lib/plan/codes.ts';

export type CodeSetId = 'icd10cm' | 'icd11';
export const CODE_SET_IDS: readonly CodeSetId[] = ['icd10cm', 'icd11'];

export interface CodeSetInfo {
	id: CodeSetId;
	/** Shown in Settings and the code finder. */
	label: string;
	/** Short name for headings, e.g. "Diagnoses (ICD-11)". */
	short: string;
	/** Prefix in stored code text: "ICD10:H40.11 (...)" / "ICD11:9C61.0Z (...)". */
	tag: 'ICD10' | 'ICD11';
	/** FHIR CodeSystem URI. */
	system: string;
}

export const CODE_SETS: Record<CodeSetId, CodeSetInfo> = {
	icd10cm: { id: 'icd10cm', label: 'ICD-10-CM (United States)', short: 'ICD-10-CM', tag: 'ICD10', system: 'http://hl7.org/fhir/sid/icd-10-cm' },
	icd11: { id: 'icd11', label: 'ICD-11 (WHO)', short: 'ICD-11', tag: 'ICD11', system: 'http://id.who.int/icd/release/11/mms' }
};

/** WHO's required citation, shown with the code finder and Settings while ICD-11 is used. */
export const ICD11_CITATION =
	'International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019 https://icd.who.int';
export const ICD11_LICENCE = 'CC BY-ND 3.0 IGO';
export const ICD11_RELEASE = '2026-01';

export const isCodeSetId = (v: unknown): v is CodeSetId => v === 'icd10cm' || v === 'icd11';
export const codeSetLabel = (id: CodeSetId) => CODE_SETS[id].label;
export const codeTag = (id: CodeSetId) => CODE_SETS[id].tag;

// ---------- ICD-11 code shapes (derived from the 2026-01 file; icd11.test.ts checks every Code) ----------

/** ICD-11 never uses the letters I and O in codes. */
const C = '[0-9A-HJ-NP-Z]';
const L = '[A-HJ-NP-Z]';
/** Stem code: 4 characters (2nd a letter, 3rd a digit), then optionally "." and 1-2 more, e.g. 9C61.0Z, 1A00. */
export const ICD11_STEM_RE = new RegExp(`^${C}${L}[0-9]${C}(?:\\.${C}{1,2})?$`);
/** Extension code (chapter X): X, a letter, a digit, 1-3 more, e.g. XK9J, XA0060. Never has a dot. */
export const ICD11_EXT_RE = new RegExp(`^X${L}[0-9]${C}{1,3}$`);
/** A stem with optional "&extension" parts (postcoordination), e.g. 9C61.0Z&XK9J. */
export const ICD11_CODE_RE = new RegExp(`^${C}${L}[0-9]${C}(?:\\.${C}{1,2})?(?:&X${L}[0-9]${C}{1,3})*$`);
/** ICD-10-CM shape (display form). */
export const ICD10_CODE_RE = /^[A-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/;

/** Laterality extension codes (ICD-11 chapter X, 2026-01): the eye goes after the stem with "&". */
export const LATERALITY_EXT = { R: 'XK9K', L: 'XK8G', B: 'XK9J' } as const;
export type LateralitySide = keyof typeof LATERALITY_EXT;
const LATERALITY_CODES: string[] = Object.values(LATERALITY_EXT);

/**
 * "9c61.0z & xk9j", "ICD11: 9C610Z&XK9J" -> "9C61.0Z&XK9J"; null when it is not shaped like an ICD-11
 * code. A stem typed without its dot gets one after the 4th character.
 */
export function icd11Normalize(raw: string): string | null {
	const s = raw.trim().toUpperCase().replace(/^ICD-?11\s*:?\s*/, '').replace(/\s*&\s*/g, '&');
	if (!s) return null;
	const [stemRaw, ...exts] = s.split('&');
	let stem = stemRaw;
	if (!stem.includes('.') && stem.length > 4) stem = `${stem.slice(0, 4)}.${stem.slice(4)}`;
	if (!ICD11_STEM_RE.test(stem) || !exts.every((e) => ICD11_EXT_RE.test(e))) return null;
	return [stem, ...exts].join('&');
}

/** "9C61.0Z&XK9J" -> { stem: "9C61.0Z", extensions: ["XK9J"] }. Expects a normalised code. */
export function icd11Parts(code: string): { stem: string; extensions: string[] } {
	const [stem, ...extensions] = code.split('&');
	return { stem, extensions };
}

/** Sets the eye of an ICD-11 code: replaces any laterality extension with this side's (null = none). */
export function withLaterality(code: string, side: LateralitySide | null): string {
	const { stem, extensions } = icd11Parts(code);
	const rest = extensions.filter((e) => !LATERALITY_CODES.includes(e));
	return [stem, ...rest, ...(side ? [LATERALITY_EXT[side]] : [])].join('&');
}

/** Normalised code for a set, or null when the text is not shaped like one of its codes. */
export function normalizeCode(set: CodeSetId, raw: string): string | null {
	return set === 'icd11' ? icd11Normalize(raw) : displayCode(raw);
}

/** Which set a stored code belongs to, by shape (the shapes do not overlap: ICD-11's 2nd character is a letter). */
export function codeSetOfCode(code: string): CodeSetId | null {
	const c = code.trim().toUpperCase();
	if (ICD10_CODE_RE.test(c)) return 'icd10cm';
	if (ICD11_CODE_RE.test(c)) return 'icd11';
	return null;
}

/** A diagnosis code of either set, as listed in the code summary. */
export const isDxCode = (code: string) => codeSetOfCode(code) !== null;

// ---------- code text ("TAG:CODE (description); ...") ----------

/** "ICD10:CODE (description)" for each code, "; "-separated (spec §10.3 code text); the tag follows the set. */
export function codeTextFor(set: CodeSetId, codes: { code: string; description: string }[]): string {
	const tag = codeTag(set);
	return codes.map((c) => (c.description ? `${tag}:${c.code} (${c.description})` : `${tag}:${c.code}`)).join('; ');
}

/** Splits stored code text into codes and descriptions (ICD-11 descriptions may themselves contain "; "). */
export function splitCodeText(text: string): { tag: string; code: string; description: string }[] {
	if (!text) return [];
	return text
		.split(/; (?=ICD1[01]:)/)
		.map((part) => /^(ICD1[01]):(\S+)(?: \(([\s\S]*)\))?$/.exec(part))
		.filter((m): m is RegExpExecArray => !!m)
		.map((m) => ({ tag: m[1], code: m[2], description: m[3] ?? '' }));
}

/** Code text for paper: the tags go ("ICD11:9C61.0Z (...)" -> "9C61.0Z (...)"). */
export function stripCodeTags(text: string): string {
	return text.replace(/(^|[\s;(])ICD-?1[01](?:-CM)?:\s*/gi, '$1');
}

// ---------- spelling ----------

/** US -> British spellings: WHO titles use British English ("haemorrhage", "oedema"). Generic, not per term. */
const SPELLINGS: [string, string][] = [
	['hem', 'haem'],
	['edema', 'oedema'],
	['esthe', 'aesthe'],
	['nevus', 'naevus'],
	['nevi', 'naevi'],
	['ischem', 'ischaem'],
	['pediatric', 'paediatric'],
	['leukem', 'leukaem'],
	['anemi', 'anaemi'],
	['color', 'colour'],
	['tumor', 'tumour'],
	['esophag', 'oesophag'],
	['estrogen', 'oestrogen']
];

/** The word and its British spellings (lower case). */
export function spellingVariants(word: string): string[] {
	const w = word.toLowerCase();
	const out = new Set([w]);
	for (const [us, uk] of SPELLINGS) if (w.includes(us) && !w.includes(uk)) out.add(w.replace(us, uk));
	return [...out];
}

/**
 * The set name(s) of a list of codes, for a column or section heading: "ICD-10-CM", "ICD-11" or both.
 * `list` joins two names (a screen passes the translator's list(), D48); English " and " by default.
 */
export function codeSetsShort(codes: string[], list: (items: string[]) => string = (items) => items.join(' and ')): string {
	const sets = CODE_SET_IDS.filter((id) => codes.some((c) => codeSetOfCode(c) === id));
	return sets.length ? list(sets.map((id) => CODE_SETS[id].short)) : 'ICD';
}

/** One code finder result (GET /api/codes/dx). */
export interface DxCode {
	code: string;
	/** ICD-10-CM description or WHO ICD-11 title. */
	description: string;
	/** ICD-11: WHO linearization URI. */
	uri?: string;
	/** Can be saved as is (ICD-10-CM billable / ICD-11 leaf); a category needs a more specific code. */
	leaf: boolean;
	/** ICD-11 (D50): the language of `description` when it is WHO's title in another language; absent = English. */
	titleLang?: string;
}

export interface DxSearchResult {
	system: CodeSetId;
	codes: DxCode[];
	/** The practice's code set is not downloaded yet (D49): no codes, and the finder says so. */
	notLoaded?: boolean;
	/**
	 * ICD-11 (D50): WHO's titles in the user's interface language are loaded and searched too (e.g. "es");
	 * absent when only English is searched.
	 */
	lang?: string;
}
