// Data export: CSV for spreadsheets, FHIR R4 for other EHRs (decision D19).
import { createHash } from 'node:crypto';
import { FIELDS, SECTION_DEF } from '#lib/exam/catalog.ts';
import type { PrintableEncounter } from '#lib/exam/types.ts';

// ---------- CSV ----------

const PATIENT_COLUMNS = ['Encounter ID', 'Visit date', 'Visit type', 'Provider', 'MRN', 'Last name', 'First name', 'Preferred name', 'DOB', 'Allergies'];

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
	const header = [...PATIENT_COLUMNS, ...FIELDS.map((f) => `${SECTION_DEF.get(f.section)?.title.split(' (')[0]}: ${f.label}`)];
	const rows = items.map(({ patient: p, encounter: e, findings }) => {
		return [
			String(e.id),
			e.date,
			e.visitType,
			e.provider,
			p.mrn,
			p.legalLast,
			p.legalFirst,
			p.preferredName ?? '',
			p.dob,
			p.allergies.map((a) => a.title + (a.reaction ? ` (${a.reaction})` : '')).join('; '),
			...FIELDS.map((f) => findings[f.id]?.value ?? '')
		];
	});
	return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------- FHIR R4 ----------

export const FHIR_CODESYSTEM = 'https://github.com/jaa249/openvision-ehr/fhir/CodeSystem/exam-finding';
const MRN_SYSTEM = 'urn:openvision:mrn';
const SNOMED = 'http://snomed.info/sct';
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

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Human-readable summary every resource should carry (FHIR dom-6). */
const narrative = (t: string) => ({
	status: 'generated',
	div: `<div xmlns="http://www.w3.org/1999/xhtml">${xml(t)}</div>`
});

/**
 * A FHIR R4 "collection" Bundle: Patient, Practitioner, Encounter, AllergyIntolerance and one
 * Observation per recorded finding. Observations are "preliminary" because exams are not signed yet.
 */
export function toFhirBundle(items: PrintableEncounter[], now = new Date()): Record<string, unknown> {
	const resources = new Map<string, Resource>();
	const add = (key: string, r: Omit<Resource, 'id'>) => {
		const id = uuid(key);
		if (!resources.has(id)) resources.set(id, { ...r, id } as Resource);
		return `urn:uuid:${id}`;
	};
	const today = now.toISOString().slice(0, 10);

	for (const { patient: p, encounter: e, findings } of items) {
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
		for (const a of p.allergies) {
			add(`allergy:${p.id}:${a.title}`, {
				resourceType: 'AllergyIntolerance',
				text: narrative(`Allergy: ${a.title}${a.reaction ? ` (${a.reaction})` : ''}`),
				clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
				code: { text: a.title },
				patient: { reference: patientRef },
				...(a.reaction ? { reaction: [{ manifestation: [{ text: a.reaction }] }] } : {})
			});
		}
		const practitionerRef = add(`practitioner:${e.providerId}`, {
			resourceType: 'Practitioner',
			text: narrative(e.provider),
			name: [{ text: e.provider }]
		});
		const encounterRef = add(`encounter:${e.id}`, {
			resourceType: 'Encounter',
			text: narrative(`${e.visitType} eye exam on ${e.date} with ${e.provider}`),
			identifier: [{ system: 'urn:openvision:encounter', value: String(e.id) }],
			status: e.date < today ? 'finished' : 'in-progress',
			class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
			type: [{ text: e.visitType }],
			subject: { reference: patientRef },
			participant: [{ individual: { reference: practitionerRef } }],
			period: { start: e.date }
		});
		for (const f of FIELDS) {
			const value = findings[f.id]?.value?.trim();
			if (!value) continue;
			const site = EYE_SITE[f.eye];
			add(`obs:${e.id}:${f.id}`, {
				resourceType: 'Observation',
				text: narrative(`${f.label}: ${value}`),
				status: 'preliminary',
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
	}

	return {
		resourceType: 'Bundle',
		id: uuid(`bundle:${now.toISOString()}:${items.map((i) => i.encounter.id).join(',')}`),
		type: 'collection',
		timestamp: now.toISOString(),
		entry: [...resources.values()].map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r }))
	};
}

/** e.g. openvision-2026-10-06-3-visits */
export function exportName(items: PrintableEncounter[], now = new Date()): string {
	const d = now.toISOString().slice(0, 10);
	return items.length === 1
		? `openvision-${items[0].patient.mrn}-${items[0].encounter.date}`
		: `openvision-${d}-${items.length}-visits`;
}
