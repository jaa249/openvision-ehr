import { describe, expect, it } from 'vitest';
import { describeHint, hintCodes } from './codehint.ts';
import { EXAM_SECTIONS } from './catalog.ts';

const roles = (hint: string) => Object.fromEntries(describeHint(hint).map((p) => [p.code, p.role]));

describe('describeHint', () => {
	it('R / L / B codes', () => {
		expect(roles('RC · LC · BC')).toEqual({ RC: 'right', LC: 'left', BC: 'both' });
		expect(roles('RLL · LLL · BLL')).toEqual({ RLL: 'right', LLL: 'left', BLL: 'both' });
		expect(roles('RMC · LMC')).toEqual({ RMC: 'right', LMC: 'left' });
	});
	it('the shared part alone means both eyes', () => {
		expect(roles('RMRD · LMRD · MRD')).toEqual({ RMRD: 'right', LMRD: 'left', MRD: 'both' });
		expect(roles('RCUP · LCUP · CUP')).toEqual({ RCUP: 'right', LCUP: 'left', CUP: 'both' });
	});
	it('OD / OS inside a code', () => {
		expect(roles('SCODVA · SCOSVA')).toEqual({ SCODVA: 'right', SCOSVA: 'left' });
		expect(roles('ODIOPTARGET · OSIOPTARGET')).toEqual({ ODIOPTARGET: 'right', OSIOPTARGET: 'left' });
	});
	it('a code with no partner is just a code', () => {
		expect(roles('RB · LB · FH')).toEqual({ RB: 'right', LB: 'left', FH: 'other' });
		expect(roles('IOPTIME')).toEqual({ IOPTIME: 'other' });
		expect(hintCodes('')).toEqual([]);
	});
	it('every row hint of the row sections pairs up', () => {
		for (const sec of EXAM_SECTIONS) {
			for (const r of sec.rows) {
				const parts = describeHint(r.hint);
				expect(parts.filter((p) => p.role === 'right').length, r.hint).toBe(1);
				expect(parts.filter((p) => p.role === 'left').length, r.hint).toBe(1);
			}
		}
	});
});

describe('codeHintText', () => {
	it('spells every code out in the page language', async () => {
		const { createTranslator } = await import('#lib/i18n/translate.ts');
		const { EN } = await import('#lib/i18n/catalog.ts');
		const { codeHintText } = await import('./codehint.ts');
		const en = createTranslator('en', EN, EN);
		expect(codeHintText('RC · LC · BC', en.t, en.list, 'Alt+K')).toBe(
			'Shorthand codes: RC = right eye, LC = left eye, and BC = both eyes. In the shorthand bar (Alt+K) type a code, a colon and the value.'
		);
		expect(codeHintText('IOPTIME', en.t, en.list, 'Alt+K')).toMatch(/^Shorthand codes: IOPTIME\./);
	});
});
