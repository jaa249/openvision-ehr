// Visit code suggestion (spec §11.1 with its FIXes, decision D7: suggestions only, always with the
// reasons; the provider chooses). Pure, so the server, the panel and the tests agree.
//
// New vs established (FIX): established when THIS patient had an earlier visit (date strictly before
// this one) with the SAME provider within the past 3 years, counting back to the same calendar date.
// There is no specialty-group model yet, so "same-specialty group" is not considered: a visit with a
// different provider in the same practice leaves the patient "new" for this provider. Future-dated
// and same-day visits never count (the original counted them).
//
// Level (FIX): eye codes are defined by service content, so the level is advisory. We list the
// documented elements that speak for each level and pre-select:
//   comprehensive when the core exam sections are recorded, the fundus was examined dilated with the
//   periphery recorded, AND either the history is extensive or a diagnostic/treatment program was
//   started (orders placed);
//   intermediate otherwise.
// The provider can pick any code; this is never labelled "Detailed".
import { FIELD_BY_ID, type SectionId } from '#lib/exam/catalog.ts';
import { hpiLevel } from '#lib/exam/sections/history.ts';
import { isDilated } from '#lib/exam/sections/dilation.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import { visitCode, type VisitLevel } from './codes.ts';
import type { Evidence, PatientStatusResult, VisitSuggestion } from './types.ts';

export interface VisitRef {
	/** YYYY-MM-DD (a longer ISO string is cut to the date). */
	date: string;
	providerId: number;
}

const day = (d: string) => d.slice(0, 10);

/** The same calendar date `years` earlier, as YYYY-MM-DD (string compare, so Feb 29 needs no special case). */
export function yearsBefore(date: string, years: number): string {
	const [y, rest] = [Number(date.slice(0, 4)), date.slice(4, 10)];
	return `${String(y - years).padStart(4, '0')}${rest}`;
}

export const ESTABLISHED_YEARS = 3;

export function patientStatus(current: VisitRef, others: VisitRef[]): PatientStatusResult {
	const today = day(current.date);
	const cutoff = yearsBefore(today, ESTABLISHED_YEARS);
	const qualifying = others
		.map((o) => ({ date: day(o.date), providerId: o.providerId }))
		.filter((o) => o.providerId === current.providerId && o.date < today && o.date >= cutoff)
		.sort((a, b) => (a.date < b.date ? 1 : -1));
	if (qualifying.length) {
		return {
			status: 'established',
			lastVisit: qualifying[0].date,
			reason: `Seen by this provider on ${qualifying[0].date}, within the past ${ESTABLISHED_YEARS} years.`
		};
	}
	const earlier = others.filter((o) => day(o.date) < today);
	const sameProvider = earlier.filter((o) => o.providerId === current.providerId);
	let reason = 'No earlier visit on record.';
	if (sameProvider.length) reason = `Last seen by this provider more than ${ESTABLISHED_YEARS} years ago.`;
	else if (earlier.length) reason = 'Earlier visits were with a different provider (no specialty-group rule yet).';
	return { status: 'new', lastVisit: null, reason };
}

/** Exam sections that make up "a general evaluation of the complete visual system". */
export const CORE_SECTIONS: { id: SectionId; label: string }[] = [
	{ id: 'ACUITY', label: 'Vision' },
	{ id: 'IOP', label: 'IOP / pupils' },
	{ id: 'EXT', label: 'External' },
	{ id: 'ANTSEG', label: 'Slit lamp' },
	{ id: 'RETINA', label: 'Fundus' }
];
/** Also counted when present, but not required. */
export const OTHER_SECTIONS: { id: SectionId; label: string }[] = [
	{ id: 'REFRACTION', label: 'Refraction' },
	{ id: 'NEURO', label: 'Neuro' }
];

/** Exam sections with at least one recorded value (defaults count: the provider applied them). */
export function recordedSections(findings: Findings): Set<SectionId> {
	const out = new Set<SectionId>();
	for (const [id, f] of Object.entries(findings)) {
		if (!f?.value?.trim()) continue;
		const def = FIELD_BY_ID.get(id);
		if (def) out.add(def.section);
	}
	return out;
}

const filled = (f: Findings, id: string) => !!f[id]?.value?.trim();

/** Impression items with at least one real ICD-10 code ("Code" placeholders and blanks do not count). */
export function codedItems<T extends { codes: string }>(items: T[]): T[] {
	return items.filter((i) => splitCodes(i.codes).length > 0);
}

/** "H40.003, E11.9" -> ['H40.003', 'E11.9']; the "Code" placeholder and blanks are dropped (§11.4). */
export function splitCodes(codes: string): string[] {
	return codes
		.split(/[,;\s]+/)
		.map((c) => c.trim().toUpperCase().replace(/^ICD10:/, ''))
		.filter((c) => c && c !== 'CODE');
}

export interface EvidenceInput {
	findings: Findings;
	items: { title: string; codes: string }[];
	orders: string[];
}

export function levelEvidence({ findings, items, orders }: EvidenceInput): Evidence[] {
	const hpi = hpiLevel(findings);
	const sections = recordedSections(findings);
	const coreMissing = CORE_SECTIONS.filter((s) => !sections.has(s.id)).map((s) => s.label);
	const all = [...CORE_SECTIONS, ...OTHER_SECTIONS];
	const recorded = all.filter((s) => sections.has(s.id)).length;
	const periph = (['OD', 'OS'] as const).filter((e) => filled(findings, `${e}PERIPH`));
	const coded = codedItems(items).length;
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	return [
		{
			id: 'history',
			label: 'History: 4 or more HPI elements, or 3 chronic problems',
			detail: `${plural(hpi.elements, 'HPI element')}, ${plural(hpi.chronic, 'chronic problem')} recorded.`,
			met: hpi.detailed,
			supports: 'comprehensive'
		},
		{
			id: 'sections',
			label: 'Exam covers the visual system (vision, IOP / pupils, external, slit lamp, fundus)',
			detail: `${recorded} of ${all.length} exam sections recorded.${coreMissing.length ? ` Missing: ${coreMissing.join(', ')}.` : ''}`,
			met: coreMissing.length === 0,
			supports: 'comprehensive'
		},
		{
			id: 'dilation',
			label: 'Dilation documented',
			detail: isDilated(findings) ? 'Dilating drops recorded.' : 'No dilating drops recorded.',
			met: isDilated(findings),
			supports: 'comprehensive'
		},
		{
			id: 'periphery',
			label: 'Retinal periphery recorded',
			detail: periph.length ? `Recorded for ${periph.join(' and ')}.` : 'Not recorded for either eye.',
			met: periph.length > 0,
			supports: 'comprehensive'
		},
		{
			id: 'diagnoses',
			label: 'Condition evaluated (impression items with ICD-10 codes)',
			detail: `${plural(coded, 'coded item')} of ${items.length} in the impression.`,
			met: coded > 0,
			supports: 'any'
		},
		{
			id: 'orders',
			label: 'Diagnostic or treatment program started (orders placed)',
			detail: orders.length ? `${plural(orders.length, 'order')}: ${orders.slice(0, 4).join(', ')}${orders.length > 4 ? '…' : ''}.` : 'No orders placed.',
			met: orders.length > 0,
			supports: 'comprehensive'
		}
	];
}

export function suggestVisit(input: EvidenceInput & { patient: PatientStatusResult }): VisitSuggestion {
	const evidence = levelEvidence(input);
	const met = (id: string) => evidence.find((e) => e.id === id)!.met;
	const examComplete = met('sections') && met('dilation') && met('periphery');
	const programOrHistory = met('history') || met('orders');
	const level: VisitLevel = examComplete && programOrHistory ? 'comprehensive' : 'intermediate';
	const reasons: string[] = [input.patient.reason];
	if (level === 'comprehensive') {
		reasons.push('Core exam sections recorded, with a dilated fundus exam including the periphery.');
		reasons.push(met('orders') ? 'Orders placed: a diagnostic or treatment program was started.' : 'History is extensive.');
	} else {
		const missing: string[] = [];
		if (!met('sections')) missing.push('all core exam sections');
		if (!met('dilation')) missing.push('dilation');
		if (!met('periphery')) missing.push('periphery');
		if (!programOrHistory) missing.push('orders placed or an extensive history');
		reasons.push(`Comprehensive not suggested: missing ${missing.join(', ')}.`);
	}
	reasons.push('Advisory only: choose the code that matches the service you provided.');
	return { family: 'eye', patient: input.patient, level, code: visitCode('eye', input.patient.status, level)!.code, reasons, evidence };
}
