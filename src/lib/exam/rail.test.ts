import { describe, expect, it } from 'vitest';
import { SEED_DEFAULTS, SECTION_DEF, fieldId } from './catalog.ts';
import { isNormalValue, railState } from './rail.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

const D = SEED_DEFAULTS;
const v = (value: string, isDefault = false) => ({ value, isDefault });
/** Every field with a seed normal in a section, filled with that normal ("Normal OU"). */
function normalOu(section: 'EXT' | 'ANTSEG' | 'RETINA'): Findings {
	const sec = SECTION_DEF.get(section)!;
	const out: Findings = {};
	for (const r of sec.rows) for (const eye of ['OD', 'OS'] as const) if (D[fieldId(eye, r)]) out[fieldId(eye, r)] = v(D[fieldId(eye, r)], true);
	return out;
}

describe('rail state', () => {
	it('is empty with nothing recorded (blank strings too)', () => {
		expect(railState('ANTSEG', {}, D)).toBe('empty');
		expect(railState('ANTSEG', { ODCONJ: v('  ') }, D)).toBe('empty');
	});

	it('is started with some but not all main findings', () => {
		expect(railState('ANTSEG', { ODCONJ: v('quiet', true) }, D)).toBe('started');
		expect(railState('ANTSEG', { ANTSEG_COMMENTS: v('see drawing') }, D)).toBe('started');
	});

	it('is complete when every main finding of both eyes holds a value', () => {
		expect(railState('ANTSEG', normalOu('ANTSEG'), D)).toBe('complete');
		expect(railState('RETINA', normalOu('RETINA'), D)).toBe('complete');
		// Typed values that match the normal count too, case and spacing aside.
		const typed = Object.fromEntries(Object.entries(normalOu('ANTSEG')).map(([k, f]) => [k, v(` ${f.value.toUpperCase()} `)]));
		expect(railState('ANTSEG', typed, D)).toBe('complete');
	});

	it('is abnormal when a typed finding differs from normal, and that wins over complete', () => {
		const f = { ...normalOu('ANTSEG'), ODCONJ: v('2+ injection') };
		expect(railState('ANTSEG', f, D)).toBe('abnormal');
		expect(railState('ANTSEG', { OSLENS: v('2+ NS') }, D)).toBe('abnormal');
	});

	it('does not call a value from "Normal" (isDefault) abnormal even if the normals changed since', () => {
		expect(railState('ANTSEG', { ODCONJ: v('white and quiet', true) }, D)).toBe('started');
	});

	it('treats measurements and normal words as readings, not abnormal findings', () => {
		expect(railState('EXT', { RMRD: v('+2'), RLF: v('15') }, D)).toBe('started');
		expect(railState('ANTSEG', { ODCONJ: v('WNL') }, D)).toBe('started');
	});

	it('flags an IOP above the eye target', () => {
		expect(railState('IOP', { ODIOPAP: v('18') }, D)).toBe('started');
		expect(railState('IOP', { ODIOPAP: v('24') }, D)).toBe('abnormal');
		expect(railState('IOP', { ODIOPAP: v('24'), ODIOPTARGET: v('25') }, D)).toBe('started');
		expect(railState('IOP', { OSIOPTPN: v('soft') }, D)).toBe('started');
	});

	it('never shows complete for sections without normals', () => {
		expect(railState('HPI', { CC1: v('blurry vision') }, D)).toBe('started');
		expect(railState('IMPPLAN', {}, D)).toBe('empty');
	});

	it('knows normal values', () => {
		expect(isNormalValue('Deep and quiet.', 'deep and quiet')).toBe(true);
		expect(isNormalValue('3.0', '3')).toBe(true);
		expect(isNormalValue('trace cells', 'deep and quiet')).toBe(false);
		expect(isNormalValue('', 'clear')).toBe(true);
	});
});
