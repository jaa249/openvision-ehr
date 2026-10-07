// neuro section module (key 8): motility, alternate cover test, color/stereo/NPC/NPA/amplitudes.
// Stored as findings with eye_mag form_eye_neuro column names (docs/spec/FIELDS.md).
// Wired into catalog.ts (FIELDS, SEED_DEFAULTS), shorthand/codes.ts (ALIASES) and exam/report.ts (buildReport).
// Rule: import only TYPES from catalog.ts / report.ts here (they import values from this file).
//
// Spec: docs/spec/BEHAVIOR.md §9 (neuro), §13.2 items 3 (motility), 9 (neuro block), 11 (cover test).
import type { Eye, FieldDef, FieldText } from '../catalog.ts';
import type { ReportRow, ReportSection } from '../report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import { english, type Translate } from '#lib/coding/english.ts';

// ---------- motility (§9.1) ----------

/** -1 = up, 0 = level, 1 = down. */
export type GazeV = -1 | 0 | 1;
/** Gaze toward the patient's right or left; null = straight up/down. */
export type GazeH = 'R' | 'L' | null;

export interface MotilityCell {
	id: string;
	eye: 'OD' | 'OS';
	v: GazeV;
	h: GazeH;
}

/**
 * The 16 counters. Cardinal ids are eye_mag's: MOTILITY_<eye><S|I|R|L>. Oblique ids read
 * MOTILITY_<eye><side><S|I>O: the gaze up (S) or down (I) toward the patient's right or left side,
 * e.g. MOTILITY_RRSO = right eye looking up and to the right (our reading of the column names).
 */
export const MOTILITY_CELLS: MotilityCell[] = (['OD', 'OS'] as const).flatMap((eye) => {
	const e = eye === 'OD' ? 'R' : 'L';
	const cells: [string, GazeV, GazeH][] = [
		[`${e}S`, -1, null],
		[`${e}I`, 1, null],
		[`${e}R`, 0, 'R'],
		[`${e}L`, 0, 'L'],
		[`${e}RSO`, -1, 'R'],
		[`${e}LSO`, -1, 'L'],
		[`${e}RIO`, 1, 'R'],
		[`${e}LIO`, 1, 'L']
	];
	return cells.map(([s, v, h]) => ({ id: `MOTILITY_${s}`, eye, v, h }));
});
export const MOTILITY_IDS = MOTILITY_CELLS.map((c) => c.id);
export const MOTILITY_BY_ID = new Map(MOTILITY_CELLS.map((c) => [c.id, c]));

/** The motility cell at a gaze position (both eyes use the same geometry). */
export function motilityCell(eye: 'OD' | 'OS', v: GazeV, h: GazeH): MotilityCell | undefined {
	return MOTILITY_CELLS.find((c) => c.eye === eye && c.v === v && c.h === h);
}

/** "up and out", "in", "down"... Out = temporal: the patient's right for OD, left for OS. */
export function gazeName(c: Pick<MotilityCell, 'eye' | 'v' | 'h'>): string {
	const vert = c.v < 0 ? 'up' : c.v > 0 ? 'down' : '';
	const horiz = c.h ? ((c.h === 'R') === (c.eye === 'OD') ? 'out' : 'in') : '';
	return vert && horiz ? `${vert} and ${horiz}` : vert || horiz;
}

const GAZE_KEY: Record<string, MessageKey> = {
	up: 'sections.gazeUp',
	down: 'sections.gazeDown',
	out: 'sections.gazeOut',
	in: 'sections.gazeIn',
	'up and out': 'sections.gazeUpOut',
	'up and in': 'sections.gazeUpIn',
	'down and out': 'sections.gazeDownOut',
	'down and in': 'sections.gazeDownIn'
};
/** Screen text of gazeName() (D48). */
export function gazeKey(c: Pick<MotilityCell, 'eye' | 'v' | 'h'>): MessageKey {
	return GAZE_KEY[gazeName(c)];
}

/** Horizontal gazes draw vertical hash marks; vertical and oblique gazes draw horizontal ones (§9.1). */
export function hashOrientation(c: Pick<MotilityCell, 'v'>): 'vertical' | 'horizontal' {
	return c.v === 0 ? 'vertical' : 'horizontal';
}

/** A stored counter as 0-4 (blank or junk reads as 0). */
export function motilityCount(value: string | undefined): number {
	const n = Number((value ?? '').trim());
	return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;
}

/** One click: +1 wrapping 4 -> 0 (parity). step -1 is our decrement, wrapping 0 -> 4. */
export function stepCount(value: string | undefined, step: 1 | -1 = 1): string {
	return String((motilityCount(value) + step + 5) % 5);
}

const isOn = (v: string | undefined) => {
	const t = (v ?? '').trim().toLowerCase();
	return t !== '' && t !== '0' && t !== 'off' && t !== 'no';
};

/** Values to write for a click on one cell: that cell only (FIX: its own field), and Normal turns off. */
export function motilityClick(findings: Findings, id: string, step: 1 | -1 = 1): Record<string, string> {
	if (!MOTILITY_BY_ID.has(id)) throw new Error(`not a motility cell: ${id}`);
	return { [id]: stepCount(findings[id]?.value, step), MOTILITYNORMAL: '' };
}

/** A counter set directly (keyboard 0-4); Normal turns off like a click. */
export function motilitySet(id: string, count: number): Record<string, string> {
	if (!MOTILITY_BY_ID.has(id)) throw new Error(`not a motility cell: ${id}`);
	return { [id]: String(Math.max(0, Math.min(4, Math.trunc(count)))), MOTILITYNORMAL: '' };
}

/** Motility Normal (§3.2): all 16 counters to 0 and the flag on. */
export function motilityNormalValues(): Record<string, string> {
	return { MOTILITYNORMAL: 'on', ...Object.fromEntries(MOTILITY_IDS.map((id) => [id, '0'])) };
}

export function motilityIsNormal(findings: Findings): boolean {
	return isOn(findings.MOTILITYNORMAL?.value);
}

// ---------- alternate cover test (§9.2) ----------

export const COVER_ZONES = [
	{ key: 'SCDIST', label: 'sc distance', short: 'sc dist' },
	{ key: 'CCDIST', label: 'cc distance', short: 'cc dist' },
	{ key: 'SCNEAR', label: 'sc near', short: 'sc near' },
	{ key: 'CCNEAR', label: 'cc near', short: 'cc near' }
] as const;
export type CoverZone = (typeof COVER_ZONES)[number]['key'];
export const DEFAULT_COVER_ZONE: CoverZone = 'CCDIST';

/** Cells 1-9 are the 3×3 gaze grid (5 = primary), 10/11 the right/left head tilts. */
export const COVER_POSITIONS = Array.from({ length: 11 }, (_, i) => i + 1);
export const PRIMARY_POSITION = 5;

export function coverId(n: number, zone: CoverZone): string {
	return `ACT${n}${zone}`;
}
export const COVER_IDS = COVER_ZONES.flatMap((z) => COVER_POSITIONS.map((n) => coverId(n, z.key)));

/**
 * Gaze position names. The grid is laid out R / cells / L (§13.2 item 11): column 1 is gaze to
 * the patient's right, column 3 to the left.
 */
export function coverPositionName(n: number): string {
	if (n === 10) return 'right head tilt';
	if (n === 11) return 'left head tilt';
	const row = ['up', '', 'down'][Math.floor((n - 1) / 3)];
	const col = ['right', '', 'left'][(n - 1) % 3];
	if (!row && !col) return 'primary';
	return row && col ? `${row} and ${col}` : row || col;
}

/** Screen text of coverPositionName(n), at index n - 1 (D48). */
export const COVER_POSITION_KEY: readonly MessageKey[] = [
	'sections.coverPosUpRight',
	'sections.coverPosUp',
	'sections.coverPosUpLeft',
	'sections.coverPosRight',
	'sections.coverPosPrimary',
	'sections.coverPosLeft',
	'sections.coverPosDownRight',
	'sections.coverPosDown',
	'sections.coverPosDownLeft',
	'sections.coverPosRightTilt',
	'sections.coverPosLeftTilt'
];
/** Screen labels of COVER_ZONES (D48). */
export const COVER_ZONE_KEY: Record<CoverZone, { label: MessageKey; short: MessageKey }> = {
	SCDIST: { label: 'sections.coverZoneScDist', short: 'sections.coverZoneScDistShort' },
	CCDIST: { label: 'sections.coverZoneCcDist', short: 'sections.coverZoneCcDistShort' },
	SCNEAR: { label: 'sections.coverZoneScNear', short: 'sections.coverZoneScNearShort' },
	CCNEAR: { label: 'sections.coverZoneCcNear', short: 'sections.coverZoneCcNearShort' }
};

export const LATERALITIES = [
	{ key: 'R', label: 'Right' },
	{ key: 'L', label: 'Left' },
	{ key: '', label: 'None' }
] as const;
export type Laterality = (typeof LATERALITIES)[number]['key'];
export const LATERALITY_LABEL_KEY: Record<Laterality, MessageKey> = { R: 'sections.latRight', L: 'sections.latLeft', '': 'sections.latNone' };
export const DEVIATIONS = ['E', 'E(T)', 'ET', 'X', 'X(T)', 'XT', 'HT', 'H(T)', 'hypoT', 'hypo(T)'] as const;
export const PRISMS = ['Ortho', '1', '2', '3', '4', '5', '6', '8', '10', '12', '14', '16', '18', '20', '25', '30', '35', '40'] as const;

/**
 * Builder RECORD text (§9.2): "amount side+deviation", e.g. "10 RHT" or "6 XT".
 * Ortho clears laterality and deviation, so it records just "Ortho".
 */
export function recordCell(laterality: Laterality | string, deviation: string, prism: string): string {
	if (prism === 'Ortho') return 'Ortho';
	const dev = deviation ? `${laterality}${deviation}` : '';
	return [prism, dev].filter(Boolean).join(' ');
}

export function coverIsOrtho(findings: Findings): boolean {
	return isOn(findings.ACT?.value);
}

// ---------- other neuro fields (§9.3) ----------

/** Per-eye measures, in the report's order (§13.2 item 9). `normal` = fixed-value button (§3.2). */
export const NEURO_EYE_ROWS = [
	{ key: 'COLOR', label: 'Color vision', od: 'ODCOLOR', os: 'OSCOLOR', normal: '11/11' },
	{ key: 'REDDESAT', label: 'Red desaturation', od: 'ODREDDESAT', os: 'OSREDDESAT', normal: '100' },
	{ key: 'COINS', label: 'Coins', od: 'ODCOINS', os: 'OSCOINS', normal: '1.00' },
	{ key: 'NPA', label: 'NPA', od: 'ODNPA', os: 'OSNPA', normal: '' }
] as const;

/**
 * Binocular measures. FIELDS.md has four xACC columns plus DIVERGENCEAMPS; we read CACC* as
 * convergence amplitudes (shorthand CAD/CAN), DACC* as accommodation (DAD/DAN), and the single
 * DIVERGENCEAMPS column holds divergence amplitudes for distance and near together.
 */
export const NEURO_PAIRS = [
	{ key: 'ACC', label: 'Accommodation', dist: 'DACCDIST', near: 'DACCNEAR' },
	{ key: 'CONV', label: 'Convergence amplitudes', dist: 'CACCDIST', near: 'CACCNEAR' }
] as const;
export const NEURO_SINGLES = [
	{ id: 'NPC', label: 'NPC', hint: 'near point of convergence' },
	{ id: 'DIVERGENCEAMPS', label: 'Divergence amplitudes', hint: 'dist / near' },
	{ id: 'VERTFUSAMPS', label: 'Vertical fusional amplitudes', hint: '' },
	{ id: 'STEREOPSIS', label: 'Stereopsis', hint: '' }
] as const;

/** Screen labels of NEURO_EYE_ROWS and NEURO_PAIRS by key (D48). */
export const NEURO_ROW_LABEL_KEY: Record<(typeof NEURO_EYE_ROWS)[number]['key'] | (typeof NEURO_PAIRS)[number]['key'], MessageKey> = {
	COLOR: 'sections.neuroColor',
	REDDESAT: 'sections.neuroRedDesat',
	COINS: 'sections.neuroCoins',
	NPA: 'sections.neuroNpa',
	ACC: 'sections.neuroAccommodation',
	CONV: 'sections.neuroConvergence'
};

// ---------- fields ----------

type Spec = [id: string, row: string, eye: Eye, label: string, maxLength: number, expand?: boolean];

// Column types (FIELDS.md): char flags -> 3, motility counters -> 1, unsized varchar -> 50,
// text measurement cells -> 255, comments -> 4000 (as workup.ts caps text columns).
const specs: Spec[] = [
	['MOTILITYNORMAL', 'MOTILITY', 'OU', 'Motility normal', 3],
	...MOTILITY_CELLS.map((c): Spec => [c.id, 'MOTILITY', c.eye, `Motility ${c.eye} ${gazeName(c)}`, 1]),
	['ACT', 'ACT', 'OU', 'Cover test ortho', 3],
	...COVER_ZONES.flatMap((z) =>
		COVER_POSITIONS.map((n): Spec => [coverId(n, z.key), `ACT${z.key}`, 'OU', `Cover test ${z.label} ${coverPositionName(n)}`, 255])
	),
	...NEURO_EYE_ROWS.flatMap((r): Spec[] => {
		const len = r.key === 'REDDESAT' ? 50 : 255;
		return [
			[r.od, r.key, 'OD', `${r.label} OD`, len],
			[r.os, r.key, 'OS', `${r.label} OS`, len]
		];
	}),
	...NEURO_PAIRS.flatMap((p): Spec[] => [
		[p.dist, p.key, 'OU', `${p.label} distance`, 50],
		[p.near, p.key, 'OU', `${p.label} near`, 50]
	]),
	['NPC', 'NPC', 'OU', 'NPC', 50],
	['DIVERGENCEAMPS', 'DIVERGENCEAMPS', 'OU', 'Divergence amplitudes', 255],
	['VERTFUSAMPS', 'VERTFUSAMPS', 'OU', 'Vertical fusional amplitudes', 255],
	['STEREOPSIS', 'STEREOPSIS', 'OU', 'Stereopsis', 50],
	['NEURO_COMMENTS', 'COMMENTS', 'OU', 'Neuro comments', 4000, true]
];

export const NEURO_FIELDS: FieldDef[] = specs.map(([id, row, eye, label, maxLength, expand]) => ({
	id,
	section: 'NEURO',
	row,
	eye,
	label,
	maxLength,
	expand: !!expand
}));

/** Screen labels of NEURO_FIELDS (D48), same English as the labels above. */
export const NEURO_FIELD_TEXT: Record<string, FieldText> = Object.fromEntries([
	['MOTILITYNORMAL', (t) => t('sections.fieldMotilityNormal')],
	...MOTILITY_CELLS.map((c): [string, FieldText] => [c.id, (t) => t('sections.fieldMotility', { eye: c.eye, gaze: t(gazeKey(c)) })]),
	['ACT', (t) => t('sections.fieldCoverOrtho')],
	...COVER_ZONES.flatMap((z) =>
		COVER_POSITIONS.map((n): [string, FieldText] => [
			coverId(n, z.key),
			(t) => t('sections.fieldCoverCell', { zone: t(COVER_ZONE_KEY[z.key].label), position: t(COVER_POSITION_KEY[n - 1]) })
		])
	),
	...NEURO_EYE_ROWS.flatMap((r) =>
		(['OD', 'OS'] as const).map((e): [string, FieldText] => [e === 'OD' ? r.od : r.os, (t) => t('sections.neuroEyeCell', { label: t(NEURO_ROW_LABEL_KEY[r.key]), eye: e })])
	),
	...NEURO_PAIRS.flatMap((p): [string, FieldText][] => [
		[p.dist, (t) => t('sections.neuroPairDistance', { label: t(NEURO_ROW_LABEL_KEY[p.key]) })],
		[p.near, (t) => t('sections.neuroPairNear', { label: t(NEURO_ROW_LABEL_KEY[p.key]) })]
	]),
	['NPC', (t) => t('sections.neuroNpc')],
	['DIVERGENCEAMPS', (t) => t('sections.neuroDivergence')],
	['VERTFUSAMPS', (t) => t('sections.neuroVertFusional')],
	['STEREOPSIS', (t) => t('sections.neuroStereopsis')],
	['NEURO_COMMENTS', (t) => t('sections.neuroComments')]
] as [string, FieldText][]);

/**
 * Shorthand code -> field ids (SHORTHAND.md neuro rows, checked against FIELDS.md). Every field id
 * above is already a code (e.g. ACT5CCDIST:4 XT). Corrections and additions:
 * - RNPC/LNPC: the original targets ODNPC/OSNPC, which do not exist; NPC is one field.
 * - SCDIST/CCDIST/SCNEAR/CCNEAR only switched the cover-test tab in the original; here they write
 *   that tab's primary cell, so "CCDIST:6 XT" works from the shorthand bar.
 * - Both-eye forms (COL, COINS, RED, NPA and their B- spellings) follow the other sections.
 */
export const NEURO_ALIASES: Record<string, string[]> = {
	RCOL: ['ODCOLOR'],
	RCOLOR: ['ODCOLOR'],
	LCOL: ['OSCOLOR'],
	LCOLOR: ['OSCOLOR'],
	COL: ['ODCOLOR', 'OSCOLOR'],
	COLOR: ['ODCOLOR', 'OSCOLOR'],
	BCOL: ['ODCOLOR', 'OSCOLOR'],
	BCOLOR: ['ODCOLOR', 'OSCOLOR'],
	RCOIN: ['ODCOINS'],
	RCOINS: ['ODCOINS'],
	LCOIN: ['OSCOINS'],
	LCOINS: ['OSCOINS'],
	COIN: ['ODCOINS', 'OSCOINS'],
	COINS: ['ODCOINS', 'OSCOINS'],
	BCOIN: ['ODCOINS', 'OSCOINS'],
	BCOINS: ['ODCOINS', 'OSCOINS'],
	RRED: ['ODREDDESAT'],
	LRED: ['OSREDDESAT'],
	RED: ['ODREDDESAT', 'OSREDDESAT'],
	BRED: ['ODREDDESAT', 'OSREDDESAT'],
	RNPC: ['NPC'],
	LNPC: ['NPC'],
	RNPA: ['ODNPA'],
	LNPA: ['OSNPA'],
	NPA: ['ODNPA', 'OSNPA'],
	BNPA: ['ODNPA', 'OSNPA'],
	STEREO: ['STEREOPSIS'],
	VERTFUS: ['VERTFUSAMPS'],
	CAD: ['CACCDIST'],
	CAN: ['CACCNEAR'],
	DAD: ['DACCDIST'],
	DAN: ['DACCNEAR'],
	NCOM: ['NEURO_COMMENTS'],
	SCDIST: [coverId(PRIMARY_POSITION, 'SCDIST')],
	CCDIST: [coverId(PRIMARY_POSITION, 'CCDIST')],
	SCNEAR: [coverId(PRIMARY_POSITION, 'SCNEAR')],
	CCNEAR: [coverId(PRIMARY_POSITION, 'CCNEAR')]
};

/**
 * Starter "normal" values (spec §3.1). The general seed list has no motility/cover-test rows, but
 * eye_mag's form_eye_neuro columns default MOTILITYNORMAL and ACT to 'on' with the counters at 0,
 * so a normal exam starts there. Color, red desaturation and coins stay out: filling them on every
 * "Defaults" would document tests that were not done; they keep their one-tap normal buttons.
 */
// The cover test is not defaulted: "D" would otherwise print "orthophoric" for visits where no cover test was done.
export const NEURO_DEFAULTS: Record<string, string> = motilityNormalValues();

// ---------- report (§13.2 items 3, 9, 11) ----------

export interface NeuroReport {
	/** Motility, printed in the exam summary strip after the workup (§13.2 item 3). */
	strip: ReportSection[];
	/** Neuro rows appended to "Additional findings" (§13.2 item 9). */
	additional: ReportRow[];
	/** Cover test and motility both normal: "orthophoric" beside the Additional findings heading. */
	orthophoric: boolean;
	/** Alternate cover test grids and neuro comments, printed after Retina (§13.2 item 11). */
	after: ReportSection[];
}

/** Headings and labels in `t`'s language (D48); `title` / `label` stay English, values print as recorded. */
export function neuroReport(findings: Findings, t: Translate = english): NeuroReport {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	const strip: ReportSection[] = [];
	const after: ReportSection[] = [];

	// Motility: "D&V full OU" when Normal; else two 3×3 grids when any counter is above 0.
	if (motilityIsNormal(findings)) {
		strip.push({ title: 'Motility', titleText: { key: 'sections.motility' }, rows: [], comments: '', summary: t('report.motilityFullOu') });
	} else if (MOTILITY_IDS.some((id) => motilityCount(v(id)) > 0)) {
		const n = (eye: 'OD' | 'OS', gv: GazeV, h: GazeH) => {
			const c = motilityCell(eye, gv, h);
			return c ? String(motilityCount(v(c.id))) : '';
		};
		// FIX: every cell reads its own counter, so the OS bottom row is LRIO, LI, LLIO.
		const line = (label: MessageKey, gv: GazeV) => [
			t(label),
			...(['OD', 'OS'] as const).flatMap((eye) => [n(eye, gv, 'R'), gv === 0 ? '' : n(eye, gv, null), n(eye, gv, 'L')])
		];
		strip.push({
			title: 'Motility',
			titleText: { key: 'sections.motility' },
			rows: [],
			comments: '',
			table: {
				head: ['', ...(['OD', 'OS'] as const).flatMap((eye) => [t('report.motRightGaze', { eye }), t('report.motUpDown', { eye }), t('report.motLeftGaze', { eye })])],
				body: [line('sections.coverRowUp', -1), line('report.motLevel', 0), line('sections.coverRowDown', 1)]
			}
		});
	}

	// Neuro block in Additional findings, each row only when filled (FIX: NPC and amplitudes print).
	const additional: ReportRow[] = NEURO_EYE_ROWS.map((r) => ({ label: r.label, labelText: { key: NEURO_ROW_LABEL_KEY[r.key] }, od: v(r.od), os: v(r.os) })).filter(
		(r) => r.od || r.os
	);
	// Binocular measures have no per-eye value: the value goes in the label, OD/OS left blank.
	// Only the English is in `label`; labelText carries the name in the reader's language.
	const single = (label: string, key: MessageKey, value: string, shown = value) => {
		if (value) additional.push({ label: `${label}: ${value}`, labelText: { key: 'report.measureValue', params: { label: t(key), value: shown } }, od: '', os: '' });
	};
	single('NPC', 'sections.neuroNpc', v('NPC'));
	for (const p of NEURO_PAIRS) {
		const parts = [v(p.dist) && `distance ${v(p.dist)}`, v(p.near) && `near ${v(p.near)}`].filter(Boolean);
		const shown = [v(p.dist) && t('report.pairDistance', { value: v(p.dist) }), v(p.near) && t('report.pairNear', { value: v(p.near) })].filter(Boolean);
		single(p.label, NEURO_ROW_LABEL_KEY[p.key], parts.join(', '), shown.join(', '));
	}
	single('Divergence amplitudes', 'sections.neuroDivergence', v('DIVERGENCEAMPS'));
	single('Vertical fusional amplitudes', 'sections.neuroVertFusional', v('VERTFUSAMPS'));
	single('Stereopsis', 'sections.neuroStereopsis', v('STEREOPSIS'));

	// Alternate cover test: only when not Ortho; a grid per tab whose primary cell is filled.
	if (!coverIsOrtho(findings)) {
		for (const z of COVER_ZONES) {
			if (!v(coverId(PRIMARY_POSITION, z.key))) continue;
			const c = (n: number) => v(coverId(n, z.key));
			const body = [
				[t('sections.coverRowUp'), c(1), c(2), c(3)],
				[t('sections.coverRowPrimary'), c(4), c(5), c(6)],
				[t('sections.coverRowDown'), c(7), c(8), c(9)]
			];
			if (c(10) || c(11)) body.push([t('report.coverHeadTilt'), c(10), '', c(11)]);
			after.push({
				title: `Alternate cover test, ${z.label}`,
				titleText: { key: 'report.sectionCoverTest', params: { zone: t(COVER_ZONE_KEY[z.key].label) } },
				rows: [],
				comments: '',
				table: { head: ['', t('report.coverRight'), t('report.coverCenter'), t('report.coverLeft')], body }
			});
		}
	}
	// FIX: neuro comments print whatever the cover-test state.
	if (v('NEURO_COMMENTS')) after.push({ title: 'Neuro', titleText: { key: 'report.drawingNeuro' }, rows: [], comments: v('NEURO_COMMENTS') });

	return {
		strip,
		additional,
		orthophoric: coverIsOrtho(findings) && motilityIsNormal(findings),
		after
	};
}

/**
 * Whether to suggest 92060 (sensorimotor exam), with the §9.4 FIX: stereopsis plus a multi-position
 * deviation measurement (a non-primary cover-test cell, or two or more cover-test tabs measured).
 * Advisory only; the coding panel (phase 5) shows it with an include checkbox.
 */
export function sensorimotorSuggested(findings: Findings): boolean {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	if (!v('STEREOPSIS')) return false;
	const nonPrimary = COVER_ZONES.some((z) => COVER_POSITIONS.some((n) => n !== PRIMARY_POSITION && v(coverId(n, z.key))));
	const tabs = COVER_ZONES.filter((z) => COVER_POSITIONS.some((n) => v(coverId(n, z.key)))).length;
	return nonPrimary || tabs >= 2;
}
