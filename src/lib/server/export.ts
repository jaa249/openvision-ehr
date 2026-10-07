// Data export: CSV for spreadsheets, FHIR R4 for other EHRs (decision D19).
import { createHash } from 'node:crypto';
import { FIELDS, SECTION_DEF } from '#lib/exam/catalog.ts';
import type { PrintableEncounter } from '#lib/exam/types.ts';
import { allergyStatusText } from '#lib/history/summary.ts';
import type { AllergyStatus } from '#lib/history/types.ts';
import { CODE_SETS, codeSetOfCode, splitCodeText, type CodeSetId } from '#lib/codesets/index.ts';
import type { PlanReport, Signature } from '#lib/plan/types.ts';

/**
 * The allergy status a visit's export carries (D36): for a signed exam, as recorded at signing (the
 * snapshot getPrintable put in `history`); otherwise, and for an exam signed before snapshots existed
 * ('legacy'), the patient's current status.
 */
export function allergiesFor(item: PrintableEncounter): AllergyStatus {
	return item.historySource?.kind === 'signed' && item.history ? item.history.allergyStatus : item.patient.allergyStatus;
}

// ---------- CSV ----------

const PATIENT_COLUMNS = ['Encounter ID', 'Visit date', 'Visit type', 'Provider', 'Technician', 'MRN', 'Last name', 'First name', 'Preferred name', 'DOB', 'Allergies'];
/**
 * After the exam fields, so existing column positions never move: who signed and when, and every
 * addendum (a correction written after signing must travel with the findings it corrects; D36).
 */
const SIGNATURE_COLUMNS = ['Signed', 'Addenda'];

/** "Dr X, 2026-10-06T14:05:00.000Z" or '' when unsigned. */
const signedCell = (s: Signature | null | undefined) => (s ? `${s.signedBy}, ${s.signedAt}` : '');
/** Each addendum as "<time> <author>: <text>", oldest first, one per line. */
const addendaCell = (s: Signature | null | undefined) => (s?.addenda ?? []).map((a) => `${a.at} ${a.by}: ${a.text}`).join('\n');

/**
 * Spreadsheet apps run cells that start with = + - @ as formulas (CSV injection).
 * A leading apostrophe keeps them as text, so "+1 NS" stays "+1 NS" instead of becoming #NAME?.
 */
function cell(raw: string): string {
	const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
	return /[",\r\n]/.test(v) || v !== raw ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One row per visit, one column per exam field (catalog order). UTF-8 with BOM so Excel reads accents. */
export function toCsv(items: PrintableEncounter[]): string {
	const header = [...PATIENT_COLUMNS, ...FIELDS.map((f) => `${SECTION_DEF.get(f.section)?.title.split(' (')[0]}: ${f.label}`), ...SIGNATURE_COLUMNS];
	const rows = items.map((item) => {
		const { patient: p, encounter: e, findings, signature } = item;
		const allergies = allergiesFor(item);
		return [
			String(e.id),
			e.date,
			e.visitType,
			e.provider,
			e.technician ?? '',
			p.mrn,
			p.legalLast,
			p.legalFirst,
			p.preferredName ?? '',
			p.dob,
			// "Not recorded" / "NKDA" / the list: a blank cell would read as "no allergies".
			allergies.kind === 'listed'
				? allergies.allergies.map((a) => a.title + (a.reaction ? ` (${a.reaction})` : '')).join('; ')
				: allergyStatusText(allergies),
			...FIELDS.map((f) => findings[f.id]?.value ?? ''),
			signedCell(signature),
			addendaCell(signature)
		];
	});
	return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------- FHIR R4 ----------

export const FHIR_CODESYSTEM = 'https://github.com/jaa249/openvision-ehr/fhir/CodeSystem/exam-finding';
const MRN_SYSTEM = 'urn:openvision:mrn';
const SNOMED = 'http://snomed.info/sct';
const ALLERGY_CLINICAL = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';
const ALLERGY_VERIFICATION = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification';
const CONDITION_CLINICAL = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CONDITION_VERIFICATION = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';
const CONDITION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/condition-category';
const LOINC = 'http://loinc.org';
/** Our extension carrying the WHO linearization URI next to an ICD-11 code and title (WHO licence; D47). */
export const ICD11_URI_EXTENSION = 'urn:openvision:fhir:icd11-uri';
/**
 * Our extension carrying the language of the stored ICD-11 title (D50): FHIR's Coding has no language
 * element, and a title may be WHO's Spanish, Chinese, ... title rather than English. valueCode, e.g. "es".
 */
export const TITLE_LANG_EXTENSION = 'urn:openvision:fhir:title-lang';
/** SNOMED CT body structures for laterality. */
const EYE_SITE = {
	OD: { code: '18944008', display: 'Right eye structure' },
	OS: { code: '8966001', display: 'Left eye structure' },
	OU: { code: '40638003', display: 'Both eyes' }
} as const;

/** Name-based UUID (v5 layout) so the same record always gets the same id across exports. */
function uuid(key: string): string {
	const h = createHash('sha1').update(`openvision:${key}`).digest();
	h[6] = (h[6] & 0x0f) | 0x50;
	h[8] = (h[8] & 0x3f) | 0x80;
	const x = h.subarray(0, 16).toString('hex');
	return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

type Resource = Record<string, unknown> & { resourceType: string; id: string };
type PlanItem = PlanReport['items'][number];

/**
 * Condition.code.coding for one impression item, in the item's own code set (D44): ICD-10-CM codes as
 * displayed with their description; ICD-11 codes with "&" extensions, WHO title(s) as stored and, in
 * our extension, the WHO URI of each code part (code, title and URI travel together; D47), and the title's
 * language in a second extension (D50).
 */
function conditionCodings(item: PlanItem): Record<string, unknown>[] {
	const codes = item.codes ? item.codes.split(', ').filter(Boolean) : [];
	const titles = new Map(splitCodeText(item.codeText).map((c) => [c.code, c.description]));
	const uris = (item.codeUris ?? '').split(', ');
	return codes.map((code, i) => {
		const set: CodeSetId = item.codeSystem ?? codeSetOfCode(code) ?? 'icd10cm';
		const display = titles.get(code);
		const partUris = set === 'icd11' ? (uris[i] ?? '').split('&').filter(Boolean) : [];
		const extension = [
			...partUris.map((u) => ({ url: ICD11_URI_EXTENSION, valueUri: u })),
			...(set === 'icd11' && display && item.titleLang ? [{ url: TITLE_LANG_EXTENSION, valueCode: item.titleLang }] : [])
		];
		return {
			...(extension.length ? { extension } : {}),
			system: CODE_SETS[set].system,
			code,
			...(display ? { display } : {})
		};
	});
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Human-readable summary every resource should carry (FHIR dom-6). */
const narrative = (t: string) => ({
	status: 'generated',
	div: `<div xmlns="http://www.w3.org/1999/xhtml">${xml(t)}</div>`
});

/**
 * A FHIR R4 "collection" Bundle: Patient, Practitioner, Encounter, AllergyIntolerance, one Observation
 * per recorded finding, one Condition per impression item (D47) and one DocumentReference per addendum,
 * so a downloaded visit can be added to another chart. Observations are "final" and Conditions
 * "confirmed" once the exam is signed; before that they are "preliminary" / "provisional".
 */
export function toFhirBundle(items: PrintableEncounter[], now = new Date()): Record<string, unknown> {
	const resources = new Map<string, Resource>();
	const add = (key: string, r: Omit<Resource, 'id'>) => {
		const id = uuid(key);
		if (!resources.has(id)) resources.set(id, { ...r, id } as Resource);
		return `urn:uuid:${id}`;
	};
	const today = now.toISOString().slice(0, 10);
	// AllergyIntolerance is patient-level, so a bundle carries ONE allergy state per patient: that of the
	// patient's newest visit in the bundle (by date, then id), as that visit records it (allergiesFor:
	// its signing snapshot when signed, else current). Deterministic whatever order the visits come in.
	const allergySource = new Map<number, PrintableEncounter>();
	for (const it of items) {
		const cur = allergySource.get(it.patient.id);
		const newer = !cur || it.encounter.date > cur.encounter.date || (it.encounter.date === cur.encounter.date && it.encounter.id > cur.encounter.id);
		if (newer) allergySource.set(it.patient.id, it);
	}

	for (const item of items) {
		const { patient: p, encounter: e, findings, plan, signature } = item;
		const signed = !!signature;
		const patientRef = add(`patient:${p.id}`, {
			resourceType: 'Patient',
			text: narrative(`${p.legalName}${p.preferredName ? ` ("${p.preferredName}")` : ''}, born ${p.dob}, MRN ${p.mrn}`),
			identifier: [
				{
					use: 'usual',
					type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }], text: 'Medical record number' },
					system: MRN_SYSTEM,
					value: p.mrn
				}
			],
			name: [
				{ use: 'official', family: p.legalLast, given: [p.legalFirst] },
				...(p.preferredName ? [{ use: 'usual', family: p.legalLast, given: [p.preferredName] }] : [])
			],
			birthDate: p.dob
		});
		// Only the visit chosen above exports allergies ('unknown' exports nothing).
		const allergies: AllergyStatus = allergySource.get(p.id) === item ? allergiesFor(item) : { kind: 'unknown' };
		if (allergies.kind === 'listed') {
			for (const a of allergies.allergies) {
				add(`allergy:${p.id}:${a.title}`, {
					resourceType: 'AllergyIntolerance',
					text: narrative(`Allergy: ${a.title}${a.reaction ? ` (${a.reaction})` : ''}`),
					clinicalStatus: { coding: [{ system: ALLERGY_CLINICAL, code: 'active' }] },
					code: { text: a.title },
					patient: { reference: patientRef },
					...(a.reaction ? { reaction: [{ manifestation: [{ text: a.reaction }] }] } : {})
				});
			}
		} else if (allergies.kind === 'none') {
			// A deliberate "No known allergies" is exported as such; "not recorded" exports nothing.
			add(`allergy:${p.id}:none`, {
				resourceType: 'AllergyIntolerance',
				text: narrative(`No known allergies (confirmed by ${allergies.confirmedBy} on ${allergies.confirmedAt.slice(0, 10)})`),
				clinicalStatus: { coding: [{ system: ALLERGY_CLINICAL, code: 'active' }] },
				verificationStatus: { coding: [{ system: ALLERGY_VERIFICATION, code: 'confirmed' }] },
				code: { coding: [{ system: SNOMED, code: '716186003', display: 'No known allergy' }], text: 'No known allergies' },
				patient: { reference: patientRef },
				recordedDate: allergies.confirmedAt
			});
		}
		const practitionerRef = add(`practitioner:${e.providerId}`, {
			resourceType: 'Practitioner',
			text: narrative(e.provider),
			name: [{ text: e.provider }]
		});
		// D43: the provider is the primary performer, the technician a secondary one.
		const PARTICIPATION = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType';
		const participant = [
			{ type: [{ coding: [{ system: PARTICIPATION, code: 'PPRF', display: 'primary performer' }] }], individual: { reference: practitionerRef } }
		];
		if (e.technicianId != null && e.technician) {
			const techRef = add(`practitioner:${e.technicianId}`, {
				resourceType: 'Practitioner',
				text: narrative(e.technician),
				name: [{ text: e.technician }]
			});
			participant.push({ type: [{ coding: [{ system: PARTICIPATION, code: 'SPRF', display: 'secondary performer' }] }], individual: { reference: techRef } });
		}
		const encounterRef = add(`encounter:${e.id}`, {
			resourceType: 'Encounter',
			text: narrative(encounterText(e.visitType, e.date, e.provider, plan, signature)),
			identifier: [{ system: 'urn:openvision:encounter', value: String(e.id) }],
			status: e.date < today ? 'finished' : 'in-progress',
			class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
			type: [{ text: e.visitType }],
			subject: { reference: patientRef },
			participant,
			period: { start: e.date }
		});
		for (const f of FIELDS) {
			const value = findings[f.id]?.value?.trim();
			if (!value) continue;
			const site = EYE_SITE[f.eye];
			add(`obs:${e.id}:${f.id}`, {
				resourceType: 'Observation',
				text: narrative(`${f.label}: ${value}`),
				status: signed ? 'final' : 'preliminary',
				category: [
					{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'exam', display: 'Exam' }] }
				],
				code: { coding: [{ system: FHIR_CODESYSTEM, code: f.id, display: f.label }], text: f.label },
				subject: { reference: patientRef },
				encounter: { reference: encounterRef },
				effectiveDateTime: e.date,
				performer: [{ reference: practitionerRef }],
				valueString: value,
				...(findings[f.id]?.isDefault ? { note: [{ text: "Provider's default normal value" }] } : {}),
				bodySite: { coding: [{ system: SNOMED, ...site }], text: f.eye }
			});
		}
		// Impression/Plan (D47): one Condition per item, coded or not; the plan text is its note.
		(plan?.items ?? []).forEach((item, i) => {
			const coding = conditionCodings(item);
			const title = item.title.trim() || item.codes || 'Impression';
			add(`condition:${e.id}:${i}:${item.title}:${item.codes}`, {
				resourceType: 'Condition',
				text: narrative(`${title}${item.codes ? ` (${item.codes})` : ''}${item.plan ? `. Plan: ${item.plan}` : ''}`),
				clinicalStatus: { coding: [{ system: CONDITION_CLINICAL, code: 'active' }] },
				verificationStatus: { coding: [{ system: CONDITION_VERIFICATION, code: signed ? 'confirmed' : 'provisional' }] },
				category: [{ coding: [{ system: CONDITION_CATEGORY, code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
				code: { ...(coding.length ? { coding } : {}), text: title },
				subject: { reference: patientRef },
				encounter: { reference: encounterRef },
				recordedDate: e.date,
				...(item.plan.trim() ? { note: [{ text: item.plan }] } : {})
			});
		});
		// Addenda (D36): corrections written after signing. The findings above stay as signed ("final"),
		// so without these a receiving chart would hold the uncorrected record. Each addendum is its own
		// DocumentReference (LOINC 55107-7 "Addendum Document"), the resource EHRs list as a clinical
		// note, with the text as a plain-text attachment, the author and time, and context.encounter
		// tying it to the visit. relatesTo "appends" is not used: in R4 it can only point at another
		// DocumentReference, and the exam itself is an Encounter with Observations, not a document. The
		// Encounter narrative repeats the signature and addenda for systems that show only narratives.
		(signature?.addenda ?? []).forEach((a, i) => {
			add(`addendum:${e.id}:${i}:${a.at}`, {
				resourceType: 'DocumentReference',
				text: narrative(`Addendum by ${a.by} on ${a.at}: ${a.text}`),
				status: 'current',
				docStatus: 'final',
				type: { coding: [{ system: LOINC, code: '55107-7', display: 'Addendum Document' }], text: 'Addendum' },
				category: [{ coding: [{ system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category', code: 'clinical-note', display: 'Clinical Note' }] }],
				subject: { reference: patientRef },
				date: a.at,
				// Addenda store the author's name only, so a display-only reference (valid in R4).
				author: [{ display: a.by }],
				description: `Addendum to the ${e.date} eye exam`,
				content: [
					{
						attachment: {
							contentType: 'text/plain; charset=utf-8',
							language: 'en',
							data: Buffer.from(a.text, 'utf8').toString('base64'),
							title: 'Addendum',
							creation: a.at
						}
					}
				],
				context: { encounter: [{ reference: encounterRef }], period: { start: e.date } }
			});
		});
	}

	return {
		resourceType: 'Bundle',
		id: uuid(`bundle:${now.toISOString()}:${items.map((i) => i.encounter.id).join(',')}`),
		type: 'collection',
		timestamp: now.toISOString(),
		entry: [...resources.values()].map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r }))
	};
}

/**
 * The Encounter narrative; the orders and next visit ride along in it (D47: no CarePlan yet), then the
 * signature and each addendum, as on the printed report.
 */
function encounterText(
	visitType: string,
	date: string,
	provider: string,
	plan: PlanReport | null | undefined,
	signature: Signature | null | undefined
): string {
	const parts = [`${visitType} eye exam on ${date} with ${provider}.`];
	if (plan?.orders.length) parts.push(`Orders/Next visit: ${plan.orders.join('; ')}.`);
	if (plan?.orderPlan.trim()) parts.push(`${plan.orders.length ? '' : 'Next visit: '}${plan.orderPlan.trim()}`);
	if (signature) {
		parts.push(`Signed by ${signature.signedBy} on ${signature.signedAt}.`);
		for (const a of signature.addenda) parts.push(`Addendum by ${a.by} on ${a.at}: ${a.text}`);
	}
	return parts.join(' ');
}

/** e.g. openvision-2026-10-06-3-visits */
export function exportName(items: PrintableEncounter[], now = new Date()): string {
	const d = now.toISOString().slice(0, 10);
	return items.length === 1
		? `openvision-${items[0].patient.mrn}-${items[0].encounter.date}`
		: `openvision-${d}-${items.length}-visits`;
}
