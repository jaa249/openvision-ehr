// Findings engine with ICD-11 (D44): WHO titles + laterality extension, never the terms' ICD-10-CM codes.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { findingCandidates, issueCandidates, type EngineIssue } from './engine.ts';
import { CODING_TERMS, type CodingTerm } from './terms.ts';
import { bestIcd11, memoryIcd11Lookup, parseIcd11File, type Icd11Lookup } from '#lib/codesets/icd11.ts';
import { HAVE_ICD11_FILE, ICD11_FILE_PATH, ICD11_FIXTURE, needsCodes } from '#lib/codesets/icd11.fixture.ts';
import { ICD10_CODE_RE } from '#lib/codesets/index.ts';
import { EXAM_SECTIONS } from '#lib/exam/catalog.ts';

const VISIT = '2026-10-06';
const fixture = memoryIcd11Lookup(ICD11_FIXTURE ? parseIcd11File(ICD11_FIXTURE) : []);
const run = (findings: Record<string, string>, issues: EngineIssue[] = [], icd11: Icd11Lookup = fixture, terms?: CodingTerm[]) =>
	findingCandidates({ findings, issues, visitDate: VISIT, codeSet: 'icd11', icd11, terms });

const issue = (over: Partial<EngineIssue>): EngineIssue => ({ id: 1, type: 'PMH', title: '', codes: '', begin: '', comments: '', active: true, ...over });

describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('ICD-11 engine (fixture rows)', HAVE_ICD11_FILE), () => {
	it('searches WHO titles and adds the eye: both eyes = Bilateral, one eye = Right / Left', () => {
		const ou = run({ ODLENS: 'cataract', OSLENS: 'cataract' });
		expect(ou).toMatchObject([{ title: 'Cataract OU', codes: '9B10.Z&XK9J', codeText: 'ICD11:9B10.Z&XK9J (Cataract, unspecified; Bilateral)' }]);
		expect(run({ LLL: 'ectropion' })).toMatchObject([{ codes: '9A03.2Z&XK8G' }]);
		expect(run({ RLL: 'cicatricial ectropion' })).toMatchObject([{ codes: '9A03.20&XK9K' }]);
		expect(run({ ODCONJ: 'conjunctivitis' })).toMatchObject([{ codes: '9A60.Z&XK9K' }]);
	});

	it('uses British spellings and the field description; never a code from the term list', () => {
		expect(run({ ODCONJ: 'subconjunctival hemorrhage' })).toMatchObject([{ codes: '9A61.5&XK9K' }]);
		expect(run({ OSDISC: 'papilledema' })).toMatchObject([{ codes: '9C40.A0&XK8G' }]);
		for (const c of run({ ODLENS: 'NS', ODCONJ: 'pinguecula', OSCORNEA: 'KCS' })) {
			for (const code of c.codes.split(', ').filter(Boolean)) expect(ICD10_CODE_RE.test(code)).toBe(false);
		}
	});

	it('no good hit = an uncoded row, never a guess', () => {
		// No WHO title for the term and no plain words for it: no code.
		const r = run({ ODCORNEA: 'SPK' });
		expect(r).toMatchObject([{ title: 'Superficial punctate keratitis OD', codes: '', codeText: '' }]);
	});

	it('plain words for the broader condition, when the term finds no title (words11)', () => {
		// "Nuclear sclerosis" is not a WHO title; its plain words "age-related cataract" are.
		const r = run({ ODLENS: 'nuclear sclerosis' });
		expect(r).toMatchObject([{ title: 'Nuclear sclerosis OD', codes: '9B10.0Z&XK9K' }]);
	});

	it('diabetic retinopathy: needs diabetes in the history (title, or an ICD-11 code whose WHO title says so)', () => {
		const f = { ODVESSELS: 'NVE', OSMACULA: 'scattered BDR' };
		expect(run(f)).toEqual([]);
		const byTitle = run(f, [issue({ title: 'Type 2 diabetes' })]);
		expect(byTitle).toMatchObject([{ title: 'Diabetic retinopathy OU', codes: '9B71.01&XK9K, 9B71.00&XK8G' }]);
		const byCode = run({ ODDISC: 'NVD', OSDISC: 'NVD' }, [issue({ title: 'Sugar', codes: '5A11', codeSystem: 'icd11' })]);
		expect(byCode).toMatchObject([{ codes: '9B71.01&XK9J' }]);
		// An ICD-10-CM code on the issue is not read for ICD-11 (no crosswalk).
		expect(run(f, [issue({ title: 'Sugar', codes: 'E11.9' })])).toEqual([]);
	});

	it('issue rows carry codes only of the current set', () => {
		const issues = [
			issue({ id: 1, type: 'POH', title: 'Glaucoma', codes: '9C61.0Z&XK9J', codeSystem: 'icd11' }),
			issue({ id: 2, type: 'PMH', title: 'Hypertension', codes: 'I10' })
		];
		const { poh, pmh } = issueCandidates(undefined, issues, { codeSet: 'icd11', icd11: fixture });
		expect(poh).toMatchObject([{ codes: '9C61.0Z&XK9J', codeText: 'ICD11:9C61.0Z&XK9J (Primary open-angle glaucoma, unspecified; Bilateral)' }]);
		expect(pmh).toMatchObject([{ title: 'Hypertension', codes: '', codeText: '' }]);
		// And the ICD-10-CM builder ignores ICD-11 issue codes.
		expect(issueCandidates(undefined, issues).poh).toMatchObject([{ codes: '' }]);
	});
});

// ---------- every CODING_TERMS term against WHO's real 2026-01 file ----------

const ROOTS = new Map(EXAM_SECTIONS.flatMap((s) => s.rows.map((r) => [r.id, r.od] as const)));

describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('ICD-11 hit rate over CODING_TERMS (real file)', HAVE_ICD11_FILE), () => {
	let real: Icd11Lookup;
	beforeAll(() => {
		real = memoryIcd11Lookup(parseIcd11File(gunzipSync(readFileSync(ICD11_FILE_PATH!)).toString('utf8')));
	});

	it('codes most terms, never with a chapter X stem or an ICD-10-CM code, and records the misses', () => {
		const issues = [
			issue({ id: 1, title: 'Type 2 diabetes' }),
			issue({ id: 2, type: 'POS', title: 'Cataract extraction with IOL OD', begin: '2026-09-20' })
		];
		const hits: { term: string; location: string; code: string; title: string }[] = [];
		const misses: string[] = [];
		for (const row of CODING_TERMS) {
			const field = ROOTS.get(row.location) ?? row.location;
			const out = run({ [field]: row.term }, issues, real, [row]);
			const code = out[0]?.codes.split(', ')[0] ?? '';
			if (!code) {
				misses.push(`${row.term} (${row.location})`);
				continue;
			}
			const stem = code.split('&')[0];
			expect(real.get(stem)?.chapter).not.toBe('X');
			expect(real.get(stem)?.leaf).toBe(true);
			expect(ICD10_CODE_RE.test(stem)).toBe(false);
			expect(code.endsWith('&XK9K')).toBe(true); // the finding was in the right eye
			hits.push({ term: row.term, location: row.location, code, title: out[0].description.replace(/\n/g, ' | ') });
		}
		if (process.env.OPENVISION_ICD11_REPORT) {
			writeFileSync(
				process.env.OPENVISION_ICD11_REPORT,
				JSON.stringify({ terms: CODING_TERMS.length, hits: hits.length, misses, sample: hits }, null, 1)
			);
		}
		expect(hits.length + misses.length).toBe(CODING_TERMS.length);
		expect(hits.length).toBeGreaterThanOrEqual(105);
	});

	it('picks the unspecified residual for a generic term and nothing for a tie', () => {
		expect(bestIcd11(real, { words: ['glaucoma'] })?.code).toBe('9C61.Z');
		expect(bestIcd11(real, { words: ['ptosis'], context: ['upper eyelid'] })?.code).toBe('9A03.0Z');
		expect(bestIcd11(real, { words: ['blepharitis'] })).toBeNull(); // posterior or infectious: we cannot tell
	});
});
