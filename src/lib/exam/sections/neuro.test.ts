import { describe, expect, it } from 'vitest';
import { FIELDS, FIELD_BY_ID, SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { buildReport } from '#lib/exam/report.ts';
import { ALIASES, COMMANDS } from '#lib/shorthand/codes.ts';
import { applyOps, parseShorthand, type Findings } from '#lib/shorthand/parse.ts';
import {
	COVER_IDS,
	MOTILITY_CELLS,
	MOTILITY_IDS,
	NEURO_ALIASES,
	NEURO_DEFAULTS,
	NEURO_FIELDS,
	coverId,
	coverPositionName,
	gazeName,
	hashOrientation,
	motilityCell,
	motilityClick,
	motilityNormalValues,
	motilitySet,
	neuroReport,
	recordCell,
	sensorimotorSuggested,
	stepCount
} from './neuro.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));

describe('neuro catalog', () => {
	it('every field id is unique across the whole catalog', () => {
		const ids = FIELDS.map((x) => x.id);
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
	});

	it('uses the form_eye_neuro column names (every listed column but id and pid)', () => {
		expect(NEURO_FIELDS).toHaveLength(79); // FIELDS.md lists 81 rows under its "80 columns" heading
		for (const id of [
			'ACT',
			'ACT1SCDIST',
			'ACT11CCNEAR',
			'MOTILITYNORMAL',
			'MOTILITY_RS',
			'MOTILITY_LLIO',
			'NEURO_COMMENTS',
			'STEREOPSIS',
			'ODNPA',
			'OSNPA',
			'VERTFUSAMPS',
			'DIVERGENCEAMPS',
			'NPC',
			'DACCDIST',
			'DACCNEAR',
			'CACCDIST',
			'CACCNEAR',
			'ODCOLOR',
			'OSCOLOR',
			'ODCOINS',
			'OSCOINS',
			'ODREDDESAT',
			'OSREDDESAT'
		])
			expect(FIELD_BY_ID.get(id)?.section, id).toBe('NEURO');
		expect(COVER_IDS).toHaveLength(44);
		expect(MOTILITY_IDS).toHaveLength(16);
	});

	it('fields are catalogued with sane lengths, eyes and no expansion for measurements', () => {
		for (const d of NEURO_FIELDS) {
			expect(FIELD_BY_ID.get(d.id)).toBe(d);
			expect(d.maxLength).toBeGreaterThanOrEqual(1);
			expect(d.maxLength).toBeLessThanOrEqual(4000);
			expect(d.expand).toBe(d.id === 'NEURO_COMMENTS');
			if (/^OD/.test(d.id) || /^MOTILITY_R/.test(d.id)) expect(d.eye, d.id).toBe('OD');
			if (/^OS/.test(d.id) || /^MOTILITY_L/.test(d.id)) expect(d.eye, d.id).toBe('OS');
		}
		expect(FIELD_BY_ID.get('MOTILITY_RS')?.maxLength).toBe(1);
		expect(FIELD_BY_ID.get('ACT5CCDIST')?.eye).toBe('OU');
	});

	it('defaults target catalogued fields and are part of the seed', () => {
		for (const [id, value] of Object.entries(NEURO_DEFAULTS)) {
			expect(FIELD_BY_ID.has(id), id).toBe(true);
			expect(SEED_DEFAULTS[id]).toBe(value);
		}
		expect(NEURO_DEFAULTS.MOTILITYNORMAL).toBe('on');
		expect(NEURO_DEFAULTS.ACT).toBeUndefined();
		expect(NEURO_DEFAULTS.MOTILITY_LLIO).toBe('0');
		// tests that were not done are never defaulted
		expect(NEURO_DEFAULTS.ODCOLOR).toBeUndefined();
		expect(NEURO_DEFAULTS.STEREOPSIS).toBeUndefined();
	});

	it('the "D" command fills the neuro defaults', () => {
		const { findings } = applyOps({}, parseShorthand('D').ops);
		expect(findings.MOTILITYNORMAL).toEqual({ value: 'on', isDefault: true });
		expect(findings.ACT).toBeUndefined();
	});
});

describe('neuro shorthand', () => {
	it('aliases point at real fields and do not shadow other codes', () => {
		for (const [code, ids] of Object.entries(NEURO_ALIASES)) {
			expect(code).toBe(code.toUpperCase());
			for (const id of ids) expect(FIELD_BY_ID.has(id), `${code} -> ${id}`).toBe(true);
			expect(FIELD_BY_ID.has(code), `${code} is also a field id`).toBe(false);
			expect(COMMANDS[code], `${code} is also a command`).toBeUndefined();
			expect(ALIASES[code], code).toEqual(ids);
		}
	});

	it('every neuro code listed in SHORTHAND.md resolves', () => {
		const codes = ['RCOL', 'RCOLOR', 'LCOL', 'LCOLOR', 'RCOIN', 'RCOINS', 'LCOIN', 'LCOINS', 'RRED', 'LRED', 'RNPC', 'LNPC', 'RNPA', 'LNPA', 'STEREO', 'VERTFUS', 'CAD', 'CAN', 'DAD', 'DAN', 'NCOM', 'SCDIST', 'CCDIST', 'SCNEAR', 'CCNEAR'];
		for (const c of codes) expect(ALIASES[c], c).toBeDefined();
	});

	it('writes neuro values from the bar', () => {
		const { ops, errors } = parseShorthand('rcol:11/11; lred 80; npa:8 cm; rnpc:6 cm; stereo:40 sec; ccdist:6 XT; ACT3SCNEAR:4 LHT');
		expect(errors).toEqual([]);
		const { findings } = applyOps({}, ops);
		expect(findings.ODCOLOR.value).toBe('11/11');
		expect(findings.OSREDDESAT.value).toBe('80');
		expect(findings.ODNPA.value).toBe('8 cm');
		expect(findings.OSNPA.value).toBe('8 cm');
		expect(findings.NPC.value).toBe('6 cm');
		expect(findings.STEREOPSIS.value).toBe('40 sec');
		expect(findings.ACT5CCDIST.value).toBe('6 XT');
		expect(findings.ACT3SCNEAR.value).toBe('4 LHT');
	});
});

describe('motility', () => {
	it('16 cells, each with its own id and a unique gaze position per eye', () => {
		expect(new Set(MOTILITY_IDS).size).toBe(16);
		for (const eye of ['OD', 'OS'] as const) {
			const keys = MOTILITY_CELLS.filter((c) => c.eye === eye).map((c) => `${c.v}/${c.h}`);
			expect(new Set(keys).size).toBe(8);
		}
		expect(motilityCell('OS', 1, 'R')?.id).toBe('MOTILITY_LRIO');
		expect(motilityCell('OS', 1, 'L')?.id).toBe('MOTILITY_LLIO');
		expect(motilityCell('OD', -1, null)?.id).toBe('MOTILITY_RS');
	});

	it('names gazes as in/out per eye and picks hash-mark orientation', () => {
		expect(gazeName(motilityCell('OD', -1, 'R')!)).toBe('up and out');
		expect(gazeName(motilityCell('OS', -1, 'R')!)).toBe('up and in');
		expect(gazeName(motilityCell('OS', 0, 'L')!)).toBe('out');
		expect(gazeName(motilityCell('OD', 1, null)!)).toBe('down');
		expect(hashOrientation({ v: 0 })).toBe('vertical');
		expect(hashOrientation({ v: -1 })).toBe('horizontal');
	});

	it('a click increments and wraps 4 -> 0; decrement wraps 0 -> 4', () => {
		expect(stepCount('')).toBe('1');
		expect(stepCount('3')).toBe('4');
		expect(stepCount('4')).toBe('0');
		expect(stepCount('0', -1)).toBe('4');
		expect(stepCount('2', -1)).toBe('1');
		expect(stepCount('junk')).toBe('1');
	});

	it('a click writes only its own field and turns Normal off (§9.1 FIX)', () => {
		for (const id of MOTILITY_IDS) {
			const values = motilityClick(f({ ...motilityNormalValues() }), id);
			expect(Object.keys(values).sort()).toEqual([id, 'MOTILITYNORMAL'].sort());
			expect(values[id]).toBe('1');
			expect(values.MOTILITYNORMAL).toBe('');
		}
		expect(motilitySet('MOTILITY_RRIO', 9)).toEqual({ MOTILITY_RRIO: '4', MOTILITYNORMAL: '' });
		expect(() => motilityClick({}, 'ODCOLOR')).toThrow();
	});

	it('Normal zeroes all 16 cells and sets the flag', () => {
		const n = motilityNormalValues();
		expect(n.MOTILITYNORMAL).toBe('on');
		for (const id of MOTILITY_IDS) expect(n[id]).toBe('0');
	});
});

describe('cover test builder', () => {
	it('records "amount side+deviation"', () => {
		expect(recordCell('R', 'HT', '10')).toBe('10 RHT');
		expect(recordCell('', 'XT', '6')).toBe('6 XT');
		expect(recordCell('L', 'hypo(T)', '')).toBe('Lhypo(T)');
		expect(recordCell('', '', '25')).toBe('25');
		expect(recordCell('', '', '')).toBe('');
	});

	it('Ortho clears laterality and deviation', () => {
		expect(recordCell('R', 'ET', 'Ortho')).toBe('Ortho');
	});

	it('names positions R / center / L with tilts', () => {
		expect(coverPositionName(1)).toBe('up and right');
		expect(coverPositionName(5)).toBe('primary');
		expect(coverPositionName(6)).toBe('left');
		expect(coverPositionName(8)).toBe('down');
		expect(coverPositionName(10)).toBe('right head tilt');
		expect(coverId(11, 'SCNEAR')).toBe('ACT11SCNEAR');
	});
});

describe('neuro report (§13.2)', () => {
	it('an empty exam prints nothing', () => {
		expect(neuroReport({})).toEqual({ strip: [], additional: [], orthophoric: false, after: [] });
	});

	it('Motility Normal prints "D&V full OU"; with Ortho the heading says orthophoric', () => {
		const r = neuroReport(f({ ...NEURO_DEFAULTS, ACT: 'on' }));
		expect(r.strip).toMatchObject([{ title: 'Motility', rows: [], comments: '', summary: 'D&V full OU' }]);
		expect(r.orthophoric).toBe(true);
		expect(r.after).toEqual([]);
		expect(buildReport(f({ ...NEURO_DEFAULTS, ACT: 'on' })).some((s) => s.title === 'Additional findings (orthophoric)')).toBe(true);
	});

	it('prints the OS bottom row from its own cells (FIX)', () => {
		const r = neuroReport(f({ MOTILITY_LRIO: '1', MOTILITY_LI: '2', MOTILITY_LLIO: '3', MOTILITY_RS: '4' }));
		const t = r.strip[0].table!;
		expect(t.body[2]).toEqual(['Down', '0', '0', '0', '1', '2', '3']);
		expect(t.body[0]).toEqual(['Up', '0', '4', '0', '0', '0', '0']);
		expect(t.body[1][2]).toBe(''); // primary position has no counter
		expect(r.orthophoric).toBe(false);
	});

	it('all-zero counters without Normal print no grid', () => {
		expect(neuroReport(f({ MOTILITY_RS: '0', MOTILITY_LL: '0' })).strip).toEqual([]);
	});

	it('neuro block rows in order; NPC prints (FIX)', () => {
		const r = neuroReport(f({ ODCOLOR: '11/11', OSCOLOR: '8/11', OSREDDESAT: '60', ODNPA: '7 cm', NPC: '5 cm', STEREOPSIS: '40 sec' }));
		expect(r.additional.map((x) => x.label)).toEqual(['Color vision', 'Red desaturation', 'NPA', 'NPC: 5 cm', 'Stereopsis: 40 sec']);
		expect(r.additional[1]).toMatchObject({ label: 'Red desaturation', od: '', os: '60' });
	});

	it('amplitude-only data prints its rows (FIX)', () => {
		const r = neuroReport(f({ CACCNEAR: '20/30', VERTFUSAMPS: '3' }));
		expect(r.additional).toMatchObject([
			{ label: 'Convergence amplitudes: near 20/30', od: '', os: '' },
			{ label: 'Vertical fusional amplitudes: 3', od: '', os: '' }
		]);
		const add = buildReport(f({ DIVERGENCEAMPS: '8/4' })).find((s) => s.title === 'Additional findings');
		expect(add?.rows).toMatchObject([{ label: 'Divergence amplitudes: 8/4', od: '', os: '' }]);
	});

	it('neuro comments print even when Ortho (FIX)', () => {
		const r = neuroReport(f({ ACT: 'on', ACT5CCDIST: '6 XT', NEURO_COMMENTS: 'diplopia at end of day' }));
		expect(r.after).toMatchObject([{ title: 'Neuro', rows: [], comments: 'diplopia at end of day' }]);
	});

	it('cover-test grids print only when not Ortho and only when the primary cell is filled', () => {
		const r = neuroReport(f({ ACT5CCDIST: '6 XT', ACT1CCDIST: '8 XT', ACT3SCNEAR: '4 XT', ACT10CCDIST: '2 RHT' }));
		expect(r.after.map((s) => s.title)).toEqual(['Alternate cover test, cc distance']);
		const t = r.after[0].table!;
		expect(t.head).toEqual(['', 'R', 'Center', 'L']);
		expect(t.body[0]).toEqual(['Up', '8 XT', '', '']);
		expect(t.body[1]).toEqual(['Primary', '', '6 XT', '']);
		expect(t.body[3]).toEqual(['Head tilt', '2 RHT', '', '']);
		// no tilt row when tilts are empty; titles stay unique across tabs
		const two = neuroReport(f({ ACT5CCDIST: 'Ortho', ACT5SCNEAR: '4 X' }));
		expect(two.after.map((s) => s.title)).toEqual(['Alternate cover test, cc distance', 'Alternate cover test, sc near']);
		expect(two.after[0].table!.body).toHaveLength(3);
	});

	it('places sections in the report: motility after the workup, cover test after Retina', () => {
		const titles = buildReport(f({ SCODVA: '20/20', MOTILITYNORMAL: 'on', ODDISC: 'pink', ACT5CCDIST: '6 XT' })).map((s) => s.title);
		expect(titles.indexOf('Motility')).toBeGreaterThan(titles.indexOf('Visual acuities'));
		expect(titles.indexOf('Alternate cover test, cc distance')).toBeGreaterThan(titles.indexOf('Retina'));
	});
});

describe('92060 suggestion (§9.4 FIX)', () => {
	it('stereo + NPC alone is not enough', () => {
		expect(sensorimotorSuggested(f({ STEREOPSIS: '40 sec', NPC: '5 cm', ODNPA: '7', CACCDIST: '12' }))).toBe(false);
	});
	it('stereo + primary cell in one tab only is not enough', () => {
		expect(sensorimotorSuggested(f({ STEREOPSIS: '40 sec', ACT5CCDIST: '6 XT' }))).toBe(false);
	});
	it('stereo + a non-primary cell suggests it', () => {
		expect(sensorimotorSuggested(f({ STEREOPSIS: '40 sec', ACT2CCDIST: '8 XT' }))).toBe(true);
	});
	it('stereo + two tabs measured (primary only) suggests it', () => {
		expect(sensorimotorSuggested(f({ STEREOPSIS: '40 sec', ACT5CCDIST: '6 XT', ACT5CCNEAR: '10 XT' }))).toBe(true);
	});
	it('no stereo, no suggestion', () => {
		expect(sensorimotorSuggested(f({ ACT2CCDIST: '8 XT', ACT5CCNEAR: '10 XT', STEREOPSIS: '  ' }))).toBe(false);
	});
});
