// Glaucoma flow sheet and IOP targets (docs/spec/BEHAVIOR.md §8.3 with every FIX, §17 B16).
// Everything is scoped by patient id; with an exam, only that exam and earlier visits are used
// (never a later visit, like priors §6.1).
import type { DB } from './db.ts';
import { getEncounter, getFindings, getPriors, getUserDefaults } from './exam.ts';
import { listIssues } from './history.ts';
import { listDocuments } from './documents.ts';
import { localToday } from './patients.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { Issue } from '#lib/history/types.ts';
import type { DocMeta } from '#lib/components/documents/types.ts';
import { iopNumber, resolveTarget, type ResolvedTarget, type TargetEye } from '#lib/exam/sections/glaucoma.ts';

/** The flow sheet covers the 20 most recent visits (§8.3, parity: no date-range control). */
export const FLOW_VISITS = 20;


// ---------- targets ----------

export type Targets = Record<TargetEye, ResolvedTarget>;

/**
 * The defaults list (ODIOPTARGET / OSIOPTARGET) of the visit's own provider (encounters.provider_id)
 * and their name. Never the viewer's: a technician and the provider opening the same chart must see
 * the same target and the same "above target" flags.
 */
export function visitProviderDefaults(db: DB, patientId: number, encounterId: number): { defaults: Record<string, string>; provider: string } | null {
	const e = getEncounter(db, patientId, encounterId);
	return e ? { defaults: getUserDefaults(db, e.providerId), provider: e.provider } : null;
}

/**
 * Per-eye IOP target for an exam (§8.3 FIX): this exam's value, else the latest PRIOR visit's,
 * else the visit provider's defaults list, else 21. Null when the exam does not belong to the patient.
 * With `ownValue` false, the exam's own boxes are ignored: what applies while they are empty.
 */
export function iopTargets(db: DB, patientId: number, encounterId: number, ownValue = true): Targets | null {
	const findings = getFindings(db, patientId, encounterId);
	const p = visitProviderDefaults(db, patientId, encounterId);
	if (!findings || !p) return null;
	const priors = getPriors(db, patientId, encounterId, 1000) ?? [];
	const cur = ownValue ? findings : {};
	return {
		OD: resolveTarget('OD', cur, priors, p.defaults, p.provider),
		OS: resolveTarget('OS', cur, priors, p.defaults, p.provider)
	};
}

// ---------- pure helpers ----------

export type IopMethod = 'AP' | 'TPN';
export interface IopReading {
	value: number;
	/** Recorded per eye (§8.3 FIX: the original left the OS method blank). */
	method: IopMethod;
}

/** Applanation when present, otherwise Tono-Pen. Finger tension is ignored (§8.3). */
export function pickIop(findings: Findings, eye: TargetEye): IopReading | null {
	const ap = iopNumber(findings[`${eye}IOPAP`]?.value);
	if (ap !== null) return { value: ap, method: 'AP' };
	const tpn = iopNumber(findings[`${eye}IOPTPN`]?.value);
	if (tpn !== null) return { value: tpn, method: 'TPN' };
	return null;
}

/**
 * A recorded IOP time as 24-hour "HH:MM" (§8.3 FIX: "08", not "008"), or null.
 * Accepts "8:30 AM", "2:05 pm", "14:05", "08:30:00".
 */
export function formatHour(raw: string | undefined | null): string | null {
	const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?\s*[Mm]?\.?\s*$/.exec(raw ?? '');
	if (!m) return null;
	let h = Number(m[1]);
	const min = Number(m[2]);
	if (min > 59) return null;
	if (m[3]) {
		if (h < 1 || h > 12) return null;
		const pm = m[3].toUpperCase() === 'P';
		h = (h % 12) + (pm ? 12 : 0);
	} else if (h > 23) return null;
	return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Minutes after midnight for an "HH:MM" string. */
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface EyeMed {
	id: number;
	title: string;
	begin: string;
	end: string;
	comments: string;
}

/**
 * Splits eye medications as of the visit date (§8.3 FIX, the original's test was inverted):
 * current = no end date, or an end date after the visit; prior = ended on or before the visit.
 * A medicine started after the visit is not shown at all for that visit.
 */
export function splitEyeMeds(issues: Issue[], visitDate: string): { current: EyeMed[]; prior: EyeMed[] } {
	const current: EyeMed[] = [];
	const prior: EyeMed[] = [];
	for (const i of issues) {
		if (i.type !== 'EYEMED') continue;
		if (i.begin && i.begin > visitDate) continue;
		const m = { id: i.id, title: i.title, begin: i.begin, end: i.end, comments: i.comments };
		if (!i.end || i.end > visitDate) current.push(m);
		else prior.push(m);
	}
	const byBegin = (a: EyeMed, b: EyeMed) => (b.begin || '').localeCompare(a.begin || '') || a.title.localeCompare(b.title);
	current.sort(byBegin);
	prior.sort((a, b) => (b.end || '').localeCompare(a.end || '') || a.title.localeCompare(b.title));
	return { current, prior };
}

// ---------- assembly ----------

export interface FlowVisitInput {
	id: number;
	date: string;
	visitType: string;
	findings: Findings;
	/** The defaults list of this visit's provider (targets fall back to it), and their name. */
	providerDefaults?: Record<string, string>;
	provider?: string;
}

export interface FlowVisit {
	id: number;
	date: string;
	visitType: string;
	/** The exam the sheet was opened from. */
	current: boolean;
	/** "HH:MM" or null. */
	time: string | null;
	/** null = not measured: a gap in the chart, never the text "null" (§8.3 FIX). */
	iop: Record<TargetEye, IopReading | null>;
	/** The target in force at this visit (same lookup order as iopTargets). */
	target: Record<TargetEye, number>;
	gonio: Record<TargetEye, string>;
	cup: Record<TargetEye, string>;
}

export type MarkerKind = 'VF' | 'OCT' | 'GONIO';
export interface FlowMarker {
	date: string;
	kind: MarkerKind;
	/** Document id for VF / OCT, encounter id for gonio. */
	ref: number;
}

export interface FlowSheetData {
	/** The exam the sheet belongs to; null = the whole chart up to today. */
	encounterId: number | null;
	/** The date the sheet is "as of": the exam's date, else today. */
	asOf: string;
	targets: Targets | null;
	meds: { current: EyeMed[]; prior: EyeMed[] };
	vf: DocMeta[];
	oct: DocMeta[];
	/** Oldest to newest, at most FLOW_VISITS. */
	visits: FlowVisit[];
	/** VF / OCT / gonio performed, aligned by date (§8.3 FIX). */
	markers: FlowMarker[];
	/** Union of visit and marker dates, ascending: the "by date" chart's x axis. */
	dates: string[];
}

export interface AssembleInput {
	/** Every visit of the patient (any order). */
	visits: FlowVisitInput[];
	/** The exam the sheet is opened from, or null. */
	currentId: number | null;
	issues: Issue[];
	/** VF and OCT documents (flow-sheet categories). */
	vf: DocMeta[];
	oct: DocMeta[];
	today: string;
}

const chrono = (a: { date: string; id: number }, b: { date: string; id: number }) =>
	a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1;

/** Pure flow-sheet builder (tested without a database). */
export function assembleFlowsheet(input: AssembleInput): FlowSheetData {
	const all = [...input.visits].sort(chrono);
	const cur = input.currentId === null ? null : all.find((v) => v.id === input.currentId) ?? null;
	// With an exam: that exam and earlier visits only.
	const eligible = cur ? all.filter((v) => chrono(v, cur) <= 0) : all;
	const asOf = cur?.date ?? input.today;

	// Targets in force at each visit, oldest first, so each visit only sees earlier ones.
	const targetAt = new Map<number, Record<TargetEye, number>>();
	const resolvedAt = new Map<number, Targets>();
	eligible.forEach((v, i) => {
		const earlier = eligible.slice(0, i).reverse();
		// Each visit falls back to its OWN provider's defaults, whoever is looking.
		const d = v.providerDefaults ?? {};
		const t = { OD: resolveTarget('OD', v.findings, earlier, d, v.provider), OS: resolveTarget('OS', v.findings, earlier, d, v.provider) };
		resolvedAt.set(v.id, t);
		targetAt.set(v.id, { OD: t.OD.value, OS: t.OS.value });
	});

	const recent = eligible.slice(-FLOW_VISITS);
	const visits: FlowVisit[] = recent.map((v) => {
		const text = (id: string) => (v.findings[id]?.value ?? '').trim();
		return {
			id: v.id,
			date: v.date,
			visitType: v.visitType,
			current: v.id === cur?.id,
			time: formatHour(v.findings.IOPTIME?.value),
			iop: { OD: pickIop(v.findings, 'OD'), OS: pickIop(v.findings, 'OS') },
			target: targetAt.get(v.id)!,
			gonio: { OD: text('ODGONIO'), OS: text('OSGONIO') },
			cup: { OD: text('ODCUP'), OS: text('OSCUP') }
		};
	});

	// Targets shown at the top: the exam's, else the newest visit's (as of today).
	const anchor = cur ?? eligible.at(-1) ?? null;
	const targets = anchor ? resolvedAt.get(anchor.id)! : null;

	// Documents up to the as-of date; newest first for the lists.
	const upTo = (d: DocMeta) => d.takenOn <= asOf;
	const vf = input.vf.filter(upTo);
	const oct = input.oct.filter(upTo);

	// Markers inside the chart's window (from the oldest charted visit; all when there are no visits).
	const from = visits[0]?.date ?? '';
	const inWindow = (date: string) => date >= from && date <= asOf;
	const markers: FlowMarker[] = [
		...vf.filter((d) => inWindow(d.takenOn)).map((d) => ({ date: d.takenOn, kind: 'VF' as const, ref: d.id })),
		...oct.filter((d) => inWindow(d.takenOn)).map((d) => ({ date: d.takenOn, kind: 'OCT' as const, ref: d.id })),
		...visits.filter((v) => v.gonio.OD || v.gonio.OS).map((v) => ({ date: v.date, kind: 'GONIO' as const, ref: v.id }))
	].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
	const dates = [...new Set([...visits.map((v) => v.date), ...markers.map((m) => m.date)])].sort();

	return {
		encounterId: cur?.id ?? null,
		asOf,
		targets,
		meds: splitEyeMeds(input.issues, asOf),
		vf,
		oct,
		visits,
		markers,
		dates
	};
}

/**
 * The flow sheet for a patient, optionally as of one exam. Null when the patient does not exist
 * or the exam is not this patient's.
 */
export function buildFlowsheet(db: DB, patientId: number, encounterId: number | null, today = localToday()): FlowSheetData | null {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return null;
	if (encounterId !== null && !getEncounter(db, patientId, encounterId)) return null;
	const ids = db.prepare('SELECT id FROM encounters WHERE patient_id = ? ORDER BY date, id').all(patientId) as { id: number }[];
	const byProvider = new Map<number, Record<string, string>>();
	const visits: FlowVisitInput[] = ids.map(({ id }) => {
		const e = getEncounter(db, patientId, id)!;
		if (!byProvider.has(e.providerId)) byProvider.set(e.providerId, getUserDefaults(db, e.providerId));
		return {
			id,
			date: e.date,
			visitType: e.visitType,
			findings: getFindings(db, patientId, id) ?? {},
			providerDefaults: byProvider.get(e.providerId),
			provider: e.provider
		};
	});
	return assembleFlowsheet({
		visits,
		currentId: encounterId,
		issues: listIssues(db, patientId, today),
		vf: listDocuments(db, patientId, { flow: 'VF' }) ?? [],
		oct: listDocuments(db, patientId, { flow: 'OCT' }) ?? [],
		today
	});
}

