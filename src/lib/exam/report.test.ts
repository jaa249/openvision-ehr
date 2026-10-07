import { describe, expect, it } from 'vitest';
import { buildReport } from './report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));
const titles = (x: Findings) => buildReport(x).map((s) => s.title);
const section = (x: Findings, t: string) => buildReport(x).find((s) => s.title === t);

describe('report sections (spec §13.2)', () => {
	it('an empty exam prints no sections', () => {
		expect(buildReport({})).toEqual([]);
	});

	it('prints sections in the original order, only when something was recorded', () => {
		const x = f({ ODDISC: 'pink', RUL: 'ptosis', ODCONJ: 'quiet', RMRD: '2' });
		expect(titles(x)).toEqual(['External', 'Additional findings', 'Anterior segment', 'Retina']);
		expect(titles(f({ ODCONJ: 'quiet' }))).toEqual(['Anterior segment']);
	});

	it('core rows always print with their section; extra rows only when filled', () => {
		const s = section(f({ ODCONJ: 'quiet', OSTBUT: '8' }), 'Anterior segment')!;
		expect(s.rows.map((r) => r.label)).toEqual(['Conjunctiva', 'Cornea', 'Anterior chamber', 'Lens', 'Iris', 'Tear break-up time']);
		expect(s.rows.at(-1)).toEqual({ label: 'Tear break-up time', od: '', os: '8 s' });
	});

	it('retina prints when only the left eye has findings (FIX: not OD-only)', () => {
		expect(titles(f({ OSMACULA: 'drusen' }))).toEqual(['Retina']);
	});

	it('a section with only comments still prints', () => {
		expect(section(f({ RETINA_COMMENTS: 'dilated 1% trop' }), 'Retina')?.comments).toBe('dilated 1% trop');
	});

	it('additional findings print each row only when present, Hertel with base', () => {
		const s = section(f({ RLF: '15', ODHERTEL: '16', OSHERTEL: '17', HERTELBASE: '100' }), 'Additional findings')!;
		expect(s.rows).toEqual([
			{ label: 'Levator function', od: '15 mm', os: '' },
			{ label: 'Hertel (base 100)', labelText: { key: 'report.hertelBase', params: { base: '100' } }, od: '16 mm', os: '17 mm' }
		]);
		expect(titles(f({ RLF: '15' }))).toEqual(['Additional findings']);
	});

	it('values print as typed (no reformatting) and blanks are ignored', () => {
		const s = section(f({ ODCUP: '0.45V x 0.4H', OSCUP: '   ' }), 'Retina')!;
		expect(s.rows.find((r) => r.label === 'C/D ratio')).toEqual({ label: 'C/D ratio', od: '0.45V x 0.4H', os: '' });
	});

	it('every heading report.ts prints has a translation key (D48)', () => {
		const x = f({ RUL: 'ptosis', ODCONJ: 'quiet', ODDISC: 'pink', RLF: '15', ODHERTEL: '16' });
		const own = buildReport(x).filter((s) => ['External', 'Anterior segment', 'Retina', 'Additional findings'].includes(s.title));
		expect(own).toHaveLength(4);
		for (const s of own) expect(s.titleText?.key, s.title).toMatch(/^report\./);
		expect(section(x, 'Additional findings')!.rows.find((r) => r.label === 'Hertel')?.labelText).toEqual({ key: 'report.hertel' });
	});
});
