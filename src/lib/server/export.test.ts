import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { getPrintables, logPrint } from './report.ts';
import { exportName, FHIR_CODESYSTEM, ICD11_URI_EXTENSION, toCsv, toFhirBundle } from './export.ts';
import { addItem, saveOrders } from './plan.ts';
import { updateCodeSettings } from './settings.ts';
import { signExam } from './signing.ts';
import { loadIcd11 } from './icd11.ts';
import { ICD11_FIXTURE } from '#lib/codesets/icd11.fixture.ts';
import { saveFindings } from './exam.ts';
import { setNoKnownAllergies } from './patients.ts';
import { FIELDS } from '#lib/exam/catalog.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

/** Minimal RFC 4180 reader for checking our own output. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = '';
	let q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (q) {
			if (c === '"' && text[i + 1] === '"') (cur += '"'), i++;
			else if (c === '"') q = false;
			else cur += c;
		} else if (c === '"') q = true;
		else if (c === ',') row.push(cur), (cur = '');
		else if (c === '\r' && text[i + 1] === '\n') row.push(cur), rows.push(row), (row = []), (cur = ''), i++;
		else cur += c;
	}
	return rows;
}

describe('CSV', () => {
	it('one row per visit, one column per field, Excel-friendly BOM and CRLF', () => {
		const csv = toCsv(getPrintables(db, [4, 3]));
		expect(csv.startsWith('﻿')).toBe(true);
		const rows = parseCsv(csv.slice(1));
		expect(rows).toHaveLength(3);
		expect(rows[0].length).toBe(11 + FIELDS.length);
		expect(rows.every((r) => r.length === rows[0].length)).toBe(true);
		const col = (name: string) => rows[0].indexOf(name);
		expect(rows[1][col('Visit date')]).toBe('2024-08-02');
		expect(rows[2][col('Fundus: C/D ratio OS')]).toBe('0.5');
		expect(rows[2][col('Allergies')]).toBe('Sulfa (hives)');
	});

	it('quotes commas, quotes and newlines', () => {
		saveFindings(db, 1, 1, 1, [{ field: 'RETINA_COMMENTS', value: 'line 1, "quoted"\nline 2', isDefault: false }]);
		const rows = parseCsv(toCsv(getPrintables(db, [1])).slice(1));
		expect(rows[1][rows[0].indexOf('Fundus: Fundus (retina) comments')]).toBe('line 1, "quoted"\nline 2');
	});

	it('neutralises spreadsheet formulas but keeps the clinical text readable', () => {
		saveFindings(db, 1, 1, 1, [
			{ field: 'ODLENS', value: '+1 NS', isDefault: false },
			{ field: 'OSLENS', value: '=HYPERLINK("http://x")', isDefault: false }
		]);
		const rows = parseCsv(toCsv(getPrintables(db, [1])).slice(1));
		expect(rows[1][rows[0].indexOf('Anterior segment: Lens OD')]).toBe("'+1 NS");
		expect(rows[1][rows[0].indexOf('Anterior segment: Lens OS')]).toBe('\'=HYPERLINK("http://x")');
	});

	it('allergies say Not recorded or NKDA instead of a blank cell', () => {
		const allergyCell = () => {
			const rows = parseCsv(toCsv(getPrintables(db, [2])).slice(1));
			return rows[1][rows[0].indexOf('Allergies')];
		};
		expect(allergyCell()).toBe('Not recorded');
		setNoKnownAllergies(db, 2, 1, true);
		expect(allergyCell()).toBe('NKDA');
	});

	it('legal and preferred names in separate columns', () => {
		const rows = parseCsv(toCsv(getPrintables(db, [2])).slice(1));
		const c = (n: string) => rows[1][rows[0].indexOf(n)];
		expect([c('First name'), c('Last name'), c('Preferred name')]).toEqual(['Alexandra', 'Sample', 'Alex']);
	});
});

describe('FHIR R4 bundle', () => {
	const bundle = () => toFhirBundle(getPrintables(db, [3, 4, 2]), new Date('2026-10-06T12:00:00Z')) as {
		resourceType: string;
		type: string;
		entry: { fullUrl: string; resource: Record<string, any> }[];
	};
	const of = (b: ReturnType<typeof bundle>, t: string) => b.entry.filter((e) => e.resource.resourceType === t).map((e) => e.resource);

	it('is a collection with one Patient per person and one Encounter per visit', () => {
		const b = bundle();
		expect(b.resourceType).toBe('Bundle');
		expect(b.type).toBe('collection');
		expect(of(b, 'Patient')).toHaveLength(2);
		expect(of(b, 'Encounter')).toHaveLength(3);
		expect(of(b, 'Practitioner')).toHaveLength(1);
		expect(of(b, 'AllergyIntolerance')[0].code.text).toBe('Sulfa');
	});

	it('confirmed NKDA exports as SNOMED "No known allergy"; not recorded exports nothing', () => {
		const alexAllergies = () =>
			of(toFhirBundle(getPrintables(db, [2]), new Date('2026-10-06T12:00:00Z')) as ReturnType<typeof bundle>, 'AllergyIntolerance');
		expect(alexAllergies()).toEqual([]);
		setNoKnownAllergies(db, 2, 1, true, new Date('2026-10-06T09:00:00Z'));
		const [nka] = alexAllergies();
		expect(nka.code.coding[0]).toEqual({ system: 'http://snomed.info/sct', code: '716186003', display: 'No known allergy' });
		expect(nka.verificationStatus.coding[0].code).toBe('confirmed');
		expect(nka.recordedDate).toBe('2026-10-06T09:00:00.000Z');
	});

	it('every reference resolves inside the bundle', () => {
		const b = bundle();
		const urls = new Set(b.entry.map((e) => e.fullUrl));
		const refs = JSON.stringify(b).match(/"reference":"([^"]+)"/g)!.map((m) => m.slice(13, -1));
		expect(refs.length).toBeGreaterThan(20);
		for (const r of refs) expect(urls.has(r), r).toBe(true);
		for (const e of b.entry) expect(e.fullUrl).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it('findings become preliminary exam Observations with laterality', () => {
		const obs = of(bundle(), 'Observation');
		const cup = obs.find((o) => o.code.coding[0].code === 'OSCUP' && o.effectiveDateTime === '2025-09-14')!;
		expect(cup.valueString).toBe('0.5');
		expect(cup.status).toBe('preliminary');
		expect(cup.code.coding[0].system).toBe(FHIR_CODESYSTEM);
		expect(cup.bodySite.coding[0].code).toBe('8966001'); // left eye
		expect(cup.category[0].coding[0].code).toBe('exam');
		const hertelBase = obs.find((o) => o.code.coding[0].code === 'HERTELBASE')!;
		expect(hertelBase.bodySite.coding[0].code).toBe('40638003'); // both eyes
	});

	it('patients carry MRN, legal and preferred names', () => {
		const alex = of(bundle(), 'Patient').find((p) => p.identifier[0].value === '000124')!;
		expect(alex.name).toEqual([
			{ use: 'official', family: 'Sample', given: ['Alexandra'] },
			{ use: 'usual', family: 'Sample', given: ['Alex'] }
		]);
		expect(alex.birthDate).toBe('1991-11-02');
	});

	it('ids are stable across exports', () => {
		const a = bundle().entry.map((e) => e.fullUrl).sort();
		const b = bundle().entry.map((e) => e.fullUrl).sort();
		expect(a).toEqual(b);
	});

	it('past visits are finished, today is in progress', () => {
		const enc = of(toFhirBundle(getPrintables(db, [1, 4]), new Date('2026-10-06T12:00:00Z')) as any, 'Encounter');
		expect(enc.map((e: any) => e.status).sort()).toEqual(['finished', 'in-progress']);
	});
});

describe('FHIR impression/plan (D47)', () => {
	const NOW = new Date('2026-10-06T12:00:00Z');
	const resources = (ids = [1]) =>
		(toFhirBundle(getPrintables(db, ids), NOW) as { entry: { resource: Record<string, any> }[] }).entry.map((e) => e.resource);
	const conditions = (ids = [1]) => resources(ids).filter((r) => r.resourceType === 'Condition');

	it('one Condition per impression item, coded or not, with the plan as its note', () => {
		addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'H40.003', plan: 'OCT RNFL next visit' });
		addItem(db, 1, 1, 1, { title: 'Floaters, no tear seen' });
		const [glc, floaters] = conditions();
		expect(glc.code).toEqual({
			coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'H40.003', display: 'Preglaucoma, unspecified, bilateral' }],
			text: 'Glaucoma suspect'
		});
		expect(glc.note).toEqual([{ text: 'OCT RNFL next visit' }]);
		expect(glc.category[0].coding[0]).toMatchObject({ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'encounter-diagnosis' });
		expect(glc.clinicalStatus.coding[0].code).toBe('active');
		expect(glc.verificationStatus.coding[0].code).toBe('provisional');
		expect(glc.recordedDate).toBe('2026-10-06');
		expect(floaters.code).toEqual({ text: 'Floaters, no tear seen' });
		expect(floaters).not.toHaveProperty('note');
		// Subject and encounter resolve inside the bundle.
		const all = resources();
		const ref = (t: string) => `urn:uuid:${all.find((r) => r.resourceType === t)!.id}`;
		expect(glc.subject.reference).toBe(ref('Patient'));
		expect(glc.encounter.reference).toBe(ref('Encounter'));
	});

	it('ICD-11: code with extensions, WHO titles and the WHO URI of each part in our extension', () => {
		loadIcd11(db, ICD11_FIXTURE, 'fixture-test');
		updateCodeSettings(db, { codeSet: 'icd11' }, null);
		addItem(db, 1, 1, 1, { codes: '9c61.0z&xk9j' });
		const [c] = conditions();
		expect(c.code.coding).toEqual([
			{
				extension: [
					{ url: ICD11_URI_EXTENSION, valueUri: 'http://id.who.int/icd/release/11/mms/1849071057/unspecified' },
					{ url: ICD11_URI_EXTENSION, valueUri: 'http://id.who.int/icd/release/11/mms/627678743' }
				],
				system: 'http://id.who.int/icd/release/11/mms',
				code: '9C61.0Z&XK9J',
				display: 'Primary open-angle glaucoma, unspecified; Bilateral'
			}
		]);
		expect(c.code.text).toBe('Primary open-angle glaucoma, unspecified');
	});

	it('signed exams: Conditions confirmed, Observations final; orders ride in the Encounter narrative', () => {
		addItem(db, 1, 1, 1, { title: 'Glaucoma suspect', codes: 'H40.003' });
		saveFindings(db, 1, 1, 1, [{ field: 'ODCUP', value: '0.4', isDefault: false }]);
		saveOrders(db, 1, 1, 1, [], 'RTC 6 months with OCT');
		expect(resources().find((r) => r.resourceType === 'Observation')!.status).toBe('preliminary');
		signExam(db, 1, 1, { id: 1, displayName: 'Dr. Example', role: 'provider' }, null, NOW);
		const after = resources();
		expect(after.filter((r) => r.resourceType === 'Observation').every((o) => o.status === 'final')).toBe(true);
		expect(after.find((r) => r.resourceType === 'Condition')!.verificationStatus.coding[0].code).toBe('confirmed');
		expect(after.find((r) => r.resourceType === 'Encounter')!.text.div).toContain('Next visit: RTC 6 months with OCT');
	});
});

describe('export bookkeeping', () => {
	it('logs the export kind', () => {
		logPrint(db, 1, [1, 4], 'fhir');
		expect(db.prepare('SELECT kind, COUNT(*) AS n FROM print_log GROUP BY kind').all()).toEqual([{ kind: 'fhir', n: 2 }]);
	});
	it('names files by patient and date, or by count', () => {
		const now = new Date('2026-10-06T12:00:00Z');
		expect(exportName(getPrintables(db, [4]), now)).toBe('openvision-000123-2025-09-14');
		expect(exportName(getPrintables(db, [1, 2, 3]), now)).toBe('openvision-2026-10-06-3-visits');
	});
});
