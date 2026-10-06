// Per-user layout prefs (spec §1.7 with FIX): the whitelist of keys, their types and the
// new-user defaults. Shared by the server (validation, storage) and the browser helper.
// Booleans are real booleans in the API and '1'/'0' in the database, never translated words.

interface BoolDef {
	type: 'boolean';
	default: boolean;
	label: string;
}
interface EnumDef<V extends string = string> {
	type: 'enum';
	values: readonly V[];
	default: V;
	label: string;
}

export const EXAM_MODES = ['text', 'qp', 'priors', 'draw'] as const;
export type ExamMode = (typeof EXAM_MODES)[number];
export const EXAM_MODE_LABEL: Record<ExamMode, string> = {
	text: 'Text',
	qp: 'Quick picks',
	priors: 'Prior visits',
	draw: 'Drawing'
};
/** Must match COVER_ZONES in #lib/exam/sections/neuro.ts (checked by a test). */
export const COVER_ZONE_KEYS = ['SCDIST', 'CCDIST', 'SCNEAR', 'CCNEAR'] as const;

const bool = (def: boolean, label: string): BoolDef => ({ type: 'boolean', default: def, label });
const oneOf = <V extends string>(values: readonly V[], def: V, label: string): EnumDef<V> => ({ type: 'enum', values, default: def, label });

/** New-user defaults follow the §1.7 FIX: QP mode, glasses panel on, slide-out on, tooltips on, cover test "cc distance", retina grid wide. */
export const PREF_DEFS = {
	'exam.mode': oneOf(EXAM_MODES, 'qp', 'Default exam helper panel'),
	cylinder: oneOf(['+', '-'] as const, '+', 'Cylinder convention'),
	'refraction.W': bool(true, 'Glasses panel shown'),
	'refraction.MR': bool(true, 'Manifest panel shown'),
	'refraction.AR': bool(true, 'Autorefraction panel shown'),
	'refraction.CTL': bool(false, 'Contact lens panel shown'),
	'refraction.wide': bool(false, 'Rx details shown'),
	'cover.open': bool(true, 'Cover test open'),
	'cover.zone': oneOf(COVER_ZONE_KEYS, 'CCDIST', 'Cover test tab'),
	tooltips: bool(true, 'Tooltips on'),
	'pmsfh.open': bool(true, 'History slide-out open'),
	'retina.wide': bool(true, 'Fundus text grid wide')
} as const;

export type PrefKey = keyof typeof PREF_DEFS;
type DefOf<K extends PrefKey> = (typeof PREF_DEFS)[K];
export type PrefValue<K extends PrefKey> = DefOf<K> extends { type: 'boolean' } ? boolean : DefOf<K> extends EnumDef<infer V> ? V : never;
export type Prefs = { [K in PrefKey]: PrefValue<K> };

export const PREF_KEYS = Object.keys(PREF_DEFS) as PrefKey[];

export function isPrefKey(k: unknown): k is PrefKey {
	return typeof k === 'string' && Object.hasOwn(PREF_DEFS, k);
}

export function defaultPrefs(): Prefs {
	return Object.fromEntries(PREF_KEYS.map((k) => [k, PREF_DEFS[k].default])) as Prefs;
}

/** The value if it has the right type for the key, else undefined. */
export function checkPref<K extends PrefKey>(key: K, value: unknown): PrefValue<K> | undefined {
	const def: BoolDef | EnumDef = PREF_DEFS[key];
	if (def.type === 'boolean') return typeof value === 'boolean' ? (value as PrefValue<K>) : undefined;
	return typeof value === 'string' && def.values.includes(value) ? (value as PrefValue<K>) : undefined;
}

/** Keeps only whitelisted keys with valid values (for the browser fallback copy). */
export function sanitizePrefs(input: unknown): Partial<Prefs> {
	const out: Partial<Record<PrefKey, unknown>> = {};
	if (!input || typeof input !== 'object') return {};
	for (const [k, v] of Object.entries(input)) {
		if (!isPrefKey(k)) continue;
		const ok = checkPref(k, v);
		if (ok !== undefined) out[k] = ok;
	}
	return out as Partial<Prefs>;
}
