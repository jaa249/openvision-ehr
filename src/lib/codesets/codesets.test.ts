import { describe, expect, it } from 'vitest';
import {
	CODE_SETS,
	codeSetOfCode,
	codeSetsShort,
	codeTextFor,
	icd11Normalize,
	isDxCode,
	normalizeCode,
	spellingVariants,
	splitCodeText,
	stripCodeTags,
	withLaterality
} from './index.ts';
import { memoryIcd11Lookup, parseIcd11File, parseTsv, resolveIcd11 } from './icd11.ts';
import { HAVE_ICD11_FILE, ICD11_FIXTURE, needsCodes } from './icd11.fixture.ts';
import { parseNewDx } from '#lib/plan/newdx.ts';

describe('code sets', () => {
	it('labels, tags and FHIR systems', () => {
		expect(CODE_SETS.icd10cm).toMatchObject({ label: 'ICD-10-CM (United States)', tag: 'ICD10', system: 'http://hl7.org/fhir/sid/icd-10-cm' });
		expect(CODE_SETS.icd11).toMatchObject({ label: 'ICD-11 (WHO)', tag: 'ICD11', system: 'http://id.who.int/icd/release/11/mms' });
	});

	it('normalises a typed code per set', () => {
		expect(normalizeCode('icd10cm', 'h4011')).toBe('H40.11');
		expect(normalizeCode('icd10cm', '9C61.0Z')).toBeNull();
		expect(normalizeCode('icd11', ' 9c61.0z & xk9j ')).toBe('9C61.0Z&XK9J');
		expect(icd11Normalize('ICD11: 9C610Z')).toBe('9C61.0Z');
		expect(icd11Normalize('9B10')).toBe('9B10');
		expect(icd11Normalize('H40.11')).toBeNull(); // ICD-10 shape: 2nd character is a digit
		expect(icd11Normalize('9C61.0Z&9B10')).toBeNull(); // only extension codes after "&"
		expect(icd11Normalize('glaucoma')).toBeNull();
	});

	it('tells the sets apart by shape', () => {
		expect(codeSetOfCode('H40.11')).toBe('icd10cm');
		expect(codeSetOfCode('9C61.0Z&XK9J')).toBe('icd11');
		expect(codeSetOfCode('word')).toBeNull();
		expect(isDxCode('1A00')).toBe(true);
		expect(codeSetsShort(['H40.11', '9B10.Z'])).toBe('ICD-10-CM and ICD-11');
		expect(codeSetsShort(['H40.11', '9B10.Z'], (xs) => new Intl.ListFormat('es', { type: 'conjunction' }).format(xs))).toBe('ICD-10-CM e ICD-11');
	});

	it('laterality goes in an extension and replaces an earlier eye', () => {
		expect(withLaterality('9B10.Z', 'R')).toBe('9B10.Z&XK9K');
		expect(withLaterality('9B10.Z&XK9K', 'L')).toBe('9B10.Z&XK8G');
		expect(withLaterality('9B10.Z&XK8G', 'B')).toBe('9B10.Z&XK9J');
		expect(withLaterality('9B10.Z&XK9J', null)).toBe('9B10.Z');
	});

	it('code text keeps the set tag; titles with "; " survive splitting; paper drops the tags', () => {
		const t = codeTextFor('icd11', [
			{ code: '9C61.0Z&XK9J', description: 'Primary open-angle glaucoma, unspecified; Bilateral' },
			{ code: '9B10.Z', description: 'Cataract, unspecified' }
		]);
		expect(t).toBe('ICD11:9C61.0Z&XK9J (Primary open-angle glaucoma, unspecified; Bilateral); ICD11:9B10.Z (Cataract, unspecified)');
		expect(splitCodeText(t).map((c) => [c.code, c.description])).toEqual([
			['9C61.0Z&XK9J', 'Primary open-angle glaucoma, unspecified; Bilateral'],
			['9B10.Z', 'Cataract, unspecified']
		]);
		expect(codeTextFor('icd10cm', [{ code: 'H40.11', description: '' }])).toBe('ICD10:H40.11');
		expect(stripCodeTags(t)).toBe('9C61.0Z&XK9J (Primary open-angle glaucoma, unspecified; Bilateral); 9B10.Z (Cataract, unspecified)');
		expect(stripCodeTags('ICD10:H25.13 (x)')).toBe('H25.13 (x)');
	});

	it('British spellings for WHO titles', () => {
		expect(spellingVariants('Hemorrhage')).toEqual(['hemorrhage', 'haemorrhage']);
		expect(spellingVariants('papilledema')).toContain('papilloedema');
		expect(spellingVariants('glaucoma')).toEqual(['glaucoma']);
	});
});

describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('ICD-11 file and validation (fixture of real rows)', HAVE_ICD11_FILE), () => {
	const lookup = memoryIcd11Lookup(ICD11_FIXTURE ? parseIcd11File(ICD11_FIXTURE) : []);

	it('reads quoted fields with "" escapes, tabs and newlines inside quotes, and a BOM', () => {
		expect(parseTsv('﻿a\t"b ""x""\tc\nd"\te\n1\t2')).toEqual([
			['a', 'b "x"\tc\nd', 'e'],
			['1', '2']
		]);
		const g = lookup.get('9C61.0Z')!;
		expect(g).toMatchObject({ title: 'Primary open-angle glaucoma, unspecified', leaf: true, residual: true, chapter: '09' });
		expect(g.uri).toBe('http://id.who.int/icd/release/11/mms/1849071057/unspecified');
	});

	it('a code to save: leaf stem plus chapter X extensions, titles joined, URIs kept', () => {
		expect(resolveIcd11(lookup.get, '9c61.0z&xk9j')).toEqual({
			code: '9C61.0Z&XK9J',
			description: 'Primary open-angle glaucoma, unspecified; Bilateral',
			uris: 'http://id.who.int/icd/release/11/mms/1849071057/unspecified&http://id.who.int/icd/release/11/mms/627678743'
		});
		expect(resolveIcd11(lookup.get, '9C61.0')).toEqual({ error: '9C61.0 is a category; choose one of the more specific codes under it.' });
		expect(resolveIcd11(lookup.get, 'XK9J')).toMatchObject({ error: expect.stringContaining('extension code') });
		expect(resolveIcd11(lookup.get, '9B10.Z&XK9X')).toEqual({ error: 'XK9X is not an ICD-11 extension code.' });
		expect(resolveIcd11(lookup.get, '9Z99')).toEqual({ error: '9Z99 is not in the ICD-11 code set.' });
		expect(resolveIcd11(lookup.get, 'H40.11')).toEqual({ error: '"H40.11" is not an ICD-11 code.' });
	});
});

describe('New Dx with ICD-11', () => {
	it('a trailing ICD-11 code (with an eye) becomes the code; words stay in the title', () => {
		expect(parseNewDx('POAG OU 9C61.0Z&XK9J\nRTC 3 months', 'icd11')).toEqual({ title: 'POAG OU', code: '9C61.0Z&XK9J', plan: 'RTC 3 months' });
		expect(parseNewDx('Cataract ICD11:9b10z', 'icd11')).toEqual({ title: 'Cataract', code: '9B10.Z', plan: '' });
		expect(parseNewDx('Check HbA1c', 'icd11')).toEqual({ title: 'Check HbA1c', code: '', plan: '' });
		// An ICD-10-CM token is not a code for an ICD-11 practice, and the reverse.
		expect(parseNewDx('Glaucoma H40.11', 'icd11')).toEqual({ title: 'Glaucoma H40.11', code: '', plan: '' });
		expect(parseNewDx('Glaucoma 9C61.0Z')).toEqual({ title: 'Glaucoma 9C61.0Z', code: '', plan: '' });
	});
});
