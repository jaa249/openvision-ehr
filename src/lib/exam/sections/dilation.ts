// dilation section module: dilating drops, time, risks discussed (eye_mag form_eye_postseg columns
// DIL_RISKS, DIL_MEDS, ATROPINE, CYCLOMYDRIL, TROPICAMIDE, CYCLOGYL, NEO25, plus our DIL_TIME and NEO10).
// Shown in the IOP / pupils panel next to post-dilation IOP; used by coding (§11.1 exam evidence).
// Wired into catalog.ts (FIELDS, SEED_DEFAULTS), shorthand/codes.ts (ALIASES) and exam/report.ts (before Retina).
// Rule: import only TYPES from catalog.ts / report.ts here (they import values from this file).
//
// Spec: docs/spec/BEHAVIOR.md §1.6 (dilation box), §13.2 item 10 ("Dilation Time"), §16.5 / B31 (one clock format).
// Deviations from FIELDS.md, both because the original screen has them but the table lists no column:
// - DIL_TIME: the dilation time (the original stamps a time when a drop is checked).
// - NEO10: phenylephrine 10% (the original's drop list has "Neo 10%" beside "Neo 2.5%").
import type { FieldDef, FieldText } from '../catalog.ts';
import type { ReportSection } from '../report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import { english, type Translate } from '#lib/coding/english.ts';

export interface DilationDrop {
	/** Field id; the stored value is the strength given ('' = not given). */
	id: string;
	/** Name printed in the report and on the toggle. */
	name: string;
	/** Strengths offered, the first is used when the toggle is switched on. */
	strengths: string[];
}

/** The drops on the toggle row, in the order most clinics reach for them. */
export const DILATION_DROPS: DilationDrop[] = [
	{ id: 'TROPICAMIDE', name: 'Tropicamide', strengths: ['1%', '0.5%'] },
	{ id: 'NEO25', name: 'Phenylephrine', strengths: ['2.5%'] },
	{ id: 'NEO10', name: 'Phenylephrine', strengths: ['10%'] },
	{ id: 'CYCLOGYL', name: 'Cyclopentolate', strengths: ['1%', '0.5%', '2%'] },
	{ id: 'CYCLOMYDRIL', name: 'Cyclopentolate/phenylephrine', strengths: ['0.2%/1%'] },
	{ id: 'ATROPINE', name: 'Atropine', strengths: ['1%', '0.5%'] }
];
/** Screen names of DILATION_DROPS by id (D48); the report prints the English `name`. */
export const DROP_NAME_KEY: Record<string, MessageKey> = {
	TROPICAMIDE: 'sections.dropTropicamide',
	NEO25: 'sections.dropPhenylephrine',
	NEO10: 'sections.dropPhenylephrine',
	CYCLOGYL: 'sections.dropCyclopentolate',
	CYCLOMYDRIL: 'sections.dropCyclomydril',
	ATROPINE: 'sections.dropAtropine'
};
export const DROP_IDS = DILATION_DROPS.map((d) => d.id);

/** "Other drops" free text (eye_mag's DIL_MEDS). */
export const DIL_MEDS = 'DIL_MEDS';
export const DIL_TIME = 'DIL_TIME';
/** Checkbox: dilation risks discussed with the patient. Stored 'on' / ''. */
export const DIL_RISKS = 'DIL_RISKS';

type Spec = [id: string, label: string, maxLength: number];

// Column sizes from FIELDS.md: drops varchar(25), DIL_RISKS char(2), DIL_MEDS mediumtext (capped like other text).
const specs: Spec[] = [
	...DILATION_DROPS.map((d): Spec => [d.id, `Dilation drop: ${d.name} ${d.strengths.join(' / ')}`, 25]),
	[DIL_MEDS, 'Dilation: other drops', 4000],
	[DIL_TIME, 'Dilation time', 10],
	[DIL_RISKS, 'Dilation risks discussed', 2]
];

export const DILATION_FIELDS: FieldDef[] = specs.map(([id, label, maxLength]) => ({
	id,
	section: 'IOP',
	row: 'DILATION',
	eye: 'OU',
	label,
	maxLength,
	expand: false
}));

/** Screen labels of DILATION_FIELDS (D48), same English as the labels above; strengths stay as written. */
export const DILATION_FIELD_TEXT: Record<string, FieldText> = Object.fromEntries([
	...DILATION_DROPS.map((d): [string, FieldText] => [d.id, (t) => t('sections.fieldDilationDrop', { name: t(DROP_NAME_KEY[d.id]), strengths: d.strengths.join(' / ') })]),
	[DIL_MEDS, (t) => t('sections.fieldDilationOther')],
	[DIL_TIME, (t) => t('sections.fieldDilationTime')],
	[DIL_RISKS, (t) => t('sections.fieldDilationRisks')]
] as [string, FieldText][]);

/**
 * Shorthand codes. SHORTHAND.md lists no dilation codes, so these are ours; the field ids work too
 * (TROPICAMIDE:1%). Each writes the strength typed, e.g. TROP:1% or NEO:2.5%.
 */
export const DILATION_ALIASES: Record<string, string[]> = {
	TROP: ['TROPICAMIDE'],
	NEO: ['NEO25'],
	CYCLO: ['CYCLOGYL'],
	CYCLOPENT: ['CYCLOGYL'],
	CYCLOMYD: ['CYCLOMYDRIL'],
	ATRO: ['ATROPINE'],
	DIL: [DIL_MEDS],
	DILTIME: [DIL_TIME],
	DILRISK: [DIL_RISKS],
	DILRISKS: [DIL_RISKS]
};

/** Never defaulted: dilating is a decision for this visit, not a "normal" value. */
export const DILATION_DEFAULTS: Record<string, string> = {};

const val = (f: Findings, id: string) => f[id]?.value?.trim() ?? '';
/** A drop counts as given unless its box is empty or holds an "off" value from an import. */
const given = (v: string) => v !== '' && !/^(0|off|no)$/i.test(v);

export function dropGiven(findings: Findings, id: string): boolean {
	return given(val(findings, id));
}

export function risksDiscussed(findings: Findings): boolean {
	return given(val(findings, DIL_RISKS));
}

/** Dilation documented (any drop checked, or drops text) — evidence for a comprehensive visit (§11.1). */
export function isDilated(findings: Findings): boolean {
	return DROP_IDS.some((id) => dropGiven(findings, id)) || val(findings, DIL_MEDS) !== '';
}

/**
 * "tropicamide 1%, phenylephrine 2.5%, other text" — the drops in toggle order, lower-case names
 * (in `t`'s language, D48; the "other drops" text prints as typed).
 */
export function dilationDrops(findings: Findings, t: Translate = english): string[] {
	const out: string[] = [];
	for (const d of DILATION_DROPS) {
		const v = val(findings, d.id);
		if (!given(v)) continue;
		// A plain "on"/"yes"/"1" from an import means "given" with no strength recorded.
		const strength = /^(on|yes|1|x)$/i.test(v) ? '' : ` ${v}`;
		out.push(`${t(DROP_NAME_KEY[d.id]).toLowerCase()}${strength}`);
	}
	if (val(findings, DIL_MEDS)) out.push(val(findings, DIL_MEDS));
	return out;
}

/** "Dilated: tropicamide 1%, phenylephrine 2.5% at 2:10 PM" (§13.2 item 10 "Dilation Time"). */
export function dilationReport(findings: Findings, t: Translate = english): ReportSection[] {
	if (!isDilated(findings)) return [];
	const time = val(findings, DIL_TIME);
	const drops = dilationDrops(findings, t).join(', ');
	const risks = risksDiscussed(findings) ? ` ${t('report.risksDiscussed')}` : '';
	const summary = (time ? t('report.dilatedAt', { drops, time }) : t('report.dilated', { drops })) + risks;
	return [{ title: 'Dilation', titleText: { key: 'sections.dilTitle' }, rows: [], comments: '', summary }];
}
