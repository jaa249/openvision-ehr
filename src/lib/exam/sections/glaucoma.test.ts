import { describe, expect, it } from 'vitest';
import type { Findings } from '#lib/shorthand/parse.ts';
import { FIELD_BY_ID } from '../catalog.ts';
import { ALIASES } from '#lib/shorthand/codes.ts';
import { GLAUCOMA_DEFAULTS, GLAUCOMA_FIELDS, iopHigh, iopNumber, resolveTarget } from './glaucoma.ts';

const f = (o: Record<string, string>): Findings => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));

describe('iopHigh (§8.3 FIX: numeric, against the target)', () => {
	it('compares numbers, not text', () => {
		expect(iopHigh('3', undefined)).toBe(false); // "3" > "21" as text
		expect(iopHigh('100', undefined)).toBe(true); // "100" < "21" as text
		expect(iopHigh('21', undefined)).toBe(false);
		expect(iopHigh('22', '')).toBe(true);
	});

	it('respects the eye’s target', () => {
		expect(iopHigh('18', '16')).toBe(true);
		expect(iopHigh('16', '16')).toBe(false);
		expect(iopHigh('24', '25')).toBe(false);
		expect(iopHigh('22', 'not a number')).toBe(true); // falls back to 21
	});

	it('text and blanks are never high', () => {
		expect(iopHigh('soft', '10')).toBe(false);
		expect(iopHigh('', '10')).toBe(false);
		expect(iopHigh(undefined, undefined)).toBe(false);
		expect(iopNumber(' 14.5 ')).toBe(14.5);
	});
});

describe('resolveTarget (§8.3 lookup order FIX)', () => {
	const priors = [
		{ date: '2025-09-14', findings: f({ OSIOPTARGET: '17' }) },
		{ date: '2024-08-02', findings: f({ ODIOPTARGET: '19', OSIOPTARGET: '15' }) }
	];
	it('this exam first', () => {
		expect(resolveTarget('OD', f({ ODIOPTARGET: '14' }), priors, { ODIOPTARGET: '18' })).toEqual({ value: 14, source: 'exam' });
	});
	it('then the latest prior visit that set one', () => {
		expect(resolveTarget('OS', {}, priors)).toEqual({ value: 17, source: 'prior', from: '2025-09-14' });
		expect(resolveTarget('OD', {}, priors)).toEqual({ value: 19, source: 'prior', from: '2024-08-02' });
	});
	it('then the provider default, then 21', () => {
		expect(resolveTarget('OD', {}, [], { ODIOPTARGET: '18' })).toEqual({ value: 18, source: 'provider' });
		expect(resolveTarget('OD', f({ ODIOPTARGET: 'tbd' }), [], {})).toEqual({ value: 21, source: 'default' });
	});
});

describe('fields and codes', () => {
	it('targets are catalogued once, in the IOP section, with no default', () => {
		for (const id of ['ODIOPTARGET', 'OSIOPTARGET']) expect(FIELD_BY_ID.get(id)?.section).toBe('IOP');
		expect(GLAUCOMA_FIELDS.every((g) => FIELD_BY_ID.get(g.id) === g)).toBe(true);
		expect(GLAUCOMA_DEFAULTS).toEqual({});
	});
	it('TGT sets both eyes', () => {
		expect(ALIASES.TGT).toEqual(['ODIOPTARGET', 'OSIOPTARGET']);
		expect(ALIASES.RTGT).toEqual(['ODIOPTARGET']);
	});
});
