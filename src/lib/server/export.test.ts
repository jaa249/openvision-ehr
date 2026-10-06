import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { getPrintables, logPrint } from './report.ts';
import { exportName, FHIR_CODESYSTEM, toCsv, toFhirBundle } from './export.ts';
import { saveFindings } from './exam.ts';
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
		expect(rows[0].length).toBe(10 + FIELDS.length);
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
