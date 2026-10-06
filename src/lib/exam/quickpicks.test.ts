import { describe, expect, it } from 'vitest';
import { applyPick, pickTargets, seedRows, type QuickPick } from './quickpicks.ts';
import { SECTION_DEF } from './catalog.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

const qp = (row: string, text: string, mode: QuickPick['mode'] = 'add', zone: QuickPick['zone'] = 'ANTSEG') => ({
	zone,
	row,
	label: text,
	text,
	mode
});
const v = (f: Findings, id: string) => f[id]?.value;

describe('targets', () => {
	it('OD, OS and OU map to the row fields, OD first', () => {
		expect(pickTargets({ zone: 'ANTSEG', row: 'CONJ' }, 'OU')).toEqual(['ODCONJ', 'OSCONJ']);
		expect(pickTargets({ zone: 'EXT', row: 'UL' }, 'OS')).toEqual(['LUL']);
		expect(pickTargets({ zone: 'RETINA', row: 'NOPE' }, 'OD')).toEqual([]);
	});
});

describe('insert rules (spec §4.3)', () => {
	it('ADD writes into an empty field, and replaces a default', () => {
		expect(v(applyPick({}, qp('CONJ', 'injection'), 'OD', null).findings, 'ODCONJ')).toBe('injection');
		const start: Findings = { ODCONJ: { value: 'quiet', isDefault: true } };
		const { findings } = applyPick(start, qp('CONJ', 'injection'), 'OD', null);
		expect(findings.ODCONJ).toEqual({ value: 'injection', isDefault: false });
	});
	it('ADD joins with a comma, with the modifier in front', () => {
		const start: Findings = { ODCONJ: { value: 'pinguecula', isDefault: false } };
		expect(v(applyPick(start, qp('CONJ', 'injection'), 'OD', '+2').findings, 'ODCONJ')).toBe('pinguecula, +2 injection');
	});
	it('ADD after a trailing x continues without a comma', () => {
		const start: Findings = { ODCUP: { value: '0.4V x', isDefault: false } };
		expect(v(applyPick(start, qp('CUP', '0.5', 'add', 'RETINA'), 'OD', null).findings, 'ODCUP')).toBe('0.4V x0.5');
	});
	it('REPLACE overwrites; an empty REPLACE clears', () => {
		const start: Findings = { ODLENS: { value: '2+ NS', isDefault: false } };
		expect(v(applyPick(start, qp('LENS', 'clear', 'replace'), 'OD', null).findings, 'ODLENS')).toBe('clear');
		expect(v(applyPick(start, qp('LENS', '', 'replace'), 'OD', '+1').findings, 'ODLENS')).toBe('');
	});
	it('APPEND adds the text directly, ignoring modifiers', () => {
		const start: Findings = { ODCUP: { value: '0.4', isDefault: false } };
		expect(v(applyPick(start, qp('CUP', 'V', 'append', 'RETINA'), 'OD', 'nasal').findings, 'ODCUP')).toBe('0.4V');
	});
	it('OU writes both eyes with the same modifier', () => {
		const { findings, changed } = applyPick({}, qp('CORNEA', 'guttata'), 'OU', 'trace');
		expect(changed).toEqual(['ODCORNEA', 'OSCORNEA']);
		expect(v(findings, 'OSCORNEA')).toBe('trace guttata');
	});
	it('no change reported when the value is already there', () => {
		const start: Findings = { ODLENS: { value: 'clear', isDefault: false } };
		expect(applyPick(start, qp('LENS', 'clear', 'replace'), 'OD', null).changed).toEqual([]);
	});
});

describe('starter list', () => {
	it('every seed row points at a real row in its section', () => {
		for (const r of seedRows()) {
			expect(SECTION_DEF.get(r.zone)?.rows.some((row) => row.id === r.row), `${r.zone}/${r.row}`).toBe(true);
		}
	});
	it('uses corrected spellings', () => {
		const labels = seedRows().map((r) => r.text);
		expect(labels).toContain('pinguecula');
		expect(labels).toContain('Seidel negative');
	});
});
