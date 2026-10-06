// Exam field catalog. Field ids follow eye_mag's names (docs/spec/FIELDS.md) so
// shorthand users can keep typing the codes they already know.

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
	{ id: 'HPI', key: '1', label: 'HPI', available: false },
	{ id: 'ACUITY', key: '2', label: 'Acuity', available: false },
	{ id: 'REFRACTION', key: '3', label: 'Refraction', available: false },
	{ id: 'IOP', key: '4', label: 'IOP', available: false },
	{ id: 'EXT', key: '5', label: 'External', available: false },
	{ id: 'ANTSEG', key: '6', label: 'Slit lamp', available: true },
	{ id: 'RETINA', key: '7', label: 'Fundus', available: false },
	{ id: 'NEURO', key: '8', label: 'Neuro', available: false },
	{ id: 'IMPPLAN', key: '9', label: 'Imp / Plan', available: false },
	{ id: 'CODING', key: '0', label: 'Coding', available: false }
];

export interface Row {
	id: string; // row key, e.g. CONJ
	label: string;
	/** Copied by the OD -> OS / OS -> OD buttons (spec §3.3). */
	copyable: boolean;
	/** Shorthand stem: R<code>, L<code>, B<code> (shown beside the row so users learn it). */
	code: string;
	/** Short value such as a measurement; rendered narrower. */
	measure?: string;
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

export const ANTSEG_ROWS: Row[] = [
	{ id: 'CONJ', code: 'C', label: 'Conjunctiva', copyable: true },
	{ id: 'CORNEA', code: 'K', label: 'Cornea', copyable: true },
	{ id: 'AC', code: 'AC', label: 'Anterior chamber', copyable: true },
	{ id: 'IRIS', code: 'I', label: 'Iris', copyable: true },
	{ id: 'LENS', code: 'L', label: 'Lens', copyable: true },
	{ id: 'GONIO', code: 'G', label: 'Gonioscopy', copyable: false },
	{ id: 'KTHICKNESS', code: 'PACH', label: 'Pachymetry', copyable: false, measure: 'µm' },
	{ id: 'SCHIRMER1', code: 'SCH1', label: 'Schirmer I', copyable: false, measure: 'mm' },
	{ id: 'SCHIRMER2', code: 'SCH2', label: 'Schirmer II', copyable: false, measure: 'mm' },
	{ id: 'TBUT', code: 'TBUT', label: 'Tear break-up time', copyable: false, measure: 's' }
];

function eyeFields(section: SectionId, rows: Row[]): FieldDef[] {
	return rows.flatMap((r) =>
		(['OD', 'OS'] as const).map((eye) => ({
			id: `${eye}${r.id}`,
			section,
			row: r.id,
			eye,
			label: `${r.label} ${eye}`,
			maxLength: r.measure ? 25 : 2000,
			expand: !r.measure
		}))
	);
}

export const FIELDS: FieldDef[] = [
	...eyeFields('ANTSEG', ANTSEG_ROWS),
	{
		id: 'ANTSEG_COMMENTS',
		section: 'ANTSEG',
		row: 'COMMENTS',
		eye: 'OU',
		label: 'Anterior segment comments',
		maxLength: 4000,
		expand: true
	}
];

export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

export function fieldId(eye: 'OD' | 'OS', row: string): string {
	return `${eye}${row}`;
}

export function isKnownField(id: string): boolean {
	return FIELD_BY_ID.has(id);
}

/** Seed "normal exam" defaults (short clinical terms; spec §3.1). */
export const SEED_DEFAULTS: Record<string, string> = {
	ODCONJ: 'quiet',
	OSCONJ: 'quiet',
	ODCORNEA: 'clear',
	OSCORNEA: 'clear',
	ODAC: 'deep and quiet',
	OSAC: 'deep and quiet',
	ODIRIS: 'round',
	OSIRIS: 'round',
	ODLENS: 'clear',
	OSLENS: 'clear'
};
