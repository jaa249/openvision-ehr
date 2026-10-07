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
import type { MessageKey } from '#lib/i18n/catalog.ts';
import type { Params } from '#lib/i18n/translate.ts';
import { english, type Translate } from './english.ts';

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
	// The reason travels as a message key with params (the browser shows it in the user's language)
	// and as English text (D48).
	const why = (reasonKey: MessageKey, reasonParams?: Params) => ({ reason: english(reasonKey, reasonParams), reasonKey, reasonParams });
	if (qualifying.length) {
		return {
			status: 'established',
			lastVisit: qualifying[0].date,
			...why('codes.reasonEstablished', { date: qualifying[0].date, years: ESTABLISHED_YEARS })
		};
	}
	const earlier = others.filter((o) => day(o.date) < today);
	const sameProvider = earlier.filter((o) => o.providerId === current.providerId);
	let reason = why('codes.reasonNoEarlierVisit');
	if (sameProvider.length) reason = why('codes.reasonLastSeenLongAgo', { years: ESTABLISHED_YEARS });
	else if (earlier.length) reason = why('codes.reasonOtherProvider');
	return { status: 'new', lastVisit: null, ...reason };
}

/** The patient-status reason in the translator's language (the English text when it came without a key). */
export const patientReason = (p: PatientStatusResult, t: Translate = english): string => (p.reasonKey ? t(p.reasonKey, p.reasonParams) : p.reason);

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
/** Message key of each core / other section's label (D48), by section id. */
export const SECTION_LABEL_KEY: Partial<Record<SectionId, MessageKey>> = {
	ACUITY: 'codes.coreVision',
	IOP: 'codes.coreIopPupils',
	EXT: 'codes.coreExternal',
	ANTSEG: 'codes.coreSlitLamp',
	RETINA: 'codes.coreFundus',
	REFRACTION: 'codes.coreRefraction',
	NEURO: 'codes.coreNeuro'
};
const sectionLabel = (s: { id: SectionId; label: string }, t: Translate) => {
	const key = SECTION_LABEL_KEY[s.id];
	return key ? t(key) : s.label;
};

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

/** Impression items with at least one real diagnosis code ("Code" placeholders and blanks do not count). */
export function codedItems<T extends { codes: string }>(items: T[]): T[] {
	return items.filter((i) => splitCodes(i.codes).length > 0);
}

/** "H40.003, E11.9" -> ['H40.003', 'E11.9']; the "Code" placeholder and blanks are dropped (§11.4). */
export function splitCodes(codes: string): string[] {
	return codes
		.split(/[,;\s]+/)
		.map((c) => c.trim().toUpperCase().replace(/^ICD1[01]:/, ''))
		.filter((c) => c && c !== 'CODE');
}

export interface EvidenceInput {
	findings: Findings;
	items: { title: string; codes: string }[];
	orders: string[];
}

export function levelEvidence({ findings, items, orders }: EvidenceInput, t: Translate = english): Evidence[] {
	const hpi = hpiLevel(findings);
	const sections = recordedSections(findings);
	const coreMissing = CORE_SECTIONS.filter((s) => !sections.has(s.id)).map((s) => sectionLabel(s, t));
	const all = [...CORE_SECTIONS, ...OTHER_SECTIONS];
	const recorded = all.filter((s) => sections.has(s.id)).length;
	const periph = (['OD', 'OS'] as const).filter((e) => filled(findings, `${e}PERIPH`));
	const coded = codedItems(items).length;
	const examParams = { recorded, total: all.length, missing: coreMissing.join(', ') };
	return [
		{
			id: 'history',
			label: t('codes.evHistoryLabel'),
			detail: t('codes.evHistoryDetail', {
				elements: t('codes.evHpiElements', { count: hpi.elements }),
				chronic: t('codes.evChronicProblems', { count: hpi.chronic })
			}),
			met: hpi.detailed,
			supports: 'comprehensive'
		},
		{
			id: 'sections',
			label: t('codes.evSectionsLabel'),
			detail: coreMissing.length ? t('codes.evSectionsDetailMissing', examParams) : t('codes.evSectionsDetail', examParams),
			met: coreMissing.length === 0,
			supports: 'comprehensive'
		},
		{
			id: 'dilation',
			label: t('codes.evDilationLabel'),
			detail: isDilated(findings) ? t('codes.evDilationYes') : t('codes.evDilationNo'),
			met: isDilated(findings),
			supports: 'comprehensive'
		},
		{
			id: 'periphery',
			label: t('codes.evPeripheryLabel'),
			detail:
				periph.length === 2
					? t('codes.evPeripheryBoth', { eye1: periph[0], eye2: periph[1] })
					: periph.length
						? t('codes.evPeripheryOne', { eye: periph[0] })
						: t('codes.evPeripheryNone'),
			met: periph.length > 0,
			supports: 'comprehensive'
		},
		{
			id: 'diagnoses',
			label: t('codes.evDiagnosesLabel'),
			detail: t('codes.evDiagnosesDetail', { count: coded, total: items.length }),
			met: coded > 0,
			supports: 'any'
		},
		{
			id: 'orders',
			label: t('codes.evOrdersLabel'),
			detail: orders.length
				? t('codes.evOrdersDetail', { count: orders.length, orders: `${orders.slice(0, 4).join(', ')}${orders.length > 4 ? '…' : ''}` })
				: t('codes.evOrdersNone'),
			met: orders.length > 0,
			supports: 'comprehensive'
		}
	];
}

export function suggestVisit(input: EvidenceInput & { patient: PatientStatusResult }, t: Translate = english): VisitSuggestion {
	const evidence = levelEvidence(input, t);
	const met = (id: string) => evidence.find((e) => e.id === id)!.met;
	const examComplete = met('sections') && met('dilation') && met('periphery');
	const programOrHistory = met('history') || met('orders');
	const level: VisitLevel = examComplete && programOrHistory ? 'comprehensive' : 'intermediate';
	const reasons: string[] = [patientReason(input.patient, t)];
	if (level === 'comprehensive') {
		reasons.push(t('codes.reasonCoreRecorded'));
		reasons.push(met('orders') ? t('codes.reasonOrdersPlaced') : t('codes.reasonHistoryExtensive'));
	} else {
		const missing: string[] = [];
		if (!met('sections')) missing.push(t('codes.missingCoreSections'));
		if (!met('dilation')) missing.push(t('codes.missingDilation'));
		if (!met('periphery')) missing.push(t('codes.missingPeriphery'));
		if (!programOrHistory) missing.push(t('codes.missingOrdersOrHistory'));
		reasons.push(t('codes.reasonNotComprehensive', { missing: missing.join(', ') }));
	}
	reasons.push(t('codes.reasonAdvisory'));
	return { family: 'eye', patient: input.patient, level, code: visitCode('eye', input.patient.status, level)!.code, reasons, evidence };
}
