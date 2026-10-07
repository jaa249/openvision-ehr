import { describe, expect, it } from 'vitest';
import { buildReport } from './report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import { EN, loadCatalog } from '#lib/i18n/catalog.ts';
import { createTranslator } from '#lib/i18n/translate.ts';

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
		expect(s.rows.at(-1)).toMatchObject({ label: 'Tear break-up time', od: '', os: '8 s' });
	});

	it('retina prints when only the left eye has findings (FIX: not OD-only)', () => {
		expect(titles(f({ OSMACULA: 'drusen' }))).toEqual(['Retina']);
	});

	it('a section with only comments still prints', () => {
		expect(section(f({ RETINA_COMMENTS: 'dilated 1% trop' }), 'Retina')?.comments).toBe('dilated 1% trop');
	});

	it('additional findings print each row only when present, Hertel with base', () => {
		const s = section(f({ RLF: '15', ODHERTEL: '16', OSHERTEL: '17', HERTELBASE: '100' }), 'Additional findings')!;
		expect(s.rows).toMatchObject([
			{ label: 'Levator function', od: '15 mm', os: '' },
			{ label: 'Hertel (base 100)', labelText: { key: 'report.hertelBase', params: { base: '100' } }, od: '16 mm', os: '17 mm' }
		]);
		expect(titles(f({ RLF: '15' }))).toEqual(['Additional findings']);
	});

	it('values print as typed (no reformatting) and blanks are ignored', () => {
		const s = section(f({ ODCUP: '0.45V x 0.4H', OSCUP: '   ' }), 'Retina')!;
		expect(s.rows.find((r) => r.label === 'C/D ratio')).toMatchObject({ label: 'C/D ratio', od: '0.45V x 0.4H', os: '' });
	});

	it('every heading report.ts prints has a translation key (D48)', () => {
		const x = f({ RUL: 'ptosis', ODCONJ: 'quiet', ODDISC: 'pink', RLF: '15', ODHERTEL: '16' });
		const own = buildReport(x).filter((s) => ['External', 'Anterior segment', 'Retina', 'Additional findings'].includes(s.title));
		expect(own).toHaveLength(4);
		for (const s of own) expect(s.titleText?.key, s.title).toMatch(/^report\./);
		expect(section(x, 'Additional findings')!.rows.find((r) => r.label === 'Hertel')?.labelText).toEqual({ key: 'report.hertel' });
	});

	// Every part of the exam filled once, so every heading and label of the report shows up.
	const FULL = f({
		CC1: 'blurry', HPI1: 'two weeks', TIMING1: 'mornings', CHRONIC1: 'POAG', ROSGENERAL: 'negative', ROSHEENT: 'sinus',
		SCODVA: '20/40', BINOCVA: '20/30', GLARECOMMENTS: 'BAT high', ODIOPAP: '15', IOPTIME: '9:05 AM', ODIOPPOST: '17', IOPPOSTTIME: '10:00 AM',
		ODPUPILSIZE1: '3', OSPUPILREACTIVITY: '+2', ODAPD: '0', ODVF1: '1', OSVF1: '0', DIMODPUPILSIZE1: '6', DIMOSPUPILREACTIVITY: '+1', AMSLEROD: '0',
		MOTILITY_RS: '2', ODCOLOR: '11/11', NPC: '5 cm', CACCDIST: '20', CACCNEAR: '25', STEREOPSIS: '40', ACT5CCDIST: '6 XT', ACT10CCDIST: '2 RHT', NEURO_COMMENTS: 'ok',
		ODSPH_1: '-1.00', RX_TYPE_1: '1', LENS_MATERIAL_1: 'Trivex', BPDD_1: '62', ODSPH_2: '-2.00', MRODSPH: '-1.25', BALANCED: 'on', ARODSPH: '-1.00', CRODSPH: '-1.50', WETTYPE: 'Streak',
		CTLODSPH: '-1.00', CTLBRANDOD: 'Daily', CTLMANUFACTUREROD: 'Maker', CTLSUPPLIEROD: 'Shop',
		RUL: 'ptosis', RLF: '15', ODHERTEL: '16', HERTELBASE: '100', ODCONJ: 'quiet', ODDISC: 'pink', TROPICAMIDE: '1%', DIL_TIME: '2:10 PM', DIL_RISKS: 'on'
	});

	it('every heading and row label has a message whose English is the printed English (D48)', () => {
		const t = createTranslator('en', EN, EN).t;
		const out = buildReport(FULL);
		expect(out.length).toBeGreaterThan(20);
		for (const s of out) {
			expect(s.titleText, s.title).toBeDefined();
			expect(t(s.titleText!.key, s.titleText!.params), s.title).toBe(s.title);
			for (const r of s.rows) {
				expect(r.labelText, `${s.title}: ${r.label}`).toBeDefined();
				expect(t(r.labelText!.key, r.labelText!.params), `${s.title}: ${r.label}`).toBe(r.label);
			}
		}
		// The English translator is the default.
		expect(buildReport(FULL, t)).toEqual(out);
	});

	it('another language: words in summaries and tables translate, recorded values do not', async () => {
		const es = createTranslator('es', await loadCatalog('es'), EN).t;
		const en = buildReport(FULL);
		const tr = buildReport(FULL, es);
		expect(tr.map((s) => s.title)).toEqual(en.map((s) => s.title));
		const pick = (x: typeof en, title: string) => x.find((s) => s.title.startsWith(title))!;
		expect(pick(tr, 'Confrontation fields').table!.body[0][1]).toBe(es('sections.vfStateDefect'));
		expect(es('sections.vfStateDefect')).not.toBe('defect');
		expect(pick(tr, 'Current glasses #1').table!.head[1]).toBe(es('rx.colSph'));
		expect(pick(tr, 'Current glasses #1').comments).toContain('Trivex');
		expect(pick(tr, 'Dilation').summary).toContain('2:10 PM');
		expect(pick(tr, 'Dilation').summary).not.toBe(pick(en, 'Dilation').summary);
		expect(pick(tr, 'Contact lens').comments).toBe(`OD: Daily ${es('rx.byManufacturer', { name: 'Maker' })} ${es('rx.viaSupplier', { name: 'Shop' })}`);
		expect(pick(tr, 'History of present illness').table!.head[1]).toBe('blurry');
	});
});
