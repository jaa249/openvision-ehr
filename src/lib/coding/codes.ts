// Code tables for the coding panel (spec §11). Every code comes from a table, never from string
// building (B8 FIX). Descriptions are our own short plain words, not AMA CPT descriptors.

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

export const LEVEL_LABEL: Record<VisitLevel, string> = {
	intermediate: 'Intermediate',
	comprehensive: 'Comprehensive',
	straightforward: 'Straightforward',
	low: 'Low',
	moderate: 'Moderate',
	high: 'High'
};

/** The one code for a family / patient status / level, looked up in the table. */
export function visitCode(family: Family, patient: PatientStatus, level: VisitLevel): VisitCodeDef | undefined {
	return VISIT_CODES.find((c) => c.family === family && c.patient === patient && c.level === level);
}

/** 92060, suggested from the neuro findings (§9.4 FIX), included only when the provider ticks it. */
export const SENSORIMOTOR = { code: '92060', label: 'Sensorimotor exam (multiple measurements of ocular deviation)' };

/** Visit modifiers (§11.2), each with the one-line explanation the panel always shows. */
export const VISIT_MODIFIERS = [
	{ code: '22', label: 'Unusually difficult', help: 'The work was substantially more than usual. Document why.' },
	{ code: '24', label: 'Unrelated, after surgery', help: 'Visit unrelated to a surgery whose follow-up period is still running.' },
	{ code: '25', label: 'Separate visit, same day', help: 'Significant, separately identifiable visit on the same day as a test or procedure.' },
	{ code: '57', label: 'Decision for surgery', help: 'This visit led to the decision to operate (major surgery today or tomorrow).' }
] as const;
export type VisitModifier = (typeof VISIT_MODIFIERS)[number]['code'];
export const VISIT_MODIFIER_CODES: string[] = VISIT_MODIFIERS.map((m) => m.code);

/** Shown next to every test's modifier box. Never pre-filled (B10 FIX). */
export const MODIFIER_59_HINT = 'Leave empty unless a coding edit (NCCI) requires one; 59 marks a distinct, separate service.';

/** Claim limits used by the summary check (CMS-1500 / 837P style). */
export const MAX_DX = 12;
export const MAX_POINTERS = 4;
export const DX_LETTERS = 'ABCDEFGHIJKL'.split('');

/** CPT / HCPCS shape: five characters, e.g. 92134, 0198T, G0117. */
export const CPT_RE = /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/;
/** ICD-10-CM shape: letter, digit, letter-or-digit, then optional "." and up to four more. */
export const ICD10_RE = /^[A-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/;
/** Two-character modifier, e.g. 59, RT, LT, XS. */
export const MODIFIER_RE = /^[0-9A-Z]{2}$/;
