import { describe, expect, it } from 'vitest';
import { EMPTY_CODING_STATE, type CodingItem, type CodingState } from './types.ts';
import { buildCoding, dxList } from './lines.ts';

const items: CodingItem[] = [
	{ id: 10, title: 'Glaucoma suspect', codes: 'H40.003' },
	{ id: 11, title: 'Cataract', codes: 'H25.13, H25.11' },
	{ id: 12, title: 'Dry eye', codes: '' },
	{ id: 13, title: 'Type 2 diabetes', codes: 'E11.9' }
];
const st = (o: Partial<CodingState> = {}): CodingState => ({ ...EMPTY_CODING_STATE, ...o });
const build = (o: Partial<CodingState> = {}, its = items, sensorimotor = false) =>
	buildCoding({ state: st(o), suggestedCode: '92014', items: its, sensorimotor });

describe('dx list', () => {
	it('letters coded items in plan order, expands comma lists, skips duplicates and placeholders', () => {
		const { dx, pointersFor } = dxList([...items, { id: 14, title: 'Dup', codes: 'Code, h40.003' }]);
		expect(dx.map((d) => `${d.letter}:${d.code}`)).toEqual(['A:H40.003', 'B:H25.13', 'C:H25.11', 'D:E11.9']);
		expect(pointersFor.get(11)).toEqual(['B', 'C']);
		expect(pointersFor.get(14)).toEqual(['A']);
		expect(pointersFor.get(12)).toEqual([]);
	});
	it('stops lettering at 12 and reports the rest', () => {
		const many = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, title: `Dx ${i}`, codes: `H${10 + i}.9` }));
		const { dx, overflow } = dxList(many);
		expect(dx).toHaveLength(12);
		expect(dx[11].letter).toBe('L');
		expect(overflow).toEqual(['H22.9', 'H23.9']);
		const s = buildCoding({ state: st(), suggestedCode: '92014', items: many, sensorimotor: false });
		expect(s.ok).toBe(false);
		expect(s.checks.find((c) => c.level === 'error')!.message).toContain('More than 12 diagnoses');
	});
});

describe('coding lines', () => {
	it('uses the suggested visit code until one is chosen, with all justifiers on by default', () => {
		const s = build();
		expect(s.cpt[0]).toMatchObject({ kind: 'visit', code: '92014', modifiers: [], pointers: ['A', 'B', 'C', 'D'] });
		expect(s.ok).toBe(true);
		expect(build({ visitCode: '92012' }).cpt[0].code).toBe('92012');
	});
	it('warns about uncoded impression items', () => {
		const w = build().checks.filter((c) => c.level === 'warning').map((c) => c.message);
		expect(w.some((m) => m.includes('1 impression item has no ICD-10 code: Dry eye'))).toBe(true);
	});
	it('errors when a line has more than 4 pointers, and clears when a justifier is turned off', () => {
		const five = [...items, { id: 15, title: 'Blepharitis', codes: 'H01.003' }];
		const s = build({}, five);
		expect(s.ok).toBe(false);
		expect(s.checks.some((c) => c.level === 'error' && c.message.includes('points to 5 diagnoses'))).toBe(true);
		const t = build({ justifiersOff: [11] }, five);
		expect(t.ok).toBe(true);
		expect(t.cpt[0].pointers).toEqual(['A', 'D', 'E']);
	});
	it('a test with 4 justifiers over 5 codes is an error; test justifiers are capped at 4', () => {
		const five = [...items, { id: 15, title: 'Blepharitis', codes: 'H01.003' }];
		const s = build({ justifiersOff: [11], tests: [{ cpt: '92134', label: 'OCT retina', modifier: '', justifiers: [10, 11, 13, 15] }] }, five);
		expect(s.checks.some((c) => c.level === 'error' && c.message.startsWith('92134 points to 5'))).toBe(true);
		const t = build({ tests: [{ cpt: '92134', label: 'OCT', modifier: '', justifiers: [10, 11, 12, 13, 15] }] }, five);
		expect(t.checks.some((c) => c.message.includes('at most 4 justifiers'))).toBe(true);
	});
	it('never forces 59 or 25 and never turns visit justifiers off (B10)', () => {
		const s = build({ tests: [{ cpt: '92083', label: 'Visual field', modifier: '', justifiers: [10] }] });
		const test = s.cpt.find((l) => l.kind === 'test')!;
		expect(test.modifiers).toEqual([]);
		expect(test.pointers).toEqual(['A']);
		expect(s.cpt[0].modifiers).toEqual([]);
		expect(s.cpt[0].pointers).toContain('A');
		const sugg = s.checks.filter((c) => c.level === 'suggestion').map((c) => c.message).join(' ');
		expect(sugg).toContain('modifier 25');
		expect(sugg).toContain('Glaucoma suspect');
	});
	it('keeps a typed modifier, upper-cased, and rejects junk', () => {
		expect(build({ tests: [{ cpt: '92083', label: 'VF', modifier: '59', justifiers: [10] }] }).cpt[1].modifiers).toEqual(['59']);
		expect(build({ tests: [{ cpt: '92083', label: 'VF', modifier: 'rt', justifiers: [10] }] }).cpt[1].modifiers).toEqual(['RT']);
		expect(build({ tests: [{ cpt: '92083', label: 'VF', modifier: '5', justifiers: [10] }] }).ok).toBe(false);
		expect(build({ tests: [{ cpt: 'abc', label: 'Bad', modifier: '', justifiers: [] }] }).ok).toBe(false);
	});
	it('visit modifiers are passed through only from the 22/24/25/57 set', () => {
		expect(build({ modifiers: ['25', '99'] }).cpt[0].modifiers).toEqual(['25']);
	});
	it('includes 92060 only when suggested AND ticked, with the visit justifiers', () => {
		expect(build({ include92060: true }, items, false).cpt.some((l) => l.code === '92060')).toBe(false);
		expect(build({ include92060: false }, items, true).cpt.some((l) => l.code === '92060')).toBe(false);
		const s = build({ include92060: true, justifiersOff: [13] }, items, true);
		const line = s.cpt.find((l) => l.code === '92060')!;
		expect(line.modifiers).toEqual([]);
		expect(line.pointers).toEqual(['A', 'B', 'C']);
	});
	it('handles an empty plan gracefully', () => {
		const s = build({}, []);
		expect(s.dx).toEqual([]);
		expect(s.cpt[0].pointers).toEqual([]);
		expect(s.ok).toBe(true);
		expect(s.checks.some((c) => c.message.includes('No coded diagnoses'))).toBe(true);
	});
});
