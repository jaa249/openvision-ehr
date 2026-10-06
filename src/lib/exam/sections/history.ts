// history section module (key 1, "HPI"): chief complaints, HPI text and elements, chronic problems, ROS.
// These are per-visit exam values stored as findings (eye_mag form_eye_hpi / form_eye_ros columns).
// Patient-level history (POH, PMH, meds, allergies, FH, social) is NOT here: see src/lib/history/ and PmsfhPanel.
// Wired into catalog.ts (FIELDS, SEED_DEFAULTS), shorthand/codes.ts (ALIASES) and exam/report.ts (buildReport).
// Rule: import only TYPES from catalog.ts / report.ts here (they import values from this file).
//
// Spec: docs/spec/BEHAVIOR.md §1.3 (layout), §7.1 (element counting), §7.3 (ROS), §7.4 (chronic feed), §13.2 item 1.
import type { FieldDef } from '../catalog.ts';
import type { ReportSection } from '../report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

// ---------- field layout (shared with HpiPanel) ----------

export const COMPLAINTS = [1, 2, 3] as const;
export type Complaint = (typeof COMPLAINTS)[number];

/** The eight HPI elements per complaint, in the panel's order (§1.3). `key` + complaint number = column name. */
export const HPI_ELEMENTS = [
	{ key: 'TIMING', label: 'Timing', prompt: 'When it started; constant or comes and goes' },
	{ key: 'CONTEXT', label: 'Context', prompt: 'What they were doing, or where it happens' },
	{ key: 'SEVERITY', label: 'Severity', prompt: '0-10, or mild / moderate / severe' },
	{ key: 'MODIFY', label: 'Modifying factors', prompt: 'What makes it better or worse' },
	{ key: 'ASSOCIATED', label: 'Associated signs', prompt: 'Other symptoms that come with it' },
	{ key: 'LOCATION', label: 'Location', prompt: 'Which eye; where in or around it' },
	{ key: 'QUALITY', label: 'Quality', prompt: 'How it feels: sharp, dull, blurry, gritty...' },
	{ key: 'DURATION', label: 'Duration', prompt: 'How long it has gone on, or each episode lasts' }
] as const;

/** Field ids for one complaint tab (eye_mag column names). */
export function complaintIds(n: Complaint) {
	return {
		cc: `CC${n}`,
		hpi: `HPI${n}`,
		elements: HPI_ELEMENTS.map((e) => `${e.key}${n}`)
	};
}

export const CHRONIC_IDS = ['CHRONIC1', 'CHRONIC2', 'CHRONIC3'] as const;
export const ELEMENT_IDS: string[] = COMPLAINTS.flatMap((n) => complaintIds(n).elements);

/** Twelve ROS systems (§7.3), with the short labels used in summaries and the report. */
export const ROS_SYSTEMS = [
	{ id: 'ROSGENERAL', label: 'General', short: 'GEN' },
	{ id: 'ROSHEENT', label: 'HEENT', short: 'HEENT' },
	{ id: 'ROSCV', label: 'Cardiovascular', short: 'CV' },
	{ id: 'ROSPULM', label: 'Pulmonary', short: 'PULM' },
	{ id: 'ROSGI', label: 'Gastrointestinal', short: 'GI' },
	{ id: 'ROSGU', label: 'Genitourinary', short: 'GU' },
	{ id: 'ROSDERM', label: 'Dermatology', short: 'DERM' },
	{ id: 'ROSNEURO', label: 'Neurological', short: 'NEURO' },
	{ id: 'ROSPSYCH', label: 'Psychiatric', short: 'PSYCH' },
	{ id: 'ROSMUSCULO', label: 'Musculoskeletal', short: 'ORTHO/MSK' },
	{ id: 'ROSIMMUNO', label: 'Immunologic', short: 'IMMUNO' },
	{ id: 'ROSENDOCRINE', label: 'Endocrine', short: 'ENDO' }
] as const;
export const ROS_IDS: string[] = ROS_SYSTEMS.map((s) => s.id);
export const ROS_COMMENTS = 'ROSCOMMENTS';
/** The text a system's "Negative" toggle writes. */
export const ROS_NEGATIVE = 'negative';

// ---------- fields ----------

// Column types from FIELDS.md: complaint 1 is varchar(255) except HPI1 (text); complaints 2-3 and ROS are text.
// Text columns are capped at 4000 like the other comment fields in the catalog.
const VARCHAR = 255;
const TEXT = 4000;

const field = (id: string, row: string, label: string, maxLength: number): FieldDef => ({
	id,
	section: 'HPI',
	row,
	eye: 'OU',
	label,
	maxLength,
	// The patient's own words: no abbreviation expansion (spec §2.2 applies to exam findings only).
	expand: false
});

export const HISTORY_FIELDS: FieldDef[] = [
	...COMPLAINTS.flatMap((n) => {
		const short = n === 1 ? VARCHAR : TEXT;
		return [
			field(`CC${n}`, `CC${n}`, `Chief complaint ${n}`, short),
			field(`HPI${n}`, `CC${n}`, `HPI ${n}`, TEXT),
			...HPI_ELEMENTS.map((e) => field(`${e.key}${n}`, `CC${n}`, `${e.label} ${n}`, short))
		];
	}),
	...CHRONIC_IDS.map((id, i) => field(id, 'CHRONIC', `Chronic problem ${i + 1}`, VARCHAR)),
	...ROS_SYSTEMS.map((s) => field(s.id, 'ROS', `ROS ${s.label.toLowerCase()}`, TEXT)),
	field(ROS_COMMENTS, 'ROS', 'ROS comments', TEXT)
];

/**
 * Shorthand code -> field ids. CC and HPI come from the original's vocabulary (SHORTHAND.md);
 * the rest are convenience codes for complaint 1's elements and the ROS boxes. Every column name
 * (CC2, TIMING3, ROSCV...) is already a code on its own.
 */
export const HISTORY_ALIASES: Record<string, string[]> = {
	CC: ['CC1'],
	HPI: ['HPI1'],
	TIMING: ['TIMING1'],
	CONTEXT: ['CONTEXT1'],
	SEVERITY: ['SEVERITY1'],
	MODIFY: ['MODIFY1'],
	ASSOCIATED: ['ASSOCIATED1'],
	LOCATION: ['LOCATION1'],
	QUALITY: ['QUALITY1'],
	DURATION: ['DURATION1'],
	ROSGEN: ['ROSGENERAL'],
	ROSMSK: ['ROSMUSCULO'],
	ROSENDO: ['ROSENDOCRINE'],
	ROSCOM: [ROS_COMMENTS]
};

/**
 * Deliberately empty. HPI is the patient's words, and the `D` command fills every section's defaults,
 * so a ROS default here would let one keystroke document a review of systems that never happened.
 * "All negative" is an explicit button in the panel instead (rosAllNegative).
 */
export const HISTORY_DEFAULTS: Record<string, string> = {};

// ---------- helpers (pure, so the panel and tests agree) ----------

const val = (findings: Findings, id: string) => findings[id]?.value?.trim() ?? '';

export interface HpiLevel {
	/** Filled element boxes across all three complaint tabs (max 24). */
	elements: number;
	/** Filled CHRONIC boxes (max 3). */
	chronic: number;
	/** Four or more elements, or three chronic problems (§7.1, §11.1). */
	detailed: boolean;
}

/** §7.1 element counting. FIX: Severity on tab 2 counts like every other box (the original skipped it). */
export function hpiLevel(findings: Findings): HpiLevel {
	const elements = ELEMENT_IDS.filter((id) => val(findings, id)).length;
	const chronic = CHRONIC_IDS.filter((id) => val(findings, id)).length;
	return { elements, chronic, detailed: elements >= 4 || chronic >= 3 };
}

/**
 * §7.4: each chronic issue text goes into the first empty CHRONIC box, unless identical text is
 * already in one of the three. A filled box is never overwritten; texts that do not fit are dropped.
 * Idempotent: feeding the same list twice changes nothing the second time.
 */
export function chronicFill(findings: Findings, texts: string[]): { next: Findings; changed: string[] } {
	const next: Findings = { ...findings };
	const changed: string[] = [];
	for (const raw of texts) {
		const text = raw.trim().slice(0, VARCHAR);
		if (!text) continue;
		if (CHRONIC_IDS.some((id) => val(next, id) === text)) continue;
		const empty = CHRONIC_IDS.find((id) => !val(next, id));
		if (!empty) break;
		next[empty] = { value: text, isDefault: false };
		changed.push(empty);
	}
	return { next, changed };
}

/** "All negative": writes "negative" into every EMPTY ROS system; recorded systems are left alone. */
export function rosAllNegative(findings: Findings): { next: Findings; changed: string[] } {
	const next: Findings = { ...findings };
	const changed = ROS_IDS.filter((id) => !val(findings, id));
	for (const id of changed) next[id] = { value: ROS_NEGATIVE, isDefault: false };
	return { next, changed };
}

/** "Clear ROS": empties the twelve systems and the comments. */
export function rosClear(findings: Findings): { next: Findings; changed: string[] } {
	const next: Findings = { ...findings };
	const changed = [...ROS_IDS, ROS_COMMENTS].filter((id) => (findings[id]?.value ?? '') !== '');
	for (const id of changed) next[id] = { value: '', isDefault: false };
	return { next, changed };
}

export function isRosNegative(value: string | undefined): boolean {
	return (value ?? '').trim().toLowerCase() === ROS_NEGATIVE;
}

// ---------- report (§13.2 item 1) ----------

/** Printed report sections for this module: HPI (one per recorded complaint), chronic problems, ROS. */
export function historyReport(findings: Findings): ReportSection[] {
	const v = (id: string) => val(findings, id);
	const out: ReportSection[] = [];
	const hpiIds = [...COMPLAINTS.flatMap((n) => [`CC${n}`, `HPI${n}`]), ...ELEMENT_IDS, ...CHRONIC_IDS];

	// Nothing recorded in the HPI tab: print nothing at all (no empty labels).
	if (hpiIds.some(v)) {
		for (const n of COMPLAINTS) {
			const c = complaintIds(n);
			// Complaint 1 always prints (its CC and HPI labels, even if blank); 2 and 3 only with a CC.
			if (n > 1 && !v(c.cc)) continue;
			const body: string[][] = [];
			if (n === 1 || v(c.hpi)) body.push(['HPI', v(c.hpi)]);
			HPI_ELEMENTS.forEach((e, i) => {
				const text = v(c.elements[i]);
				if (text) body.push([e.label, text]);
			});
			out.push({
				title: n === 1 ? 'History of present illness' : `History of present illness, complaint ${n}`,
				rows: [],
				comments: '',
				table: { head: [n === 1 ? 'Chief complaint' : `Chief complaint ${n}`, v(c.cc)], body }
			});
		}
		const chronic = CHRONIC_IDS.map(v).filter(Boolean);
		if (chronic.length) {
			out.push({
				title: 'Chronic or inactive problems',
				rows: [],
				comments: '',
				// Issue text is "title code" + a comment line; keep both on one printed line.
				table: { head: ['#', 'Problem and status'], body: chronic.map((t, i) => [String(i + 1), t.replace(/\s*\n\s*/g, ' - ')]) }
			});
		}
	}

	// FIX (§7.3): the original prints "Negative" for an empty ROS. We print only what was recorded.
	// Negative systems share one line; only positive findings get a row each.
	const recorded = ROS_SYSTEMS.filter((s) => v(s.id));
	const negative = recorded.filter((s) => isRosNegative(v(s.id))).map((s) => s.short);
	const ros = recorded.filter((s) => !isRosNegative(v(s.id))).map((s) => [s.short, v(s.id)]);
	if (recorded.length || v(ROS_COMMENTS)) {
		out.push({
			title: 'Review of systems',
			rows: [],
			comments: v(ROS_COMMENTS),
			...(negative.length ? { summary: `Negative: ${negative.join(', ')}` } : {}),
			...(ros.length ? { table: { head: ['System', 'Finding'], body: ros } } : {})
		});
	}
	return out;
}
