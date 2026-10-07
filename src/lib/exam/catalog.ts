// Exam field catalog. Field ids follow eye_mag's names (docs/spec/FIELDS.md) so
// shorthand users can keep typing the codes they already know.

import { WORKUP_DEFAULTS, WORKUP_FIELDS } from './sections/workup.ts';
import { REFRACTION_DEFAULTS, REFRACTION_FIELDS } from './sections/refraction.ts';
import { HISTORY_DEFAULTS, HISTORY_FIELDS } from './sections/history.ts';
import { NEURO_DEFAULTS, NEURO_FIELDS } from './sections/neuro.ts';
import { DILATION_DEFAULTS, DILATION_FIELDS } from './sections/dilation.ts';
import { GLAUCOMA_DEFAULTS, GLAUCOMA_FIELDS } from './sections/glaucoma.ts';

export type Eye = 'OD' | 'OS' | 'OU';
export type SectionId =
	| 'HPI'
	| 'ACUITY'
	| 'REFRACTION'
	| 'IOP'
	| 'EXT'
	| 'ANTSEG'
	| 'RETINA'
	| 'NEURO'
	| 'IMPPLAN'
	| 'CODING';

export interface Section {
	id: SectionId;
	key: string; // keyboard shortcut (1-0)
	label: string;
	available: boolean; // built in this release
}

export const SECTIONS: Section[] = [
	{ id: 'HPI', key: '1', label: 'HPI', available: true },
	{ id: 'ACUITY', key: '2', label: 'Vision', available: true },
	{ id: 'REFRACTION', key: '3', label: 'Refraction', available: true },
	{ id: 'IOP', key: '4', label: 'IOP / pupils', available: true },
	{ id: 'EXT', key: '5', label: 'External', available: true },
	{ id: 'ANTSEG', key: '6', label: 'Slit lamp', available: true },
	{ id: 'RETINA', key: '7', label: 'Fundus', available: true },
	{ id: 'NEURO', key: '8', label: 'Neuro', available: true },
	{ id: 'IMPPLAN', key: '9', label: 'Imp / Plan', available: true },
	{ id: 'CODING', key: '0', label: 'Codes', available: true }
];

export interface Row {
	id: string; // row key, e.g. CONJ
	label: string;
	/** Copied by the OD -> OS / OS -> OD buttons (spec §3.3). */
	copyable: boolean;
	/** Shorthand codes shown beside the row so users learn them. */
	hint: string;
	/** Short value such as a measurement; rendered narrower. '' = short text without a unit. */
	measure?: string;
	/** Field ids per eye. */
	od: string;
	os: string;
}

export interface FieldDef {
	id: string; // e.g. ODCONJ
	section: SectionId;
	row: string;
	eye: Eye;
	label: string;
	maxLength: number;
	/** Exam-finding text: abbreviation expansion applies (spec §2.2 FIX). */
	expand: boolean;
}

export interface SectionDef {
	id: SectionId;
	title: string;
	rows: Row[];
	comments: { field: string; hint: string };
	/** External has the Hertel exophthalmometry row (OD, base, OS). */
	hertel?: boolean;
	/** Location modifiers for quick picks (Retina uses nasal/temporal, spec §4.2). */
	locations: string[];
}

type RowSpec = Omit<Row, 'od' | 'os' | 'hint'> & { hint?: string; code: string };

/** Eye-prefixed ids: OD/OS for globe sections, R/L for External (eye_mag naming). */
function rows(prefix: 'OD' | 'R', specs: RowSpec[]): Row[] {
	return specs.map(({ code, hint, ...r }) => ({
		...r,
		hint: hint ?? `R${code} · L${code} · B${code}`,
		od: prefix === 'OD' ? `OD${r.id}` : `R${r.id}`,
		os: prefix === 'OD' ? `OS${r.id}` : `L${r.id}`
	}));
}

const LOCATIONS = ['medial', 'lateral', 'superior', 'inferior', 'anterior', 'mid', 'posterior', 'deep'];

export const EXAM_SECTIONS: SectionDef[] = [
	{
		id: 'EXT',
		title: 'External',
		locations: LOCATIONS,
		hertel: true,
		comments: { field: 'EXT_COMMENTS', hint: 'ECOM' },
		rows: rows('R', [
			{ id: 'BROW', code: 'B', hint: 'RB · LB · FH', label: 'Brow', copyable: true },
			{ id: 'UL', code: 'UL', label: 'Upper lid', copyable: true },
			{ id: 'LL', code: 'LL', hint: 'RLL · LLL · BLL', label: 'Lower lid', copyable: true },
			{ id: 'MCT', code: 'MC', hint: 'RMC · LMC', label: 'Medial canthus', copyable: true },
			{ id: 'ADNEXA', code: 'AD', label: 'Adnexa', copyable: true },
			{ id: 'MRD', code: 'MRD', hint: 'RMRD · LMRD · MRD', label: 'MRD', copyable: false, measure: 'mm' },
			{ id: 'LF', code: 'LF', hint: 'RLF · LLF · LF', label: 'Levator function', copyable: false, measure: 'mm' },
			{ id: 'VFISSURE', code: 'VF', hint: 'RVF · LVF · VF', label: 'Vertical fissure', copyable: false, measure: 'mm' },
			{ id: 'CAROTID', code: 'CAR', hint: 'RCAR · LCAR · CAR', label: 'Carotid', copyable: false, measure: '' },
			{ id: 'TEMPART', code: 'TA', hint: 'RTA · LTA · TA', label: 'Temporal artery', copyable: false, measure: '' },
			{ id: 'CNV', code: 'CN5', hint: 'RCN5 · LCN5 · CN5', label: 'CN V', copyable: false, measure: '' },
			{ id: 'CNVII', code: 'CN7', hint: 'RCN7 · LCN7 · CN7', label: 'CN VII', copyable: false, measure: '' }
		])
	},
	{
		id: 'ANTSEG',
		title: 'Anterior segment (slit lamp)',
		locations: LOCATIONS,
		comments: { field: 'ANTSEG_COMMENTS', hint: 'ASCOM' },
		rows: rows('OD', [
			{ id: 'CONJ', code: 'C', label: 'Conjunctiva', copyable: true },
			{ id: 'CORNEA', code: 'K', label: 'Cornea', copyable: true },
			{ id: 'AC', code: 'AC', label: 'Anterior chamber', copyable: true },
			{ id: 'IRIS', code: 'I', label: 'Iris', copyable: true },
			{ id: 'LENS', code: 'L', label: 'Lens', copyable: true },
			{ id: 'GONIO', code: 'G', label: 'Gonioscopy', copyable: false },
			{ id: 'KTHICKNESS', code: 'PACH', label: 'Pachymetry', copyable: false, measure: 'µm' },
			{ id: 'SCHIRMER1', code: 'SCH1', hint: 'RSCH1 · LSCH1 · SCH1', label: 'Schirmer I', copyable: false, measure: 'mm' },
			{ id: 'SCHIRMER2', code: 'SCH2', hint: 'RSCH2 · LSCH2 · SCH2', label: 'Schirmer II', copyable: false, measure: 'mm' },
			{ id: 'TBUT', code: 'TBUT', label: 'Tear break-up time', copyable: false, measure: 's' }
		])
	},
	{
		id: 'RETINA',
		title: 'Fundus (retina)',
		locations: ['nasal', 'temporal', 'superior', 'inferior', 'anterior', 'mid', 'posterior', 'deep'],
		comments: { field: 'RETINA_COMMENTS', hint: 'RCOM' },
		rows: rows('OD', [
			{ id: 'DISC', code: 'D', label: 'Disc', copyable: true },
			{ id: 'MACULA', code: 'MAC', label: 'Macula', copyable: true },
			{ id: 'VESSELS', code: 'V', label: 'Vessels', copyable: true },
			{ id: 'VITREOUS', code: 'VIT', label: 'Vitreous', copyable: true },
			{ id: 'PERIPH', code: 'P', label: 'Periphery', copyable: true },
			{ id: 'CUP', code: 'CUP', hint: 'RCUP · LCUP · CUP', label: 'C/D ratio', copyable: true, measure: '' },
			{ id: 'CMT', code: 'CMT', hint: 'RCMT · LCMT · CMT', label: 'Central macular thickness', copyable: false, measure: 'µm' }
		])
	}
];

export const SECTION_DEF = new Map(EXAM_SECTIONS.map((s) => [s.id, s]));

function sectionFields(sec: SectionDef): FieldDef[] {
	const out: FieldDef[] = sec.rows.flatMap((r) =>
		(['OD', 'OS'] as const).map((eye) => ({
			id: eye === 'OD' ? r.od : r.os,
			section: sec.id,
			row: r.id,
			eye,
			label: `${r.label} ${eye}`,
			maxLength: r.measure !== undefined ? (r.measure ? 25 : 200) : 2000,
			expand: r.measure === undefined
		}))
	);
	if (sec.hertel) {
		out.push(
			{ id: 'ODHERTEL', section: sec.id, row: 'HERTEL', eye: 'OD', label: 'Hertel OD', maxLength: 25, expand: false },
			{ id: 'OSHERTEL', section: sec.id, row: 'HERTEL', eye: 'OS', label: 'Hertel OS', maxLength: 25, expand: false },
			{ id: 'HERTELBASE', section: sec.id, row: 'HERTEL', eye: 'OU', label: 'Hertel base', maxLength: 25, expand: false }
		);
	}
	out.push({
		id: sec.comments.field,
		section: sec.id,
		row: 'COMMENTS',
		eye: 'OU',
		label: `${sec.title} comments`,
		maxLength: 4000,
		expand: true
	});
	return out;
}

/** Every writable exam field: row-based sections plus the custom-panel section modules. */
export const FIELDS: FieldDef[] = [...EXAM_SECTIONS.flatMap(sectionFields), ...WORKUP_FIELDS, ...REFRACTION_FIELDS, ...HISTORY_FIELDS, ...NEURO_FIELDS, ...DILATION_FIELDS, ...GLAUCOMA_FIELDS];

export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

export function fieldId(eye: 'OD' | 'OS', row: Row): string {
	return eye === 'OD' ? row.od : row.os;
}

export function isKnownField(id: string): boolean {
	return FIELD_BY_ID.has(id);
}

/** Seed "normal exam" defaults (short clinical terms; spec §3.1). */
export const SEED_DEFAULTS: Record<string, string> = {
	...WORKUP_DEFAULTS,
	...REFRACTION_DEFAULTS,
	...HISTORY_DEFAULTS,
	...NEURO_DEFAULTS,
	...DILATION_DEFAULTS,
	...GLAUCOMA_DEFAULTS,
	// External
	RBROW: 'no brow ptosis',
	LBROW: 'no brow ptosis',
	RUL: 'normal lids and lashes',
	LUL: 'normal lids and lashes',
	RLL: 'good tone',
	LLL: 'good tone',
	RMCT: 'no masses',
	LMCT: 'no masses',
	RADNEXA: 'normal lacrimal gland and orbit',
	LADNEXA: 'normal lacrimal gland and orbit',
	RMRD: '+3',
	LMRD: '+3',
	RLF: '17',
	LLF: '17',
	// Anterior segment
	ODCONJ: 'quiet',
	OSCONJ: 'quiet',
	ODCORNEA: 'clear',
	OSCORNEA: 'clear',
	ODAC: 'deep and quiet',
	OSAC: 'deep and quiet',
	ODIRIS: 'round',
	OSIRIS: 'round',
	ODLENS: 'clear',
	OSLENS: 'clear',
	// Retina
	ODDISC: 'pink',
	OSDISC: 'pink',
	ODCUP: '0.3',
	OSCUP: '0.3',
	ODMACULA: 'flat',
	OSMACULA: 'flat',
	ODVESSELS: '2:3',
	OSVESSELS: '2:3',
	ODVITREOUS: 'clear',
	OSVITREOUS: 'clear',
	ODPERIPH: 'clear',
	OSPERIPH: 'clear'
};
