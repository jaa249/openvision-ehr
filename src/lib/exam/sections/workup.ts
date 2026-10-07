// workup section module: fields, shorthand codes, defaults and report output for this part of the exam.
// Covers the clinical strip (spec §1.4): visual acuity (§8.1), IOP (§8.3), Amsler (§8.4),
// confrontation fields (§8.5), pupils (§8.6) and mental status, plus their report items (§13.2 items 3-4).
// Wired into catalog.ts (FIELDS, SEED_DEFAULTS), shorthand/codes.ts (ALIASES) and exam/report.ts (buildReport).
// Rule: import only TYPES from catalog.ts / report.ts here (they import values from this file).
import type { Eye, FieldDef, FieldText, SectionId } from '../catalog.ts';
import type { ReportRow, ReportSection } from '../report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import { english, type Translate } from '#lib/coding/english.ts';
// Refraction imports only types, so importing its values here is not circular. Some acuity columns
// (MR/AR/CR/CTL VA, wearing VA, post-dilation IOP) are shown in both panels; whichever module defines
// a field first owns it, so the catalog never holds the same id twice.
import { REFRACTION_FIELDS } from './refraction.ts';

// ---------- field layout (shared with VisionPanel / PressurePanel) ----------

export interface VaRow {
	key: string;
	label: string;
	od: string;
	os: string;
	/** Near rows offer Jaeger picks instead of Snellen. */
	near?: boolean;
}

/** Acuity rows in the report's order (spec §13.2 item 3). Ids are eye_mag's column names. */
export const VA_ROWS: VaRow[] = [
	{ key: 'SC', label: 'sc', od: 'SCODVA', os: 'SCOSVA' },
	{ key: 'CC', label: 'cc', od: 'ODVA', os: 'OSVA' }, // wearing Rx #1 VA (§1.4)
	{ key: 'AR', label: 'AR', od: 'ARODVA', os: 'AROSVA' },
	{ key: 'MR', label: 'MR', od: 'MRODVA', os: 'MROSVA' },
	{ key: 'CR', label: 'CR', od: 'CRODVA', os: 'CROSVA' },
	{ key: 'PH', label: 'PH', od: 'PHODVA', os: 'PHOSVA' },
	{ key: 'CTL', label: 'CTL', od: 'CTLODVA', os: 'CTLOSVA' },
	{ key: 'SCNEAR', label: 'near sc', od: 'SCNEARODVA', os: 'SCNEAROSVA', near: true },
	{ key: 'CCNEAR', label: 'near cc', od: 'WODVANEAR', os: 'OSVANEARCC', near: true },
	{ key: 'ARNEAR', label: 'AR near', od: 'ARNEARODVA', os: 'ARNEAROSVA', near: true },
	{ key: 'MRNEAR', label: 'MR near', od: 'MRNEARODVA', os: 'MRNEAROSVA', near: true },
	{ key: 'PAM', label: 'PAM', od: 'PAMODVA', os: 'PAMOSVA' },
	{ key: 'GLARE', label: 'Glare', od: 'GLAREODVA', os: 'GLAREOSVA' },
	// eye_mag shows contrast in its acuity grid but FIELDS.md has no column; ids follow the GLARE pattern.
	{ key: 'CONTRAST', label: 'Contrast', od: 'CONTRASTODVA', os: 'CONTRASTOSVA' },
	{ key: 'LI', label: 'LI', od: 'LIODVA', os: 'LIOSVA' }
];

/** Screen labels of VA_ROWS by key (D48). The English labels above stay for the report and field labels. */
export const VA_ROW_LABEL_KEY: Record<string, MessageKey> = {
	SC: 'sections.vaRowSc',
	CC: 'sections.vaRowCc',
	AR: 'sections.vaRowAr',
	MR: 'sections.vaRowMr',
	CR: 'sections.vaRowCr',
	PH: 'sections.vaRowPh',
	CTL: 'sections.vaRowCtl',
	SCNEAR: 'sections.vaRowScNear',
	CCNEAR: 'sections.vaRowCcNear',
	ARNEAR: 'sections.vaRowArNear',
	MRNEAR: 'sections.vaRowMrNear',
	PAM: 'sections.vaRowPam',
	GLARE: 'sections.vaRowGlare',
	CONTRAST: 'sections.vaRowContrast',
	LI: 'sections.vaRowLi'
};

export const IOP_METHODS = [
	{ key: 'AP', label: 'Applanation', short: 'App', od: 'ODIOPAP', os: 'OSIOPAP', numeric: true },
	{ key: 'TPN', label: 'Tono-Pen', short: 'Tpn', od: 'ODIOPTPN', os: 'OSIOPTPN', numeric: true },
	{ key: 'FTN', label: 'Finger tension', short: 'FTN', od: 'ODIOPFTN', os: 'OSIOPFTN', numeric: false }
] as const;

/**
 * Confrontation quadrants, 1-4 per eye (ODVF1..4, OSVF1..4). Value '1' = defect, '0' = full, '' = not tested.
 * Our numbering: 1 superior temporal, 2 superior nasal, 3 inferior temporal, 4 inferior nasal.
 */
export const VF_QUADRANTS = [
	{ n: 1, label: 'Superior temporal', short: 'ST' },
	{ n: 2, label: 'Superior nasal', short: 'SN' },
	{ n: 3, label: 'Inferior temporal', short: 'IT' },
	{ n: 4, label: 'Inferior nasal', short: 'IN' }
] as const;
/** Screen labels of IOP_METHODS, VF_QUADRANTS (by n) and MENTAL_STATUS (D48). */
export const IOP_METHOD_LABEL_KEY: Record<(typeof IOP_METHODS)[number]['key'], MessageKey> = {
	AP: 'sections.iopMethodApplanation',
	TPN: 'sections.iopMethodTonoPen',
	FTN: 'sections.iopMethodFinger'
};
export const VF_QUADRANT_LABEL_KEY: Record<(typeof VF_QUADRANTS)[number]['n'], MessageKey> = {
	1: 'sections.vfSuperiorTemporal',
	2: 'sections.vfSuperiorNasal',
	3: 'sections.vfInferiorTemporal',
	4: 'sections.vfInferiorNasal'
};
export const VF_IDS = (['OD', 'OS'] as const).flatMap((e) => VF_QUADRANTS.map((q) => `${e}VF${q.n}`));

export const PUPIL_IDS = {
	OD: { size1: 'ODPUPILSIZE1', size2: 'ODPUPILSIZE2', react: 'ODPUPILREACTIVITY', apd: 'ODAPD' },
	OS: { size1: 'OSPUPILSIZE1', size2: 'OSPUPILSIZE2', react: 'OSPUPILREACTIVITY', apd: 'OSAPD' }
} as const;
export const DIM_PUPIL_IDS = {
	OD: { size1: 'DIMODPUPILSIZE1', size2: 'DIMODPUPILSIZE2', react: 'DIMODPUPILREACTIVITY' },
	OS: { size1: 'DIMOSPUPILSIZE1', size2: 'DIMOSPUPILSIZE2', react: 'DIMOSPUPILREACTIVITY' }
} as const;

/** Mental status checkboxes (§1.4). Stored values follow eye_mag ('yes' / 'TPP' / 'nml'), '' = unchecked. */
export const MENTAL_STATUS = [
	{ id: 'ALERT', label: 'Alert', on: 'yes' },
	{ id: 'ORIENTED', label: 'Oriented ×3', on: 'TPP' },
	// eye_mag stores this in a column named `confused`; we keep the meaning, not the name (§1.4).
	{ id: 'MOOD_AFFECT', label: 'Mood / affect normal', on: 'nml' }
] as const;

export const MENTAL_STATUS_LABEL_KEY: Record<(typeof MENTAL_STATUS)[number]['id'], MessageKey> = {
	ALERT: 'sections.mentalAlert',
	ORIENTED: 'sections.mentalOriented',
	MOOD_AFFECT: 'sections.mentalMood'
};

// ---------- fields ----------

type Spec = [id: string, section: SectionId, row: string, eye: Eye, label: string, maxLength: number, expand?: boolean];

const vaSpecs: Spec[] = VA_ROWS.flatMap((r) => [
	[r.od, 'ACUITY', r.key, 'OD', `VA ${r.label} OD`, 25],
	[r.os, 'ACUITY', r.key, 'OS', `VA ${r.label} OS`, 25]
]);

const specs: Spec[] = [
	// Vision (§1.4, §8.1)
	...vaSpecs,
	['BINOCVA', 'ACUITY', 'BINOC', 'OU', 'VA binocular OU', 25],
	['GLARECOMMENTS', 'ACUITY', 'GLARE', 'OU', 'Glare comments', 255],
	// Amsler (§8.4): 0-5
	['AMSLEROD', 'ACUITY', 'AMSLER', 'OD', 'Amsler OD', 1],
	['AMSLEROS', 'ACUITY', 'AMSLER', 'OS', 'Amsler OS', 1],
	// Mental status (§1.4)
	...MENTAL_STATUS.map((m): Spec => [m.id, 'IOP', 'MENTAL', 'OU', m.label, 3]),
	// IOP (§8.3)
	...IOP_METHODS.flatMap((m): Spec[] => [
		[m.od, 'IOP', `IOP${m.key}`, 'OD', `IOP ${m.label} OD`, 10],
		[m.os, 'IOP', `IOP${m.key}`, 'OS', `IOP ${m.label} OS`, 10]
	]),
	['IOPTIME', 'IOP', 'IOPTIME', 'OU', 'IOP time', 10],
	['ODIOPTARGET', 'IOP', 'IOPTARGET', 'OD', 'IOP target OD', 10],
	['OSIOPTARGET', 'IOP', 'IOPTARGET', 'OS', 'IOP target OS', 10],
	['ODIOPPOST', 'IOP', 'IOPPOST', 'OD', 'IOP post-dilation OD', 10],
	['OSIOPPOST', 'IOP', 'IOPPOST', 'OS', 'IOP post-dilation OS', 10],
	['IOPPOSTTIME', 'IOP', 'IOPPOST', 'OU', 'IOP post-dilation time', 10],
	// Pupils (§8.6)
	['PUPIL_NORMAL', 'IOP', 'PUPILS', 'OU', 'Pupils normal', 2],
	...(['OD', 'OS'] as const).flatMap((e): Spec[] => [
		[PUPIL_IDS[e].size1, 'IOP', 'PUPILSIZE', e, `Pupil size light (from) ${e}`, 25],
		[PUPIL_IDS[e].size2, 'IOP', 'PUPILSIZE', e, `Pupil size light (to) ${e}`, 25],
		[PUPIL_IDS[e].react, 'IOP', 'PUPILREACT', e, `Pupil reactivity ${e}`, 25],
		[PUPIL_IDS[e].apd, 'IOP', 'APD', e, `APD ${e}`, 25],
		[DIM_PUPIL_IDS[e].size1, 'IOP', 'DIMPUPILSIZE', e, `Pupil size dim (from) ${e}`, 25],
		[DIM_PUPIL_IDS[e].size2, 'IOP', 'DIMPUPILSIZE', e, `Pupil size dim (to) ${e}`, 25],
		[DIM_PUPIL_IDS[e].react, 'IOP', 'DIMPUPILREACT', e, `Pupil reactivity dim ${e}`, 25]
	]),
	['PUPIL_COMMENTS', 'IOP', 'PUPILCOMMENTS', 'OU', 'Pupil comments', 4000, true],
	// Confrontation fields (§8.5)
	...(['OD', 'OS'] as const).flatMap((e) =>
		VF_QUADRANTS.map((q): Spec => [`${e}VF${q.n}`, 'IOP', 'VF', e, `Field ${q.label.toLowerCase()} ${e}`, 1])
	)
];

const taken = new Set(REFRACTION_FIELDS.map((f) => f.id));

export const WORKUP_FIELDS: FieldDef[] = specs
	.filter(([id]) => !taken.has(id))
	.map(([id, section, row, eye, label, maxLength, expand]) => ({ id, section, row, eye, label, maxLength, expand: !!expand }));

/** Screen labels of WORKUP_FIELDS (D48), same English as `label` above (catalog.test.ts checks). */
const EYES = ['OD', 'OS'] as const;
const workupText: [string, FieldText][] = [
	...VA_ROWS.flatMap((r) => EYES.map((e): [string, FieldText] => [e === 'OD' ? r.od : r.os, (t) => t('sections.vaCellLabel', { row: t(VA_ROW_LABEL_KEY[r.key]), eye: e })])),
	['BINOCVA', (t) => t('sections.visionBinocularLabel')],
	['GLARECOMMENTS', (t) => t('sections.visionGlareComments')],
	...EYES.map((e): [string, FieldText] => [`AMSLER${e}`, (t) => t('catalog.fieldEye', { field: t('sections.amsler'), eye: e })]),
	...MENTAL_STATUS.map((m): [string, FieldText] => [m.id, (t) => t(MENTAL_STATUS_LABEL_KEY[m.id])]),
	...IOP_METHODS.flatMap((m) => EYES.map((e): [string, FieldText] => [e === 'OD' ? m.od : m.os, (t) => t('sections.iopCellLabel', { method: t(IOP_METHOD_LABEL_KEY[m.key]), eye: e })])),
	['IOPTIME', (t) => t('sections.iopTimeLabel')],
	...EYES.flatMap((e): [string, FieldText][] => [
		[`${e}IOPTARGET`, (t) => t('sections.iopTargetLabel', { eye: e })],
		[`${e}IOPPOST`, (t) => t('sections.iopPostDilationLabel', { eye: e })],
		[PUPIL_IDS[e].size1, (t) => t('sections.pupilSizeLightFrom', { eye: e })],
		[PUPIL_IDS[e].size2, (t) => t('sections.pupilSizeLightTo', { eye: e })],
		[PUPIL_IDS[e].react, (t) => t('sections.pupilReactivityLabel', { eye: e })],
		[PUPIL_IDS[e].apd, (t) => t('sections.pupilApdLabel', { eye: e })],
		[DIM_PUPIL_IDS[e].size1, (t) => t('sections.pupilSizeDimFrom', { eye: e })],
		[DIM_PUPIL_IDS[e].size2, (t) => t('sections.pupilSizeDimTo', { eye: e })],
		[DIM_PUPIL_IDS[e].react, (t) => t('sections.pupilReactivityDimLabel', { eye: e })],
		...VF_QUADRANTS.map((q): [string, FieldText] => [`${e}VF${q.n}`, (t) => t('sections.fieldVfQuadrant', { quadrant: t(VF_QUADRANT_LABEL_KEY[q.n]).toLowerCase(), eye: e })])
	]),
	['IOPPOSTTIME', (t) => t('sections.iopPostTimeLabel')],
	['PUPIL_NORMAL', (t) => t('sections.pupilsNormal')],
	['PUPIL_COMMENTS', (t) => t('sections.pupilComments')]
];
export const WORKUP_FIELD_TEXT: Record<string, FieldText> = Object.fromEntries(workupText.filter(([id]) => !taken.has(id)));

/**
 * Shorthand code -> field ids (codes are upper-case). Every field id above is already a code (spec §2.3
 * stage 3, e.g. SCODVA:20/25, ODIOPAP:15); these are short convenience codes that clash with nothing.
 */
export const WORKUP_ALIASES: Record<string, string[]> = {
	RVA: ['SCODVA'],
	LVA: ['SCOSVA'],
	BVA: ['SCODVA', 'SCOSVA'],
	RPH: ['PHODVA'],
	LPH: ['PHOSVA'],
	RIOP: ['ODIOPAP'],
	LIOP: ['OSIOPAP'],
	IOP: ['ODIOPAP', 'OSIOPAP'],
	BIOP: ['ODIOPAP', 'OSIOPAP'],
	RTPN: ['ODIOPTPN'],
	LTPN: ['OSIOPTPN'],
	RAPD: ['ODAPD'],
	LAPD: ['OSAPD'],
	APD: ['ODAPD', 'OSAPD'],
	BAPD: ['ODAPD', 'OSAPD'],
	PUPCOM: ['PUPIL_COMMENTS'],
	PCOM: ['PUPIL_COMMENTS']
};

/** Starter "normal" values (spec §3.1; the seed list's NEURO pupil rows). */
export const WORKUP_DEFAULTS: Record<string, string> = {
	ODPUPILSIZE1: '3',
	ODPUPILSIZE2: '2',
	ODPUPILREACTIVITY: '+2',
	ODAPD: '0',
	OSPUPILSIZE1: '3',
	OSPUPILSIZE2: '2',
	OSPUPILREACTIVITY: '+2',
	OSAPD: '0'
};

/** Pupils "Normal" when the provider has no list values (spec §3.2 fixed-value button). */
export const PUPILS_NORMAL: Record<string, string> = {
	ODPUPILSIZE1: '3.0',
	ODPUPILSIZE2: '2.0',
	ODPUPILREACTIVITY: '+2',
	ODAPD: '0',
	OSPUPILSIZE1: '3.0',
	OSPUPILSIZE2: '2.0',
	OSPUPILREACTIVITY: '+2',
	OSAPD: '0'
};

/** Fallback IOP target when neither the visit nor the provider's list sets one (§8.3). */
export const DEFAULT_IOP_TARGET = 21;

// ---------- entry helpers (pure, so panels and tests agree) ----------

/** §8.1: "=" becomes "+", a leading "j" becomes "J" (Jaeger). FIX: works for any input method. */
export function normalizeVA(v: string): string {
	return v.replace(/=/g, '+').replace(/^(\s*)j/, '$1J');
}

/** §8.6: a single-digit reactivity gets a "+" prefix. */
export function normalizeReactivity(v: string): string {
	const t = v.trim();
	return /^\d$/.test(t) ? `+${t}` : v;
}

/** "h:mm AM/PM" (§8.3). */
export function formatTime(d: Date): string {
	const h = d.getHours();
	const m = String(d.getMinutes()).padStart(2, '0');
	return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** An empty or midnight time is replaced with the current time (§8.3, parity). */
export function needsTimeStamp(time: string): boolean {
	const t = time.trim().toUpperCase();
	return !t || /^(12:00\s*AM|0?0:00(:00)?)$/.test(t);
}

function num(v: string | undefined): number | null {
	const t = (v ?? '').trim();
	return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * The IOP target for one eye: this visit's value, else the provider's list entry, else 21 (§8.3).
 * (The latest-prior-visit step needs priors, which the panels do not receive.)
 */
export function iopTarget(eye: 'OD' | 'OS', findings: Findings, defaults: Record<string, string> = {}): number {
	const id = `${eye}IOPTARGET`;
	return num(findings[id]?.value) ?? num(defaults[id]) ?? DEFAULT_IOP_TARGET;
}

/** FIX (§8.3): numeric comparison against the eye's target; text such as "soft" is never high. */
export function isHighIop(value: string | undefined, target: number = DEFAULT_IOP_TARGET): boolean {
	const n = num(value);
	return n !== null && n > target;
}

export type FieldsState = 'untested' | 'full' | 'defect';

/** One eye's confrontation result: nothing recorded, all full, or at least one defect (§8.5, §13.2 FIX). */
export function fieldsState(findings: Findings, eye: 'OD' | 'OS'): FieldsState {
	const vals = VF_QUADRANTS.map((q) => findings[`${eye}VF${q.n}`]?.value?.trim() ?? '');
	if (vals.some((v) => v === '1')) return 'defect';
	return vals.some((v) => v !== '') ? 'full' : 'untested';
}

/** Amsler severity 0-5, or null when not recorded. */
export function amslerValue(findings: Findings, eye: 'OD' | 'OS'): number | null {
	const v = findings[`AMSLER${eye}`]?.value?.trim() ?? '';
	return /^[0-5]$/.test(v) ? Number(v) : null;
}

// ---------- report (§13.2 items 3-4) ----------

const range = (a: string, b: string) => (a && b ? `${a} → ${b}` : a || b);

/** IOP_METHODS short labels on the report. */
const IOP_SHORT_KEY: Record<(typeof IOP_METHODS)[number]['key'], MessageKey> = { AP: 'report.iopApp', TPN: 'report.iopTpn', FTN: 'report.iopFtn' };

/**
 * Printed report sections for this module, in spec §13.2 order. `title` / `label` stay English;
 * titleText / labelText and the words in summaries and tables are in `t`'s language (D48).
 */
export function workupReport(findings: Findings, t: Translate = english): ReportSection[] {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	const filled = (r: ReportRow) => !!(r.od || r.os);
	const out: ReportSection[] = [];

	// Visual acuities: a row only when either eye has a value.
	const va: ReportRow[] = VA_ROWS.map((r) => ({ label: r.label, labelText: { key: VA_ROW_LABEL_KEY[r.key] }, od: v(r.od), os: v(r.os) })).filter(filled);
	const vaNotes = [v('BINOCVA') && t('report.binocularVa', { value: v('BINOCVA') }), v('GLARECOMMENTS') && t('report.glareNote', { value: v('GLARECOMMENTS') })]
		.filter(Boolean)
		.join('. ');
	if (va.length || vaNotes) out.push({ title: 'Visual acuities', titleText: { key: 'report.sectionVisualAcuities' }, rows: va, comments: vaNotes });

	// Intraocular pressures: each method only when present; time only when an IOP exists (FIX).
	const unit = (s: string) => (num(s) !== null ? `${s} mmHg` : s);
	const iop: ReportRow[] = IOP_METHODS.map((m) => ({
		label: m.short,
		labelText: { key: IOP_SHORT_KEY[m.key] },
		od: m.numeric ? unit(v(m.od)) : v(m.od),
		os: m.numeric ? unit(v(m.os)) : v(m.os)
	})).filter(filled);
	const post: ReportRow = { label: 'Post-dilation', labelText: { key: 'report.postDilation' }, od: unit(v('ODIOPPOST')), os: unit(v('OSIOPPOST')) };
	if (filled(post) && v('IOPPOSTTIME')) {
		post.label += ` @ ${v('IOPPOSTTIME')}`;
		post.labelText = { key: 'report.postDilationAt', params: { time: v('IOPPOSTTIME') } };
	}
	if (iop.length || filled(post)) {
		const time = iop.length && v('IOPTIME') ? v('IOPTIME') : '';
		out.push({
			title: `Intraocular pressures${time ? ` @ ${time}` : ''}`,
			titleText: time ? { key: 'report.sectionIopAt', params: { time } } : { key: 'report.sectionIop' },
			rows: filled(post) ? [...iop, post] : iop,
			comments: ''
		});
	}

	// Pupils: "Round and reactive" when Normal is checked and sizes are blank; else a row per measure.
	const pupils = ([
		{ label: 'Size', labelText: { key: 'report.pupilSize' }, od: range(v('ODPUPILSIZE1'), v('ODPUPILSIZE2')), os: range(v('OSPUPILSIZE1'), v('OSPUPILSIZE2')) },
		{ label: 'Reactivity', labelText: { key: 'sections.pupilReactivity' }, od: v('ODPUPILREACTIVITY'), os: v('OSPUPILREACTIVITY') },
		{ label: 'APD', labelText: { key: 'sections.pupilApd' }, od: v('ODAPD'), os: v('OSAPD') }
	] satisfies ReportRow[]).filter(filled);
	const pupilsNormal = !!v('PUPIL_NORMAL') && v('PUPIL_NORMAL') !== '0';
	const sizesBlank = !['ODPUPILSIZE1', 'ODPUPILSIZE2', 'OSPUPILSIZE1', 'OSPUPILSIZE2'].some(v);

	// Fields print only alongside other strip items, so an empty exam prints nothing.
	const strip = out.length > 0 || pupils.length > 0 || pupilsNormal || VF_IDS.some(v);
	if (strip) {
		const od = fieldsState(findings, 'OD');
		const os = fieldsState(findings, 'OS');
		if (od === 'defect' || os === 'defect') {
			const cell = (eye: 'OD' | 'OS', n: number) => {
				const s = fieldsState(findings, eye);
				if (s === 'untested') return t('sections.notTested');
				return v(`${eye}VF${n}`) === '1' ? t('sections.vfStateDefect') : t('sections.vfStateFull');
			};
			out.push({
				title: 'Confrontation fields',
				titleText: { key: 'report.sectionConfrontationFields' },
				rows: [],
				comments: '',
				table: {
					head: ['', t('report.vfEyeTemporal', { eye: 'OD' }), t('report.vfEyeNasal', { eye: 'OD' }), t('report.vfEyeNasal', { eye: 'OS' }), t('report.vfEyeTemporal', { eye: 'OS' })],
					body: [
						[t('report.vfSuperior'), cell('OD', 1), cell('OD', 2), cell('OS', 2), cell('OS', 1)],
						[t('report.vfInferior'), cell('OD', 3), cell('OD', 4), cell('OS', 4), cell('OS', 3)]
					]
				}
			});
		} else {
			const word = (s: FieldsState) => (s === 'full' ? t('sections.vfFullToCf') : t('sections.notTested'));
			const text = od === os ? t('report.vfSummaryOu', { state: word(od) }) : t('report.vfSummaryEyes', { od: word(od), os: word(os) });
			out.push({ title: 'Confrontation fields', titleText: { key: 'report.sectionConfrontationFields' }, rows: [], comments: '', summary: text });
		}
	}

	const pupilsTitle: Pick<ReportSection, 'title' | 'titleText'> = { title: 'Pupils', titleText: { key: 'sections.pupilsTitle' } };
	if (pupilsNormal && sizesBlank) out.push({ ...pupilsTitle, rows: [], comments: '', summary: t('report.pupilsRoundReactive') });
	else if (pupils.length) out.push({ ...pupilsTitle, rows: pupils, comments: '' });

	// Dim pupils and Amsler: only when any dim value, pupil comment or Amsler value exists.
	const dim: ReportRow[] = ([
		{
			label: 'Dim size',
			labelText: { key: 'report.dimSize' },
			od: range(v('DIMODPUPILSIZE1'), v('DIMODPUPILSIZE2')),
			os: range(v('DIMOSPUPILSIZE1'), v('DIMOSPUPILSIZE2'))
		},
		{ label: 'Dim reactivity', labelText: { key: 'report.dimReactivity' }, od: v('DIMODPUPILREACTIVITY'), os: v('DIMOSPUPILREACTIVITY') }
	] satisfies ReportRow[]).filter(filled);
	const ams = (e: 'OD' | 'OS') => {
		const a = amslerValue(findings, e);
		return a === null ? '' : `${a}/5`;
	};
	const amsler: ReportRow = { label: 'Amsler', labelText: { key: 'sections.amsler' }, od: ams('OD'), os: ams('OS') };
	if (filled(amsler)) dim.push(amsler);
	if (dim.length || v('PUPIL_COMMENTS')) {
		out.push({ title: 'Dim pupils and Amsler', titleText: { key: 'report.sectionDimPupilsAmsler' }, rows: dim, comments: v('PUPIL_COMMENTS') });
	}
	return out;
}
