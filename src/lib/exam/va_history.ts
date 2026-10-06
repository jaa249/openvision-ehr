// Visual acuity history (docs/spec/BEHAVIOR.md §8.2 with its FIXes): a table of every visit up to
// this exam and a chart of acuity over time. Pure, so the server, the panel and tests agree.
//
// Chart choice (§8.2 FIX): we plot logMAR, not the Snellen denominator. logMAR is linear in lines
// read (0.1 = one line, 0.02 = one letter), so +/- letters and pinhole can be drawn honestly, and
// CF / HM / LP / NLP get their conventional values. Lower logMAR is better, so the chart's y axis is
// INVERTED: better vision is higher on the chart. The Snellen value is shown on hover and focus.
import type { Findings } from '#lib/shorthand/parse.ts';

export type VaEye = 'OD' | 'OS';

export interface VaGroup {
	key: 'SC' | 'CC' | 'PH' | 'AR' | 'MR' | 'CR' | 'CTL';
	label: string;
	long: string;
	od: string;
	os: string;
	/** Shown in the chart until the user turns it off (§8.2: SC, CC, MR, CTL; FIX adds AR, CR, PH as toggles). */
	defaultOn: boolean;
}

/** Column groups in the table's order (§8.2). CC = wearing Rx #1. */
export const VA_GROUPS: VaGroup[] = [
	{ key: 'SC', label: 'SC', long: 'without correction', od: 'SCODVA', os: 'SCOSVA', defaultOn: true },
	{ key: 'CC', label: 'CC', long: 'with current glasses', od: 'ODVA', os: 'OSVA', defaultOn: true },
	{ key: 'PH', label: 'PH', long: 'pinhole', od: 'PHODVA', os: 'PHOSVA', defaultOn: false },
	{ key: 'AR', label: 'AR', long: 'with autorefraction', od: 'ARODVA', os: 'AROSVA', defaultOn: false },
	{ key: 'MR', label: 'MR', long: 'with manifest refraction', od: 'MRODVA', os: 'MROSVA', defaultOn: true },
	{ key: 'CR', label: 'CR', long: 'with cycloplegic refraction', od: 'CRODVA', os: 'CROSVA', defaultOn: false },
	{ key: 'CTL', label: 'CTL', long: 'with contact lenses', od: 'CTLODVA', os: 'CTLOSVA', defaultOn: true }
];

/** Every field the history reads (the API sends only these). */
export const VA_HISTORY_FIELDS: string[] = VA_GROUPS.flatMap((g) => [g.od, g.os]);

/**
 * Conventional logMAR values for low vision (widely used research convention):
 * count fingers 1.9, hand motion 2.3, light perception 2.7, no light perception 3.0.
 */
export const LOW_VISION_LOGMAR: Record<'CF' | 'HM' | 'LP' | 'NLP', number> = { CF: 1.9, HM: 2.3, LP: 2.7, NLP: 3.0 };

/** One letter on a standard chart line of five letters = 0.02 logMAR. */
const PER_LETTER = 0.02;

export interface VaValue {
	/** What was recorded, trimmed. */
	raw: string;
	/** null when the text is not a distance acuity (e.g. "NI", "J1", a note). */
	logmar: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Parses one acuity entry into logMAR.
 * - Snellen 20/x (feet) or 6/x (metres): log10(x / 20) or log10(x / 6).
 * - Letters: "20/40-2" missed two letters (worse, +0.04); "20/40+1" read one extra (better, -0.02);
 *   a bare "+" or "-" counts as one letter.
 * - CF, HM, LP, NLP (also "count fingers", "CF 3 ft", "LP with projection").
 * - Pinhole entries may carry a "PH" prefix ("PH 20/30"); "NI" (no improvement) has no value.
 */
export function parseAcuity(input: string | undefined | null): VaValue {
	const raw = (input ?? '').trim();
	let t = raw.toUpperCase().replace(/^PH\s*:?\s*/, '');
	if (!t) return { raw, logmar: null };
	const snellen = /^(20|6)\s*\/\s*(\d{1,4}(?:\.\d+)?)\s*(?:([+-])\s*(\d)?)?/.exec(t);
	if (snellen) {
		const base = Number(snellen[1]);
		const denom = Number(snellen[2]);
		if (!(denom > 0)) return { raw, logmar: null };
		let v = Math.log10(denom / base);
		if (snellen[3]) {
			const letters = snellen[4] ? Number(snellen[4]) : 1;
			v += (snellen[3] === '-' ? 1 : -1) * letters * PER_LETTER;
		}
		return { raw, logmar: round2(v) };
	}
	t = t.replace(/\s+/g, ' ');
	if (/^(NLP|NO LIGHT( PERCEPTION)?)\b/.test(t)) return { raw, logmar: LOW_VISION_LOGMAR.NLP };
	if (/^(LP|LIGHT PERCEPTION)\b/.test(t)) return { raw, logmar: LOW_VISION_LOGMAR.LP };
	if (/^(HM|HAND MO(TION|VEMENTS?))\b/.test(t)) return { raw, logmar: LOW_VISION_LOGMAR.HM };
	if (/^(CF|FC|COUNT(ING)? FINGERS?)\b/.test(t)) return { raw, logmar: LOW_VISION_LOGMAR.CF };
	return { raw, logmar: null };
}

/** The Snellen (20/x) equivalent of a logMAR value, for axis labels. */
export function snellenFor(logmar: number): string {
	if (logmar >= LOW_VISION_LOGMAR.NLP) return 'NLP';
	if (logmar >= LOW_VISION_LOGMAR.LP) return 'LP';
	if (logmar >= LOW_VISION_LOGMAR.HM) return 'HM';
	if (logmar >= LOW_VISION_LOGMAR.CF) return 'CF';
	return `20/${Math.round(20 * 10 ** logmar)}`;
}

export interface VaVisitInput {
	id: number;
	date: string;
	visitType?: string;
	findings: Findings;
}

export interface VaVisit {
	id: number;
	date: string;
	visitType: string;
	/** This exam (the one the history was opened from). */
	current: boolean;
	values: Record<VaGroup['key'], Record<VaEye, VaValue | null>>;
}

export interface VaHistory {
	/** Oldest to newest; never a visit after this exam. */
	visits: VaVisit[];
	/** Only groups with at least one value (§8.2). */
	groups: VaGroup[];
}

/** True when `v` comes after `current` (later date, or same date with a higher id). */
export function isAfter(v: { id: number; date: string }, current: { id: number; date: string }): boolean {
	return v.date > current.date || (v.date === current.date && v.id > current.id);
}

/**
 * Builds the table and chart data from this exam and its earlier visits. Visits after this exam are
 * dropped even if passed in (§8.2: "excluding visits after this exam").
 */
export function buildVaHistory(current: VaVisitInput, others: VaVisitInput[]): VaHistory {
	const all = [current, ...others.filter((v) => v.id !== current.id && !isAfter(v, current))];
	all.sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
	const visits: VaVisit[] = all.map((v) => {
		const values = {} as VaVisit['values'];
		for (const g of VA_GROUPS) {
			const read = (id: string) => {
				const s = (v.findings[id]?.value ?? '').trim();
				return s ? parseAcuity(s) : null;
			};
			values[g.key] = { OD: read(g.od), OS: read(g.os) };
		}
		return { id: v.id, date: v.date, visitType: v.visitType ?? '', current: v.id === current.id, values };
	});
	const groups = VA_GROUPS.filter((g) => visits.some((v) => v.values[g.key].OD || v.values[g.key].OS));
	return { visits, groups };
}

export interface VaPoint {
	visitIndex: number;
	date: string;
	logmar: number;
	raw: string;
}

export interface VaSeries {
	id: string;
	group: VaGroup;
	eye: VaEye;
	/** Points with a numeric value; a visit without one is a gap. */
	points: VaPoint[];
}

/** One series per group and eye that has at least one plottable value. */
export function vaSeries(h: VaHistory): VaSeries[] {
	const out: VaSeries[] = [];
	for (const g of h.groups) {
		for (const eye of ['OD', 'OS'] as const) {
			const points: VaPoint[] = [];
			h.visits.forEach((v, i) => {
				const val = v.values[g.key][eye];
				if (val?.logmar != null) points.push({ visitIndex: i, date: v.date, logmar: val.logmar, raw: val.raw });
			});
			if (points.length) out.push({ id: `${g.key}-${eye}`, group: g, eye, points });
		}
	}
	return out;
}
