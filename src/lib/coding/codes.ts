// Code tables for the coding panel (spec §11). Every code comes from a table, never from string
// building (B8 FIX). Descriptions are our own short plain words, not AMA CPT descriptors.
// The English labels stay (the server and the printed report use them); the *_KEY maps give the
// screen's message key for each (D48), and coding/i18n.test.ts checks that every entry has one.
import type { MessageKey } from '#lib/i18n/catalog.ts';

export type Family = 'eye' | 'em';
export type PatientStatus = 'new' | 'established';
/** Eye visits: intermediate / comprehensive. Office E/M: level of medical decision-making (2021+ rules). */
export type VisitLevel = 'intermediate' | 'comprehensive' | 'straightforward' | 'low' | 'moderate' | 'high';

export interface VisitCodeDef {
	code: string;
	family: Family;
	patient: PatientStatus;
	level: VisitLevel;
	/** Short plain description (ours). */
	label: string;
}

export const FAMILIES: { id: Family; label: string; help: string }[] = [
	{ id: 'eye', label: 'Eye visit (920xx)', help: 'Eye exam codes. The usual choice for an eye visit.' },
	{
		id: 'em',
		label: 'Office visit (992xx)',
		help: 'General office codes, picked by medical decision-making or total time. Never suggested; choose the level yourself.'
	}
];

export const FAMILY_LABEL_KEY: Record<Family, MessageKey> = { eye: 'codes.familyEye', em: 'codes.familyEm' };
export const FAMILY_HELP_KEY: Record<Family, MessageKey> = { eye: 'codes.familyEyeHelp', em: 'codes.familyEmHelp' };

export const VISIT_CODES: VisitCodeDef[] = [
	{ code: '92002', family: 'eye', patient: 'new', level: 'intermediate', label: 'Eye exam, new patient, intermediate' },
	{ code: '92004', family: 'eye', patient: 'new', level: 'comprehensive', label: 'Eye exam, new patient, comprehensive' },
	{ code: '92012', family: 'eye', patient: 'established', level: 'intermediate', label: 'Eye exam, established patient, intermediate' },
	{ code: '92014', family: 'eye', patient: 'established', level: 'comprehensive', label: 'Eye exam, established patient, comprehensive' },
	{ code: '99202', family: 'em', patient: 'new', level: 'straightforward', label: 'Office visit, new patient, straightforward decision-making' },
	{ code: '99203', family: 'em', patient: 'new', level: 'low', label: 'Office visit, new patient, low decision-making' },
	{ code: '99204', family: 'em', patient: 'new', level: 'moderate', label: 'Office visit, new patient, moderate decision-making' },
	{ code: '99205', family: 'em', patient: 'new', level: 'high', label: 'Office visit, new patient, high decision-making' },
	{ code: '99212', family: 'em', patient: 'established', level: 'straightforward', label: 'Office visit, established patient, straightforward decision-making' },
	{ code: '99213', family: 'em', patient: 'established', level: 'low', label: 'Office visit, established patient, low decision-making' },
	{ code: '99214', family: 'em', patient: 'established', level: 'moderate', label: 'Office visit, established patient, moderate decision-making' },
	{ code: '99215', family: 'em', patient: 'established', level: 'high', label: 'Office visit, established patient, high decision-making' }
];
export const VISIT_CODE_BY_CODE = new Map(VISIT_CODES.map((c) => [c.code, c]));
/** Screen label of each visit code (the English `label` above is what the report prints). */
export const VISIT_CODE_LABEL_KEY: Record<string, MessageKey> = {
	'92002': 'codes.visit92002',
	'92004': 'codes.visit92004',
	'92012': 'codes.visit92012',
	'92014': 'codes.visit92014',
	'99202': 'codes.visit99202',
	'99203': 'codes.visit99203',
	'99204': 'codes.visit99204',
	'99205': 'codes.visit99205',
	'99212': 'codes.visit99212',
	'99213': 'codes.visit99213',
	'99214': 'codes.visit99214',
	'99215': 'codes.visit99215'
};

export const LEVEL_LABEL: Record<VisitLevel, string> = {
	intermediate: 'Intermediate',
	comprehensive: 'Comprehensive',
	straightforward: 'Straightforward',
	low: 'Low',
	moderate: 'Moderate',
	high: 'High'
};
export const LEVEL_LABEL_KEY: Record<VisitLevel, MessageKey> = {
	intermediate: 'codes.levelIntermediate',
	comprehensive: 'codes.levelComprehensive',
	straightforward: 'codes.levelStraightforward',
	low: 'codes.levelLow',
	moderate: 'codes.levelModerate',
	high: 'codes.levelHigh'
};

/** The one code for a family / patient status / level, looked up in the table. */
export function visitCode(family: Family, patient: PatientStatus, level: VisitLevel): VisitCodeDef | undefined {
	return VISIT_CODES.find((c) => c.family === family && c.patient === patient && c.level === level);
}

/** 92060, suggested from the neuro findings (§9.4 FIX), included only when the provider ticks it. */
export const SENSORIMOTOR = { code: '92060', label: 'Sensorimotor exam (multiple measurements of ocular deviation)' };
export const SENSORIMOTOR_LABEL_KEY: MessageKey = 'codes.sensorimotorLabel';

/** Visit modifiers (§11.2), each with the one-line explanation the panel always shows. */
export const VISIT_MODIFIERS = [
	{ code: '22', label: 'Unusually difficult', help: 'The work was substantially more than usual. Document why.' },
	{ code: '24', label: 'Unrelated, after surgery', help: 'Visit unrelated to a surgery whose follow-up period is still running.' },
	{ code: '25', label: 'Separate visit, same day', help: 'Significant, separately identifiable visit on the same day as a test or procedure.' },
	{ code: '57', label: 'Decision for surgery', help: 'This visit led to the decision to operate (major surgery today or tomorrow).' }
] as const;
export type VisitModifier = (typeof VISIT_MODIFIERS)[number]['code'];
export const VISIT_MODIFIER_CODES: string[] = VISIT_MODIFIERS.map((m) => m.code);
export const MODIFIER_LABEL_KEY: Record<VisitModifier, MessageKey> = {
	'22': 'codes.mod22Label',
	'24': 'codes.mod24Label',
	'25': 'codes.mod25Label',
	'57': 'codes.mod57Label'
};
export const MODIFIER_HELP_KEY: Record<VisitModifier, MessageKey> = {
	'22': 'codes.mod22Help',
	'24': 'codes.mod24Help',
	'25': 'codes.mod25Help',
	'57': 'codes.mod57Help'
};

/** Shown next to every test's modifier box. Never pre-filled (B10 FIX). */
export const MODIFIER_59_HINT = 'Leave empty unless a coding edit (NCCI) requires one; 59 marks a distinct, separate service.';
export const MODIFIER_59_HINT_KEY: MessageKey = 'codes.modifier59Hint';

/** Claim limits used by the summary check (CMS-1500 / 837P style). */
export const MAX_DX = 12;
export const MAX_POINTERS = 4;
export const DX_LETTERS = 'ABCDEFGHIJKL'.split('');

/** CPT / HCPCS shape: five characters, e.g. 92134, 0198T, G0117. */
export const CPT_RE = /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/;
/** ICD-10-CM shape: letter, digit, letter-or-digit, then optional "." and up to four more. */
export const ICD10_RE = /^[A-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/;
/**
 * A diagnosis code of either code set (D44): ICD-10-CM, or ICD-11 with optional "&" extensions.
 * Justifiers only point at impression items, so coding works with whichever set the items use.
 */
export { isDxCode } from '#lib/codesets/index.ts';
/** Two-character modifier, e.g. 59, RT, LT, XS. */
export const MODIFIER_RE = /^[0-9A-Z]{2}$/;
