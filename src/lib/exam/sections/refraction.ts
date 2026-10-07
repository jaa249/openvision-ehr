// refraction section module: fields, shorthand codes, defaults and report output for this part of the exam.
// Wired into catalog.ts (FIELDS, SEED_DEFAULTS), shorthand/codes.ts (ALIASES) and exam/report.ts (buildReport).
// Rule: import only TYPES from catalog.ts / report.ts here (they import values from this file).
// workup.ts imports REFRACTION_FIELDS (to skip ids defined here), so this file must not import workup.ts.
//
// Spec: docs/spec/BEHAVIOR.md §1.5 (panels), §8.7 (formatting, transpose), §12 (Rx printing), §13.2 item 5 (report).
// Pure functions only: the exam panel, the Rx print page and the server all share them.
import type { FieldDef, FieldText } from '../catalog.ts';
import type { ReportSection, ReportText } from '../report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import { english, type Translate } from '#lib/coding/english.ts';

type EyeSide = 'OD' | 'OS';

// ---------- sources and columns ----------

/** Where a refraction comes from: current glasses slot 1-5 (W), manifest, cycloplegic, autorefraction, contact lens. */
export type RxSource = 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'MR' | 'CR' | 'AR' | 'CTL';
export type RxKind = 'W' | 'MR' | 'CR' | 'AR' | 'CTL';
export const W_SLOTS = [1, 2, 3, 4, 5] as const;
export const RX_SOURCES: RxSource[] = ['W1', 'W2', 'W3', 'W4', 'W5', 'MR', 'CR', 'AR', 'CTL'];

export function isRxSource(s: unknown): s is RxSource {
	return typeof s === 'string' && (RX_SOURCES as string[]).includes(s);
}
export function kindOf(source: RxSource): RxKind {
	return source.startsWith('W') ? 'W' : (source as RxKind);
}
export function slotOf(source: RxSource): number | null {
	return source.startsWith('W') ? Number(source.slice(1)) : null;
}

/** Per-eye columns. */
export type EyeCol =
	| 'SPH'
	| 'CYL'
	| 'AXIS'
	| 'VA'
	| 'MIDADD'
	| 'ADD'
	| 'NEARVA'
	| 'PRISM'
	| 'BASE'
	| 'HPD'
	| 'HBASE'
	| 'VPD'
	| 'VBASE'
	| 'SLABOFF'
	| 'VERTEXDIST'
	| 'MPDD'
	| 'MPDN'
	| 'BC'
	| 'DIAM'
	| 'MANUFACTURER'
	| 'SUPPLIER'
	| 'BRAND';
/** One value for both eyes. */
export type OuCol = 'BPDD' | 'BPDN' | 'LENS_MATERIAL' | 'LENS_TREATMENTS' | 'RX_TYPE' | 'COMMENTS' | 'BALANCED' | 'WETTYPE';

const W_EYE: EyeCol[] = ['SPH', 'CYL', 'AXIS', 'VA', 'MIDADD', 'ADD', 'NEARVA', 'HPD', 'HBASE', 'VPD', 'VBASE', 'SLABOFF', 'VERTEXDIST', 'MPDD', 'MPDN'];
const W_OU: OuCol[] = ['BPDD', 'BPDN', 'LENS_MATERIAL', 'LENS_TREATMENTS', 'RX_TYPE', 'COMMENTS'];

export const SOURCE_COLS: Record<RxKind, { eye: EyeCol[]; ou: OuCol[] }> = {
	W: { eye: W_EYE, ou: W_OU },
	MR: { eye: ['SPH', 'CYL', 'AXIS', 'VA', 'ADD', 'NEARVA', 'PRISM', 'BASE'], ou: ['BALANCED', 'COMMENTS'] },
	CR: { eye: ['SPH', 'CYL', 'AXIS', 'VA'], ou: ['WETTYPE', 'COMMENTS'] },
	AR: { eye: ['SPH', 'CYL', 'AXIS', 'VA', 'ADD', 'NEARVA', 'PRISM'], ou: ['COMMENTS'] },
	CTL: { eye: ['SPH', 'CYL', 'AXIS', 'BC', 'DIAM', 'ADD', 'VA', 'MANUFACTURER', 'SUPPLIER', 'BRAND'], ou: ['COMMENTS'] }
};

/**
 * Field id for a per-eye value. eye_mag column names (docs/spec/FIELDS.md):
 * MR/CR/AR/CTL live in form_eye_refraction + form_eye_acuity (MRODSPH, ARNEARODVA, CTLBRANDOD...).
 * Wearing Rx rows (form_eye_mag_wearing, one row per RX_NUMBER) become COLUMN_n (ODSPH_1 ... ODSPH_5),
 * except slot 1's acuities, which are the acuity-table cc columns ODVA / WODVANEAR so the Vision strip mirrors them.
 */
export function eyeId(source: RxSource, col: EyeCol, eye: EyeSide): string {
	const slot = slotOf(source);
	if (slot) {
		if (col === 'VA') return slot === 1 ? `${eye}VA` : `${eye}VA_${slot}`;
		if (col === 'NEARVA') return slot === 1 ? (eye === 'OD' ? 'WODVANEAR' : 'OSVANEARCC') : `${eye}NEARVA_${slot}`;
		return `${eye}${col}_${slot}`;
	}
	if (col === 'NEARVA') return `${source}NEAR${eye}VA`;
	if (col === 'MANUFACTURER' || col === 'SUPPLIER' || col === 'BRAND') return `CTL${col}${eye}`;
	return `${source}${eye}${col}`;
}

/** Field id for a value shared by both eyes. MR and AR get their own comments (spec §12.2 FIX). */
export function ouId(source: RxSource, col: OuCol): string {
	const slot = slotOf(source);
	if (slot) return `${col}_${slot}`;
	if (col === 'COMMENTS') return source === 'CTL' ? 'CTL_COMMENTS' : `${source}COMMENTS`;
	return col; // BALANCED, WETTYPE
}

/** Every field id a source owns (both eyes + shared). */
export function sourceFieldIds(source: RxSource): string[] {
	const c = SOURCE_COLS[kindOf(source)];
	return [...c.eye.flatMap((col) => [eyeId(source, col, 'OD'), eyeId(source, col, 'OS')]), ...c.ou.map((col) => ouId(source, col))];
}

const SOURCE_LABEL: Record<RxKind, string> = { W: 'Glasses', MR: 'MR', CR: 'CR', AR: 'AR', CTL: 'CTL' };
export function sourceLabel(source: RxSource): string {
	const slot = slotOf(source);
	return slot ? `Glasses #${slot}` : SOURCE_LABEL[kindOf(source)];
}

export const COL_LABEL: Record<EyeCol | OuCol, string> = {
	SPH: 'sphere',
	CYL: 'cylinder',
	AXIS: 'axis',
	VA: 'VA',
	MIDADD: 'mid ADD',
	ADD: 'ADD',
	NEARVA: 'near VA',
	PRISM: 'prism',
	BASE: 'prism base',
	HPD: 'horizontal prism',
	HBASE: 'horizontal prism base',
	VPD: 'vertical prism',
	VBASE: 'vertical prism base',
	SLABOFF: 'slab-off',
	VERTEXDIST: 'vertex distance',
	MPDD: 'PD distance',
	MPDN: 'PD near',
	BC: 'base curve',
	DIAM: 'diameter',
	MANUFACTURER: 'manufacturer',
	SUPPLIER: 'supplier',
	BRAND: 'brand',
	BPDD: 'binocular PD distance',
	BPDN: 'binocular PD near',
	LENS_MATERIAL: 'lens material',
	LENS_TREATMENTS: 'lens treatments',
	RX_TYPE: 'Rx type',
	COMMENTS: 'comments',
	BALANCED: 'balanced',
	WETTYPE: 'cycloplegic method'
};

/** Screen text of COL_LABEL (D48), lower case like the English, for "{source} {column} {eye}" labels. */
export const COL_LABEL_KEY: Record<EyeCol | OuCol, MessageKey> = {
	SPH: 'sections.rxColSphere',
	CYL: 'sections.rxColCylinder',
	AXIS: 'sections.rxColAxis',
	VA: 'sections.rxColVa',
	MIDADD: 'sections.rxColMidAdd',
	ADD: 'sections.rxColAdd',
	NEARVA: 'sections.rxColNearVa',
	PRISM: 'sections.rxColPrism',
	BASE: 'sections.rxColPrismBase',
	HPD: 'sections.rxColHPrism',
	HBASE: 'sections.rxColHPrismBase',
	VPD: 'sections.rxColVPrism',
	VBASE: 'sections.rxColVPrismBase',
	SLABOFF: 'sections.rxColSlabOff',
	VERTEXDIST: 'sections.rxColVertex',
	MPDD: 'sections.rxColPdDistance',
	MPDN: 'sections.rxColPdNear',
	BC: 'sections.rxColBaseCurve',
	DIAM: 'sections.rxColDiameter',
	MANUFACTURER: 'sections.rxColManufacturer',
	SUPPLIER: 'sections.rxColSupplier',
	BRAND: 'sections.rxColBrand',
	BPDD: 'sections.rxColBinPdDistance',
	BPDN: 'sections.rxColBinPdNear',
	LENS_MATERIAL: 'sections.rxColLensMaterial',
	LENS_TREATMENTS: 'sections.rxColLensTreatments',
	RX_TYPE: 'sections.rxColRxType',
	COMMENTS: 'sections.rxColComments',
	BALANCED: 'sections.rxColBalanced',
	WETTYPE: 'sections.rxColWetType'
};

const MAXLEN: Record<EyeCol | OuCol, number> = {
	SPH: 10,
	CYL: 10,
	AXIS: 10,
	VA: 25,
	MIDADD: 10,
	ADD: 10,
	NEARVA: 25,
	PRISM: 20,
	BASE: 20,
	HPD: 20,
	HBASE: 20,
	VPD: 20,
	VBASE: 20,
	SLABOFF: 20,
	VERTEXDIST: 20,
	MPDD: 20,
	MPDN: 20,
	BC: 25,
	DIAM: 25,
	MANUFACTURER: 50,
	SUPPLIER: 50,
	BRAND: 50,
	BPDD: 20,
	BPDN: 20,
	LENS_MATERIAL: 40,
	LENS_TREATMENTS: 200,
	RX_TYPE: 1,
	COMMENTS: 2000,
	BALANCED: 2,
	WETTYPE: 10
};

/**
 * Acuity columns the Vision strip (workup.ts) defines and shows too: MR/AR/CR/CTL VA and glasses #1 VA.
 * They are mirrored here (same field id) but owned there, so the catalog never lists an id twice.
 */
const SHARED_WITH_VISION = new Set(
	(['OD', 'OS'] as const).flatMap((e) => [
		eyeId('MR', 'VA', e),
		eyeId('MR', 'NEARVA', e),
		eyeId('AR', 'VA', e),
		eyeId('AR', 'NEARVA', e),
		eyeId('CR', 'VA', e),
		eyeId('CTL', 'VA', e),
		eyeId('W1', 'VA', e),
		eyeId('W1', 'NEARVA', e)
	])
);

function buildFields(): FieldDef[] {
	const out: FieldDef[] = [];
	for (const source of RX_SOURCES) {
		const c = SOURCE_COLS[kindOf(source)];
		for (const col of c.eye) {
			for (const eye of ['OD', 'OS'] as const) {
				const id = eyeId(source, col, eye);
				if (SHARED_WITH_VISION.has(id)) continue;
				out.push({ id, section: 'REFRACTION', row: source, eye, label: `${sourceLabel(source)} ${COL_LABEL[col]} ${eye}`, maxLength: MAXLEN[col], expand: false });
			}
		}
		for (const col of c.ou) {
			out.push({ id: ouId(source, col), section: 'REFRACTION', row: source, eye: 'OU', label: `${sourceLabel(source)} ${COL_LABEL[col]}`, maxLength: MAXLEN[col], expand: false });
		}
	}
	return out;
}

export const REFRACTION_FIELDS: FieldDef[] = buildFields();

/** Screen labels of REFRACTION_FIELDS (D48): "Glasses #2 sphere OD"; MR, CR, AR and CTL stay as written. */
export const REFRACTION_FIELD_TEXT: Record<string, FieldText> = Object.fromEntries(
	REFRACTION_FIELDS.map((f): [string, FieldText] => {
		const source = f.row as RxSource;
		const slot = slotOf(source);
		const src = (t: Parameters<FieldText>[0]) => (slot ? t('sections.rxGlassesN', { n: slot }) : sourceLabel(source));
		const c = SOURCE_COLS[kindOf(source)];
		if (f.eye === 'OU') {
			const col = c.ou.find((x) => ouId(source, x) === f.id)!;
			return [f.id, (t) => t('sections.rxOuLabel', { source: src(t), column: t(COL_LABEL_KEY[col]) })];
		}
		const eye = f.eye as EyeSide;
		const col = c.eye.find((x) => eyeId(source, x, eye) === f.id)!;
		return [f.id, (t) => t('sections.rxCellLabel', { source: src(t), column: t(COL_LABEL_KEY[col]), eye })];
	})
);

/** Shorthand code -> field ids (codes are upper-case). Every field id is already a code; these are short extras. */
export const REFRACTION_ALIASES: Record<string, string[]> = {
	MRCOM: ['MRCOMMENTS'],
	ARCOM: ['ARCOMMENTS'],
	CRCOM: ['CRCOMMENTS'],
	CTLCOM: ['CTL_COMMENTS'],
	WCOM: ['COMMENTS_1']
};

/** No starter "normal" values: a refraction is always measured (spec §3.1). */
export const REFRACTION_DEFAULTS: Record<string, string> = {};

// ---------- option lists (our own short lists; clean room) ----------

/** Stored 0-3 (spec §1.5). */
export const RX_TYPES = ['Single vision', 'Bifocal', 'Trifocal', 'Progressive'] as const;
/** Screen labels of RX_TYPES, same order (D48). The stored value is the index. */
export const RX_TYPE_LABEL_KEY: readonly MessageKey[] = ['sections.rxTypeSingle', 'sections.rxTypeBifocal', 'sections.rxTypeTrifocal', 'sections.rxTypeProgressive'];
export const LENS_MATERIALS = ['CR-39 plastic', 'Polycarbonate', 'Trivex', 'High-index 1.60', 'High-index 1.67', 'High-index 1.74', 'Glass'];
export const LENS_TREATMENTS = ['Anti-reflective', 'Scratch-resistant', 'UV protection', 'Photochromic', 'Blue-light filter', 'Tint'];
export const CTL_MANUFACTURERS = ['Alcon', 'Bausch + Lomb', 'CooperVision', 'Johnson & Johnson Vision'];
export const CTL_SUPPLIERS = ['ABB Optical', 'Direct from manufacturer', 'Local distributor'];
export const CTL_BRANDS = ['Daily disposable sphere', 'Daily disposable toric', 'Monthly silicone hydrogel', 'Monthly toric', 'Multifocal', 'Rigid gas permeable'];
export const WET_METHODS = ['Streak', 'Auto', 'Manual'];
export const H_BASES = ['BI', 'BO'];
export const V_BASES = ['BU', 'BD'];

/** Lens treatments are stored pipe-separated (spec §1.5). */
export const splitList = (v: string): string[] => v.split('|').map((s) => s.trim()).filter(Boolean);

// ---------- formatting (spec §8.7) ----------

export type CylSign = '+' | '-';
export type PowerKind = 'sph' | 'cyl' | 'add';

export interface Formatted {
	value: string;
	/** False when the value could not be read as a 0.25-step power; it is kept as typed. */
	ok: boolean;
	/** The sign the user typed, if any (an explicit cylinder sign updates the convention). */
	signTyped: '' | CylSign;
}

const QUARTER_ENDINGS = new Set(['00', '25', '50', '75']);

/**
 * Formats a sphere, cylinder or ADD to a signed two-decimal power.
 * "1" -> +1.00; "125" / "1.25" -> +1.25; "25" -> +0.25 (FIX: cylinder too); ".2"/".7" endings -> .25/.75;
 * "plano"/"pl"/0 sphere -> PLANO; "sph"/"ds"/0 cylinder -> SPH; ADD is always plus; "=" counts as "+".
 */
export function formatPower(raw: string, kind: PowerKind, cylSign: CylSign = '+'): Formatted {
	const s = raw.trim().replace(/−/g, '-').replace(/=/g, '+').replace(/\s+/g, '');
	if (!s) return { value: '', ok: true, signTyped: '' };
	if (kind === 'sph' && /^(pl|pln|plano)$/i.test(s)) return { value: 'PLANO', ok: true, signTyped: '' };
	if (kind === 'cyl' && /^(sph|ds|sphere)$/i.test(s)) return { value: 'SPH', ok: true, signTyped: '' };
	const m = s.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
	if (!m || (!m[2] && !m[3])) return { value: raw.trim().toUpperCase(), ok: false, signTyped: '' };
	const typed = m[1] as '' | CylSign;
	let whole = m[2] || '0';
	let frac = m[3];
	let ok = true;
	if (frac === undefined) {
		// No decimal point: the last two digits are the decimals ("125" -> 1.25), when they make a quarter step.
		if (whole.length >= 2 && QUARTER_ENDINGS.has(whole.slice(-2))) {
			frac = whole.slice(-2);
			whole = whole.slice(0, -2) || '0';
		} else frac = '00';
	} else if (frac.length === 0) frac = '00';
	else if (frac.length === 1) frac = ({ '0': '00', '2': '25', '5': '50', '7': '75' } as Record<string, string>)[frac] ?? frac + '0';
	if (!QUARTER_ENDINGS.has(frac)) ok = false;
	const num = Number(`${whole}.${frac}`);
	const text = `${Number(whole)}.${frac}`;
	if (num === 0) {
		if (kind === 'sph') return { value: 'PLANO', ok: true, signTyped: typed };
		if (kind === 'cyl') return { value: 'SPH', ok: true, signTyped: typed };
	}
	const sign: CylSign = kind === 'add' ? '+' : typed || (kind === 'cyl' ? cylSign : '+');
	return { value: `${sign}${text}`, ok, signTyped: typed };
}

/** Number value of a stored power: PLANO = 0; SPH / blank / text = null. */
export function powerValue(v: string): number | null {
	const s = v.trim().toUpperCase();
	if (s === 'PLANO') return 0;
	if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
	return Number(s);
}

/** A real (non-zero, numeric) cylinder. */
export function isRealCyl(v: string): boolean {
	const n = powerValue(v);
	return n !== null && n !== 0;
}

export function isQuarterStep(v: string): boolean {
	const n = powerValue(v);
	return n === null || Number.isInteger(Math.round(n * 1000) / 250);
}

/**
 * Axis: whole degrees 1-180, zero-padded to three digits. 0 -> 180; 181-360 -> the same meridian (minus 180).
 * Anything else is kept as typed (ok: false).
 */
export function formatAxis(raw: string): { value: string; ok: boolean } {
	const s = raw.trim().replace(/°/g, '');
	if (!s) return { value: '', ok: true };
	if (!/^\d{1,3}$/.test(s)) return { value: raw.trim(), ok: false };
	let n = Number(s);
	if (n > 360) return { value: s, ok: false };
	if (n === 0) n = 180;
	else if (n > 180) n -= 180;
	return { value: String(n).padStart(3, '0'), ok: true };
}

/** Prism and PD: uppercased (spec §8.7). */
export const formatUpper = (raw: string): string => raw.trim().toUpperCase();

const fmtSigned = (hundredths: number): string => {
	const sign = hundredths < 0 ? '-' : '+';
	const a = Math.abs(hundredths);
	return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};

export interface SphCylAxis {
	sph: string;
	cyl: string;
	axis: string;
}

/** A sphere for transposing: PLANO / PL / PLN / 0 = 0, a number = itself; blank or text = null. */
function sphereValue(v: string): number | null {
	return /^(pl|pln|plano)$/i.test(v.trim()) ? 0 : powerValue(v);
}

/**
 * Why a row cannot be transposed, or null when it can: 'cyl' = no real cylinder (nothing to do),
 * 'sph' = the sphere is blank or not a number, 'axis' = the axis is blank or not 1-180.
 * A blank sphere is never read as plano and a blank axis is never kept: either would put values in
 * the record that nobody measured (the sphere 0, or an axis 90 degrees from the one meant).
 */
export function transposeProblem(r: SphCylAxis): 'cyl' | 'sph' | 'axis' | null {
	if (!isRealCyl(r.cyl)) return 'cyl';
	if (sphereValue(r.sph) === null) return 'sph';
	const ax = formatAxis(r.axis);
	if (!ax.ok || !ax.value) return 'axis';
	return null;
}

/**
 * Plus/minus cylinder transposition (spec §8.7): sphere + cylinder, negated cylinder, axis ±90
 * (FIX: add 90 at 90 or less, otherwise subtract, so 90 -> 180). Returns null when the row cannot be
 * transposed (transposeProblem says why): no cylinder, or a blank sphere or axis (enter PLANO for a
 * zero sphere).
 */
export function transpose(r: SphCylAxis): SphCylAxis | null {
	if (transposeProblem(r)) return null;
	const sH = Math.round(sphereValue(r.sph)! * 100);
	const cH = Math.round(powerValue(r.cyl)! * 100);
	const nS = sH + cH;
	const a = Number(formatAxis(r.axis).value);
	const axis = String(a <= 90 ? a + 90 : a - 90).padStart(3, '0');
	return { sph: nS === 0 ? 'PLANO' : fmtSigned(nS), cyl: -cH === 0 ? 'SPH' : fmtSigned(-cH), axis };
}

// ---------- Rx for printing (spec §12.2) ----------

/** Dispense record value keys (form_eye_mag_dispense column names, plus prism per FIX §12.5). */
export const DISPENSE_KEYS: Record<string, number> = (() => {
	const keys: Record<string, number> = {};
	const perEye: [string, number][] = [
		['SPH', 10],
		['CYL', 10],
		['AXIS', 10],
		['MIDADD', 10],
		['ADD', 10],
		['PRISM', 30],
		['HPD', 20],
		['HBASE', 20],
		['VPD', 20],
		['VBASE', 20],
		['SLABOFF', 20],
		['VERTEXDIST', 20],
		['MPDD', 20],
		['MPDN', 20],
		['BC', 25],
		['DIAM', 25],
		['VA', 25]
	];
	for (const e of ['OD', 'OS']) {
		for (const [c, n] of perEye) keys[`${e}${c}`] = n;
		keys[`CTLMANUFACTURER${e}`] = 50;
		keys[`CTLSUPPLIER${e}`] = 50;
		keys[`CTLBRAND${e}`] = 50;
		keys[`CTL${e}QUANTITY`] = 50;
	}
	keys.BPDD = 20;
	keys.BPDN = 20;
	keys.LENS_MATERIAL = 40;
	keys.LENS_TREATMENTS = 200;
	keys.COMMENTS = 2000;
	return keys;
})();

export type RxValues = Record<string, string>;

export interface RxData {
	source: RxSource;
	kind: RxKind;
	/** '' or '0'-'3' (RX_TYPES index). */
	rxType: string;
	values: RxValues;
}

/** "31.5" + "32" -> "63.5" (FIX: decimal sum, not truncated). '' unless both are numbers. */
export function sumPd(a: string, b: string): string {
	const x = Number(a.trim());
	const y = Number(b.trim());
	if (!a.trim() || !b.trim() || !Number.isFinite(x) || !Number.isFinite(y)) return '';
	return String(Math.round((x + y) * 100) / 100);
}

/** The values a source prints and dispenses (spec §12.2 with its FIXes: own comments, ADD for AR/MR, prism). */
export function rxFromFindings(findings: Findings, source: RxSource): RxData {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	const kind = kindOf(source);
	const cols = SOURCE_COLS[kind];
	const out: RxValues = {};
	for (const e of ['OD', 'OS'] as const) {
		for (const col of ['SPH', 'CYL', 'AXIS', 'ADD', 'MIDADD', 'HPD', 'HBASE', 'VPD', 'VBASE', 'SLABOFF', 'VERTEXDIST', 'MPDD', 'MPDN', 'BC', 'DIAM'] as EyeCol[]) {
			if (cols.eye.includes(col)) out[`${e}${col}`] = v(eyeId(source, col, e));
		}
		if (kind === 'MR') out[`${e}PRISM`] = [v(eyeId(source, 'PRISM', e)), v(eyeId(source, 'BASE', e))].filter(Boolean).join(' ');
		if (kind === 'AR') out[`${e}PRISM`] = v(eyeId(source, 'PRISM', e));
		if (kind === 'CTL') {
			out[`${e}VA`] = v(eyeId(source, 'VA', e));
			for (const c of ['MANUFACTURER', 'SUPPLIER', 'BRAND'] as const) out[`CTL${c}${e}`] = v(eyeId(source, c, e));
			out[`CTL${e}QUANTITY`] = '';
		}
		// PD comes from the measured PD (Additional data) when the source has none of its own.
		if (kind !== 'W' && kind !== 'CTL') out[`${e}MPDD`] = v(e === 'OD' ? 'ODPDMeasured' : 'OSPDMeasured');
	}
	if (kind === 'W') {
		out.BPDD = v(ouId(source, 'BPDD'));
		out.BPDN = v(ouId(source, 'BPDN'));
		out.LENS_MATERIAL = v(ouId(source, 'LENS_MATERIAL'));
		out.LENS_TREATMENTS = v(ouId(source, 'LENS_TREATMENTS'));
	}
	if (kind !== 'CTL') {
		if (!out.BPDD) out.BPDD = sumPd(out.ODMPDD ?? '', out.OSMPDD ?? '');
		if (!out.BPDN) out.BPDN = sumPd(out.ODMPDN ?? '', out.OSMPDN ?? '');
	}
	out.COMMENTS = v(ouId(source, 'COMMENTS'));
	for (const k of Object.keys(out)) if (!out[k]) delete out[k];
	let rxType = '';
	if (kind === 'W') rxType = /^[0-3]$/.test(v(ouId(source, 'RX_TYPE'))) ? v(ouId(source, 'RX_TYPE')) : '';
	// Original defaults MR/AR to Bifocal; we only say Bifocal when there is an ADD to make one.
	else if (kind === 'MR' || kind === 'AR') rxType = out.ODADD || out.OSADD ? '1' : '0';
	return { source, kind, rxType, values: out };
}

// ---------- expiry (spec §12.3) ----------

/** yyyy-mm-dd plus whole months; the day is clamped to the month's end (Feb 29 + 1 year -> Feb 28). */
export function addMonths(date: string, months: number): string {
	const [y, m, d] = date.slice(0, 10).split('-').map(Number);
	const total = y * 12 + (m - 1) + months;
	const ny = Math.floor(total / 12);
	const nm = (total % 12) + 1;
	const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
	return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Spectacles: exam date + 1 year. Contact lenses: exam date + 6 months. */
export function rxExpiry(examDate: string, source: RxSource): string {
	return addMonths(examDate, kindOf(source) === 'CTL' ? 6 : 12);
}

export const METHOD_LABEL: Record<RxKind, string> = {
	W: 'Current glasses (duplicate of the Rx being worn)',
	MR: 'Manifest (dry)',
	CR: 'Cycloplegic (wet)',
	AR: 'Autorefraction',
	CTL: 'Contact lens'
};

// ---------- report (spec §13.2 item 5) ----------

/** Headings and table words in `t`'s language (D48); `title` stays English, values print as recorded. */
export function refractionReport(findings: Findings, t: Translate = english): ReportSection[] {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	const cell = (s: string) => s || '-';
	const any = (ids: string[]) => ids.some((id) => v(id));
	const HEAD = [t('rx.colEye'), t('rx.colSph'), t('rx.colCyl'), t('rx.colAxis'), t('rx.colPrism'), t('report.colAcuity'), t('report.colMid'), t('rx.colAdd'), t('report.colNearAcuity')];
	const out: ReportSection[] = [];

	function prism(source: RxSource, e: EyeSide): string {
		const k = kindOf(source);
		if (k === 'MR') return [v(eyeId(source, 'PRISM', e)), v(eyeId(source, 'BASE', e))].filter(Boolean).join(' ');
		if (k === 'AR') return v(eyeId(source, 'PRISM', e));
		if (k === 'W') {
			const h = [v(eyeId(source, 'HPD', e)), v(eyeId(source, 'HBASE', e))].filter(Boolean).join(' ');
			const vv = [v(eyeId(source, 'VPD', e)), v(eyeId(source, 'VBASE', e))].filter(Boolean).join(' ');
			return [h, vv].filter(Boolean).join(', ');
		}
		return '';
	}
	function specRows(source: RxSource): string[][] {
		const cols = SOURCE_COLS[kindOf(source)].eye;
		const g = (col: EyeCol, e: EyeSide) => (cols.includes(col) ? v(eyeId(source, col, e)) : '');
		return (['OD', 'OS'] as const).map((e) =>
			[e, g('SPH', e), g('CYL', e), g('AXIS', e), prism(source, e), g('VA', e), g('MIDADD', e), g('ADD', e), g('NEARVA', e)].map(
				(c, i) => (i === 0 ? c : cell(c))
			)
		);
	}
	/** FIX: a group prints when ANY of its values is present, not only the sphere. */
	function spectacle(source: RxSource, title: string, titleText: ReportText, notes: string[] = []) {
		// The Rx type alone is a setting, not a measurement.
		const ids = sourceFieldIds(source).filter((id) => id !== ouId(source, 'RX_TYPE'));
		if (!any(ids)) return;
		const comments = [...notes, v(ouId(source, 'COMMENTS'))].filter(Boolean).join('. ');
		out.push({ title, titleText, rows: [], comments, table: { head: HEAD, body: specRows(source) } });
	}

	for (const n of W_SLOTS) {
		const source = `W${n}` as RxSource;
		const rxType = v(ouId(source, 'RX_TYPE'));
		const typed = /^[1-3]$/.test(rxType);
		const type = typed ? ` · ${RX_TYPES[Number(rxType)]}` : '';
		const extras: string[] = [];
		const mat = v(ouId(source, 'LENS_MATERIAL'));
		const treat = splitList(v(ouId(source, 'LENS_TREATMENTS')));
		if (mat) extras.push(t('report.rxMaterial', { value: mat }));
		if (treat.length) extras.push(t('report.rxTreatments', { value: treat.join(', ') }));
		const pd = [v(ouId(source, 'BPDD')) && t('report.rxPd', { value: v(ouId(source, 'BPDD')) }), v(ouId(source, 'BPDN')) && t('report.rxNearPd', { value: v(ouId(source, 'BPDN')) })]
			.filter(Boolean)
			.join(', ');
		if (pd) extras.push(pd);
		const titleText: ReportText = typed
			? { key: 'report.sectionGlassesType', params: { n, type: t(RX_TYPE_LABEL_KEY[Number(rxType)]) } }
			: { key: 'report.sectionGlasses', params: { n } };
		spectacle(source, `Current glasses #${n}${type}`, titleText, extras);
	}
	spectacle('AR', 'Autorefraction', { key: 'rx.methodAutorefraction' });
	spectacle('MR', 'Manifest (dry)', { key: 'rx.methodManifest' }, v('BALANCED') ? [t('sections.rxBalanced')] : []);
	const wet = v('WETTYPE');
	spectacle('CR', `Cycloplegic (wet)${wet ? ` · ${wet}` : ''}`, wet ? { key: 'report.sectionCycloMethod', params: { method: wet } } : { key: 'rx.methodCycloplegic' });

	if (any(sourceFieldIds('CTL'))) {
		const g = (col: EyeCol, e: EyeSide) => v(eyeId('CTL', col, e));
		const body = (['OD', 'OS'] as const).map((e) => [e, ...[g('SPH', e), g('CYL', e), g('AXIS', e), g('BC', e), g('DIAM', e), g('ADD', e), g('VA', e)].map(cell)]);
		// "Brand by manufacturer via supplier" per eye follows the table (a column would wrap badly on paper).
		const lens = (['OD', 'OS'] as const)
			.map((e) => {
				const text = [g('BRAND', e), g('MANUFACTURER', e) && t('rx.byManufacturer', { name: g('MANUFACTURER', e) }), g('SUPPLIER', e) && t('rx.viaSupplier', { name: g('SUPPLIER', e) })]
					.filter(Boolean)
					.join(' ');
				return text && `${e}: ${text}`;
			})
			.filter(Boolean);
		out.push({
			title: 'Contact lens',
			titleText: { key: 'rx.methodContactLens' },
			rows: [],
			comments: [...lens, v('CTL_COMMENTS')].filter(Boolean).join('. '),
			table: { head: [t('rx.colEye'), t('rx.colSph'), t('rx.colCyl'), t('rx.colAxis'), t('rx.colBc'), t('rx.colDiam'), t('rx.colAdd'), t('report.colAcuity')], body }
		});
	}
	return out;
}

/**
 * A printed Rx as a small table (dispensed history, §12.6 FIX: prism shown). Empty cells are ''.
 * `head` stays English (the page maps it to messages); "via" before the supplier is in `t`'s language (D48).
 */
export function rxTable(kind: RxKind, v: RxValues, t: Translate = english): { head: string[]; body: string[][] } {
	const g = (k: string) => v[k] ?? '';
	if (kind === 'CTL') {
		const showAdd = !!(g('ODADD') || g('OSADD'));
		const head = ['Lens', 'Sph', 'Cyl', 'Axis', 'BC', 'Diam', ...(showAdd ? ['ADD'] : []), 'Qty', 'Brand'];
		const body = (['OD', 'OS'] as const).map((e) => {
			const brand = [g(`CTLBRAND${e}`), g(`CTLMANUFACTURER${e}`) && `(${g(`CTLMANUFACTURER${e}`)})`, g(`CTLSUPPLIER${e}`) && t('rx.viaSupplier', { name: g(`CTLSUPPLIER${e}`) })]
				.filter(Boolean)
				.join(' ');
			return [e, g(`${e}SPH`), g(`${e}CYL`), g(`${e}AXIS`), g(`${e}BC`), g(`${e}DIAM`), ...(showAdd ? [g(`${e}ADD`)] : []), g(`CTL${e}QUANTITY`), brand];
		});
		return { head, body };
	}
	const prism = (e: string) =>
		[g(`${e}PRISM`), [g(`${e}HPD`), g(`${e}HBASE`)].filter(Boolean).join(' '), [g(`${e}VPD`), g(`${e}VBASE`)].filter(Boolean).join(' ')]
			.filter(Boolean)
			.join(', ');
	const head = ['Eye', 'Sph', 'Cyl', 'Axis', 'Prism', 'Mid ADD', 'ADD', 'PD'];
	const body = (['OD', 'OS'] as const).map((e) => [
		e,
		g(`${e}SPH`),
		g(`${e}CYL`),
		g(`${e}AXIS`),
		prism(e),
		g(`${e}MIDADD`),
		g(`${e}ADD`),
		[g(`${e}MPDD`), g(`${e}MPDN`)].filter(Boolean).join(' / ')
	]);
	return { head, body };
}
