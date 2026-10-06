import { describe, expect, it } from 'vitest';
import { findingCandidates, hasTerm, issueCandidates, recentIolSurgery, runEngine, sideOf, type EngineIssue } from './engine.ts';
import { memoryLookup, parseCodeFile } from './codes.ts';
import { ICD10_FIXTURE } from './icd10.fixture.ts';
import type { CodingTerm } from './terms.ts';

const lookup = memoryLookup(parseCodeFile(ICD10_FIXTURE));
const VISIT = '2026-10-06';
const T2: EngineIssue = { id: 1, type: 'PMH', title: 'Type 2 diabetes', codes: 'E11.9', begin: '2019-06-01', comments: '', active: true };

function run(findings: Record<string, string>, opts: { issues?: EngineIssue[]; terms?: CodingTerm[]; visitDate?: string } = {}) {
	return findingCandidates({ findings, issues: opts.issues ?? [], visitDate: opts.visitDate ?? VISIT, lookup, terms: opts.terms });
}
const byTitle = (list: ReturnType<typeof run>) => Object.fromEntries(list.map((c) => [c.title, c.codes]));

describe('matching', () => {
	it('matches whole words only, case-insensitively', () => {
		expect(hasTerm('Trace NS', 'ns')).toBe(true);
		expect(hasTerm('lens NSAID drops', 'NS')).toBe(false);
		expect(hasTerm('PTOSIS noted', 'ptosis')).toBe(true);
	});
	it('treats the term literally (regex characters are not patterns)', () => {
		expect(hasTerm('cell 1+ flare', '1+')).toBe(true);
		expect(hasTerm('cell 11 flare', '1+')).toBe(false);
		expect(hasTerm('AxC', 'A.C')).toBe(false);
		expect(hasTerm('A.C deep', 'A.C')).toBe(true);
	});
	it('ignores negated mentions ("no", "negative for", "r/o") within the same clause', () => {
		expect(hasTerm('no brow ptosis', 'brow ptosis')).toBe(false);
		expect(hasTerm('BDR, no CSME', 'CSME')).toBe(false);
		expect(hasTerm('no NVD, NVE inferiorly', 'NVE')).toBe(true);
		expect(hasTerm('negative for NVD', 'NVD')).toBe(false);
	});
	it('takes laterality from the field prefix: OD/R right, OS/L left', () => {
		expect(sideOf('ODLENS')).toBe('R');
		expect(sideOf('OSLENS')).toBe('L');
		expect(sideOf('RUL')).toBe('R');
		expect(sideOf('LUL')).toBe('L');
		expect(sideOf('RETINA_COMMENTS')).toBe(null);
	});
});

describe('fixed codes and laterality', () => {
	it('codes one eye with its own laterality and labels the title', () => {
		const [c] = run({ ODLENS: 'trace NS' });
		expect(c.title).toBe('Nuclear sclerosis OD');
		expect(c.codes).toBe('H25.11');
		expect(c.codeText).toBe('ICD10:H25.11 (Age-related nuclear cataract, right eye)');
		expect(c.link).toBe('ODLENS');
		expect(c.kind).toBe('finding');
	});
	it('codes the bilateral code when both eyes match and the family has one', () => {
		const [c] = run({ ODLENS: '2+ NS', OSLENS: '1+ NS' });
		expect(c.title).toBe('Nuclear sclerosis OU');
		expect(c.codes).toBe('H25.13');
		expect(c.link).toBe('ODLENS,OSLENS');
	});
	it('codes right lids as right (FIX: not left) and narrows by the field description', () => {
		expect(byTitle(run({ RUL: 'dermatochalasis' }))).toEqual({ 'Dermatochalasis OD': 'H02.831' });
		expect(byTitle(run({ LUL: 'dermatochalasis' }))).toEqual({ 'Dermatochalasis OS': 'H02.834' });
		expect(byTitle(run({ RLL: 'dermatochalasis' }))).toEqual({ 'Dermatochalasis OD': 'H02.832' });
	});
	it('keeps both eye codes when the family has no bilateral code', () => {
		expect(byTitle(run({ RUL: 'dermatochalasis', LUL: 'dermatochalasis' }))).toEqual({ 'Dermatochalasis OU': 'H02.831, H02.834' });
	});
	it('uses bilateral eyelid codes where they exist', () => {
		expect(byTitle(run({ RUL: 'ptosis', LUL: 'ptosis' }))).toEqual({ 'Ptosis OU': 'H02.403' });
	});
	it('a billable fixed code is used as is (FIX: its own code, not the previous row\'s)', () => {
		const terms: CodingTerm[] = [
			{ term: 'pinguecula', location: 'CONJ', code: 'H11.15' },
			{ term: 'pseudophakia', location: 'LENS', code: 'Z96.1' }
		];
		expect(byTitle(run({ ODCONJ: 'pinguecula', ODLENS: 'pseudophakia' }, { terms }))).toEqual({
			'Pinguecula OD': 'H11.151',
			'Pseudophakia OD': 'Z96.1'
		});
	});
	it('ignores normal-default negations ("no brow ptosis")', () => {
		expect(run({ RBROW: 'no brow ptosis', LBROW: 'brow ptosis' }).map((c) => c.title)).toEqual(['Brow ptosis OS']);
	});
});

describe('specificity', () => {
	it('skips a term an earlier hit in the same field already contains', () => {
		const terms: CodingTerm[] = [
			{ term: 'cicatricial ectropion', location: 'LL', code: 'H02.11' },
			{ term: 'ectropion', location: 'LL', code: 'H02.10' }
		];
		expect(byTitle(run({ RLL: 'cicatricial ectropion', LLL: 'ectropion' }, { terms }))).toEqual({
			'Cicatricial ectropion OD': 'H02.112',
			'Ectropion OS': 'H02.105'
		});
	});
});

describe('path C: code-set search', () => {
	it('searches with the term, the field description and the eye', () => {
		const terms: CodingTerm[] = [
			{ term: 'dermatochalasis', location: 'UL' },
			{ term: 'dermatochalasis', location: 'LL' }
		];
		expect(byTitle(run({ RUL: 'dermatochalasis' }, { terms }))).toEqual({ 'Dermatochalasis OD': 'H02.831' });
		expect(byTitle(run({ LLL: 'dermatochalasis' }, { terms }))).toEqual({ 'Dermatochalasis OS': 'H02.835' });
	});
	it('falls back to a code without laterality when the family has none, and keeps uncoded hits', () => {
		const terms: CodingTerm[] = [
			{ term: 'conjunctivitis', location: 'CONJ' },
			{ term: 'zebra stripes', location: 'CORNEA' }
		];
		expect(byTitle(run({ ODCONJ: 'conjunctivitis', OSCORNEA: 'zebra stripes' }, { terms }))).toEqual({
			'Conjunctivitis OD': 'H10.31',
			'Zebra stripes OS': ''
		});
	});
});

describe('DM option', () => {
	it('needs diabetes in the PMH; type from title or code', () => {
		expect(run({ ODVESSELS: 'BDR' })).toEqual([]);
		const t1: EngineIssue = { ...T2, title: 'IDDM', codes: '' };
		expect(byTitle(run({ ODVESSELS: 'BDR' }, { issues: [t1] }))).toEqual({ 'Diabetic retinopathy OD': 'E10.3391' });
		const other: EngineIssue = { ...T2, title: 'Diabetes, steroid induced', codes: '' };
		expect(byTitle(run({ ODVESSELS: 'BDR' }, { issues: [other] }))).toEqual({ 'Diabetic retinopathy OD': 'E13.3391' });
	});
	it('grades the tiers: mild, moderate, severe, proliferative', () => {
		const one = (f: Record<string, string>) => run(f, { issues: [T2] })[0]?.codes;
		expect(one({ ODVESSELS: 'trace BDR' })).toBe('E11.3291');
		expect(one({ ODVESSELS: '+1 BDR' })).toBe('E11.3291');
		expect(one({ ODVESSELS: 'BDR' })).toBe('E11.3391');
		expect(one({ ODVESSELS: 'BDR, PPDR' })).toBe('E11.3491');
		expect(one({ ODMACULA: 'IRMA', ODVESSELS: 'BDR' })).toBe('E11.3491');
		expect(one({ ODDISC: 'NVD', ODVESSELS: 'BDR' })).toBe('E11.3591');
		expect(one({ OSPERIPH: 'NVE' })).toBe('E11.3592');
	});
	it('codes edema from CSME, honours negations, and "flat" means no edema', () => {
		const one = (f: Record<string, string>) => run(f, { issues: [T2] })[0]?.codes;
		expect(one({ ODVESSELS: 'BDR', ODMACULA: 'CSME' })).toBe('E11.3311');
		expect(one({ ODVESSELS: 'BDR', ODMACULA: 'no CSME' })).toBe('E11.3391');
		expect(one({ ODVESSELS: 'BDR', ODMACULA: 'flat, CSME' })).toBe('E11.3391');
		expect(one({ ODDISC: 'no NVD', ODVESSELS: 'BDR' })).toBe('E11.3391');
	});
	it('uses the bilateral 7th character when both eyes match, else keeps both eyes (FIX: OS not dropped)', () => {
		expect(byTitle(run({ ODVESSELS: 'BDR', OSVESSELS: 'BDR' }, { issues: [T2] }))).toEqual({ 'Diabetic retinopathy OU': 'E11.3393' });
		expect(byTitle(run({ ODVESSELS: 'BDR', OSDISC: 'NVD', OSVESSELS: 'BDR' }, { issues: [T2] }))).toEqual({
			'Diabetic retinopathy OU': 'E11.3391, E11.3592'
		});
	});
	it('runs once per eye even when several DM terms match', () => {
		const list = run({ ODVESSELS: 'BDR, PPDR', ODMACULA: 'IRMA' }, { issues: [T2] });
		expect(list).toHaveLength(1);
		expect(list[0].codes).toBe('E11.3491');
	});
});

describe('RVO option', () => {
	it('codes the vein occlusion by eye; CSME adds macular edema and H35.81 (FIX)', () => {
		expect(byTitle(run({ ODVESSELS: 'BRVO superotemporal' }))).toEqual({ 'Branch retinal vein occlusion OD': 'H34.8312' });
		expect(byTitle(run({ OSVESSELS: 'CRVO', OSMACULA: 'CSME' }))).toEqual({ 'Central retinal vein occlusion OS': 'H34.8120, H35.81' });
	});
});

describe('IOL option', () => {
	const surgery = (id: number, title: string, begin: string): EngineIssue => ({ id, type: 'POS', title, codes: '', begin, comments: '', active: true });
	it('codes post-cataract CME within 90 days of a same-eye IOL surgery', () => {
		const issues = [surgery(5, 'Phaco/PCIOL OS', '2026-08-01')];
		expect(byTitle(run({ OSMACULA: 'CSME' }, { issues }))).toEqual({ 'Post-cataract CME OS': 'H59.032' });
		// Wrong eye, or older than 90 days: not post-cataract.
		expect(run({ ODMACULA: 'CSME' }, { issues })).toEqual([]);
		expect(run({ OSMACULA: 'CSME' }, { issues: [surgery(5, 'Phaco/PCIOL OS', '2026-06-01')] })).toEqual([]);
	});
	it('picks the most recent matching surgery', () => {
		const issues = [surgery(5, 'CE/IOL OS', '2026-07-20'), surgery(6, 'YAG then PCIOL exchange OS', '2026-09-30'), surgery(7, 'PCIOL OD', '2026-10-01')];
		expect(recentIolSurgery(issues, 'L', VISIT)?.id).toBe(6);
		expect(recentIolSurgery(issues, 'R', VISIT)?.id).toBe(7);
		const [c] = run({ OSMACULA: 'CSME' }, { issues });
		expect(c.plan).toContain('After YAG then PCIOL exchange OS on 2026-09-30');
	});
	it('without a qualifying surgery, CME still codes as cystoid macular edema', () => {
		expect(byTitle(run({ ODMACULA: 'CME' }))).toEqual({ 'Cystoid macular edema OD': 'H35.351' });
	});
});

describe('output', () => {
	it('returns term -> items in list order', () => {
		const map = runEngine({ findings: { ODLENS: 'NS', RUL: 'dermatochalasis' }, issues: [], visitDate: VISIT, lookup });
		expect([...map.keys()]).toEqual(['Dermatochalasis', 'Nuclear sclerosis']);
	});
	it('issue rows: POH/POS active (surgeries always), PMH separately; plan starts as the comments', () => {
		const issues: EngineIssue[] = [
			{ id: 2, type: 'POH', title: 'Glaucoma suspect', codes: '', begin: '', comments: 'Watch C/D OS', active: true },
			{ id: 3, type: 'POH', title: 'Old iritis', codes: '', begin: '', comments: '', active: false },
			{ id: 4, type: 'POS', title: 'PCIOL OD', codes: '', begin: '', comments: '', active: false },
			{ ...T2, codes: 'ICD10:E11.9; I10' }
		];
		const { poh, pmh } = issueCandidates(lookup, issues);
		expect(poh.map((c) => c.title)).toEqual(['Glaucoma suspect', 'PCIOL OD']);
		expect(poh[0]).toMatchObject({ kind: 'issue', plan: 'Watch C/D OS', link: 'issue:2' });
		expect(pmh[0]).toMatchObject({ codes: 'E11.9, I10', codeText: 'ICD10:E11.9 (Type 2 diabetes mellitus without complications); ICD10:I10 (Essential (primary) hypertension)' });
	});
});
