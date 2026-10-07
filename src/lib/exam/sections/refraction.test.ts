import { describe, expect, it } from 'vitest';
import {
	addMonths,
	eyeId,
	formatAxis,
	formatPower,
	isQuarterStep,
	ouId,
	REFRACTION_FIELDS,
	refractionReport,
	rxExpiry,
	rxFromFindings,
	sumPd,
	transpose,
	transposeProblem
} from './refraction.ts';
import { FIELDS } from '../catalog.ts';
import { buildReport } from '../report.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));
const pw = (raw: string, kind: 'sph' | 'cyl' | 'add' = 'sph', sign: '+' | '-' = '+') => formatPower(raw, kind, sign).value;

describe('field ids', () => {
	it('uses eye_mag column names', () => {
		expect(eyeId('MR', 'SPH', 'OD')).toBe('MRODSPH');
		expect(eyeId('AR', 'NEARVA', 'OS')).toBe('ARNEAROSVA');
		expect(eyeId('CTL', 'BRAND', 'OD')).toBe('CTLBRANDOD');
		expect(eyeId('CTL', 'BC', 'OS')).toBe('CTLOSBC');
		expect(eyeId('W2', 'SPH', 'OD')).toBe('ODSPH_2');
		expect(ouId('W3', 'RX_TYPE')).toBe('RX_TYPE_3');
		expect(ouId('CTL', 'COMMENTS')).toBe('CTL_COMMENTS');
		expect(ouId('MR', 'COMMENTS')).toBe('MRCOMMENTS');
	});

	it('glasses #1 acuity is the Vision strip cc column (mirrored, owned by workup)', () => {
		expect(eyeId('W1', 'VA', 'OD')).toBe('ODVA');
		expect(eyeId('W1', 'NEARVA', 'OS')).toBe('OSVANEARCC');
		expect(REFRACTION_FIELDS.some((x) => x.id === 'ODVA' || x.id === 'MRODVA')).toBe(false);
		expect(REFRACTION_FIELDS.some((x) => x.id === 'ODVA_2')).toBe(true);
	});

	it('every refraction field is a REFRACTION field, and no field id is catalogued twice', () => {
		expect(REFRACTION_FIELDS.every((x) => x.section === 'REFRACTION' && !x.expand)).toBe(true);
		const ids = FIELDS.map((x) => x.id);
		expect(ids.length).toBe(new Set(ids).size);
	});
});

describe('power formatting (spec §8.7)', () => {
	it('sphere', () => {
		expect(pw('plano')).toBe('PLANO');
		expect(pw('Pl')).toBe('PLANO');
		expect(pw('0')).toBe('PLANO');
		expect(pw('1')).toBe('+1.00');
		expect(pw('-2')).toBe('-2.00');
		expect(pw('125')).toBe('+1.25');
		expect(pw('-1025')).toBe('-10.25');
		expect(pw('1.2')).toBe('+1.25');
		expect(pw('-.7')).toBe('-0.75');
		expect(pw('2.5')).toBe('+2.50');
		expect(pw('10')).toBe('+10.00');
		expect(pw('−3.5')).toBe('-3.50');
		expect(pw('=1')).toBe('+1.00');
		expect(pw('')).toBe('');
	});

	it('cylinder: "25" means 0.25 (FIX), SPH words, convention sign', () => {
		expect(pw('25', 'cyl')).toBe('+0.25');
		expect(pw('25', 'cyl', '-')).toBe('-0.25');
		expect(pw('sph', 'cyl')).toBe('SPH');
		expect(pw('DS', 'cyl')).toBe('SPH');
		expect(pw('0', 'cyl')).toBe('SPH');
		expect(formatPower('+1.5', 'cyl', '-')).toEqual({ value: '+1.50', ok: true, signTyped: '+' });
	});

	it('ADD is always plus', () => {
		expect(pw('2', 'add')).toBe('+2.00');
		expect(pw('-2.25', 'add')).toBe('+2.25');
		expect(pw('175', 'add')).toBe('+1.75');
	});

	it('non-quarter values are kept and flagged (FIX: working quarter-step test)', () => {
		expect(formatPower('1.3', 'sph')).toEqual({ value: '+1.30', ok: false, signTyped: '' });
		expect(formatPower('abc', 'sph').ok).toBe(false);
		expect(isQuarterStep('+1.30')).toBe(false);
		expect(isQuarterStep('-1.75')).toBe(true);
		expect(isQuarterStep('PLANO')).toBe(true);
	});

	it('is idempotent on formatted values', () => {
		for (const v of ['+1.25', '-10.00', 'PLANO']) expect(pw(v)).toBe(v);
		expect(pw('-0.50', 'cyl', '+')).toBe('-0.50');
	});
});

describe('axis (spec §8.7)', () => {
	it('pads to 3 digits and keeps 1-180', () => {
		expect(formatAxis('90').value).toBe('090');
		expect(formatAxis('5').value).toBe('005');
		expect(formatAxis('180').value).toBe('180');
		expect(formatAxis('0').value).toBe('180');
		expect(formatAxis('270').value).toBe('090');
		expect(formatAxis('400')).toEqual({ value: '400', ok: false });
		expect(formatAxis('x9').ok).toBe(false);
	});
});

describe('transpose (spec §8.7)', () => {
	it('plus to minus cylinder and back', () => {
		expect(transpose({ sph: '-2.00', cyl: '+1.00', axis: '090' })).toEqual({ sph: '-1.00', cyl: '-1.00', axis: '180' });
		expect(transpose({ sph: '-1.00', cyl: '-1.00', axis: '180' })).toEqual({ sph: '-2.00', cyl: '+1.00', axis: '090' });
	});
	it('0 sphere shows as PLANO; 90 becomes 180 (FIX), 91 becomes 001', () => {
		expect(transpose({ sph: '-0.50', cyl: '+0.50', axis: '045' })).toEqual({ sph: 'PLANO', cyl: '-0.50', axis: '135' });
		expect(transpose({ sph: 'PLANO', cyl: '-0.75', axis: '091' })).toEqual({ sph: '-0.75', cyl: '+0.75', axis: '001' });
	});
	it('nothing to do without a real cylinder', () => {
		expect(transpose({ sph: '+1.00', cyl: 'SPH', axis: '' })).toBeNull();
		expect(transpose({ sph: '+1.00', cyl: '', axis: '' })).toBeNull();
		expect(transposeProblem({ sph: '+1.00', cyl: '', axis: '' })).toBe('cyl');
	});
	it('a blank sphere is never read as plano', () => {
		expect(transpose({ sph: '', cyl: '-1.00', axis: '090' })).toBeNull();
		expect(transpose({ sph: '   ', cyl: '-1.00', axis: '090' })).toBeNull();
		expect(transposeProblem({ sph: '', cyl: '-1.00', axis: '090' })).toBe('sph');
		expect(transposeProblem({ sph: 'abc', cyl: '-1.00', axis: '090' })).toBe('sph');
	});
	it('PLANO, PL and 0 are an explicit zero sphere', () => {
		for (const sph of ['PLANO', 'plano', 'PL', 'pl', 'PLN', '0', '0.00', '+0.00']) {
			expect(transpose({ sph, cyl: '-1.00', axis: '090' }), sph).toEqual({ sph: '-1.00', cyl: '+1.00', axis: '180' });
		}
	});
	it('a blank or invalid axis is refused, not kept or invented', () => {
		expect(transpose({ sph: '-2.00', cyl: '+1.00', axis: '' })).toBeNull();
		expect(transposeProblem({ sph: '-2.00', cyl: '+1.00', axis: '' })).toBe('axis');
		expect(transposeProblem({ sph: '-2.00', cyl: '+1.00', axis: '400' })).toBe('axis');
		expect(transposeProblem({ sph: '-2.00', cyl: '+1.00', axis: 'x9' })).toBe('axis');
		expect(transposeProblem({ sph: '-2.00', cyl: '+1.00', axis: '90' })).toBeNull();
	});
});

describe('expiry (spec §12.3)', () => {
	it('spectacles one year, contact lenses six months, month ends clamped', () => {
		expect(rxExpiry('2026-10-06', 'MR')).toBe('2027-10-06');
		expect(rxExpiry('2026-10-06', 'W2')).toBe('2027-10-06');
		expect(rxExpiry('2026-10-06', 'CTL')).toBe('2027-04-06');
		expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
		expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
	});
});

describe('Rx values per source (spec §12.2)', () => {
	it('MR: own comments, prism with base, ADD, Bifocal only with an ADD', () => {
		const rx = rxFromFindings(
			f({ MRODSPH: '-2.00', MRODADD: '+2.00', MRODPRISM: '2', MRODBASE: 'BI', MRCOMMENTS: 'mine', CRCOMMENTS: 'not mine' }),
			'MR'
		);
		expect(rx.rxType).toBe('1');
		expect(rx.values).toMatchObject({ ODSPH: '-2.00', ODADD: '+2.00', ODPRISM: '2 BI', COMMENTS: 'mine' });
		expect(rxFromFindings(f({ MRODSPH: '-2.00' }), 'MR').rxType).toBe('0');
	});

	it('CR has no ADD and no default type', () => {
		const rx = rxFromFindings(f({ CRODSPH: '+1.00', MRODADD: '+2.00' }), 'CR');
		expect(rx.rxType).toBe('');
		expect(rx.values.ODADD).toBeUndefined();
	});

	it('W slot: its own values, type, and decimal binocular PD (FIX)', () => {
		const rx = rxFromFindings(f({ ODSPH_2: '+1.00', RX_TYPE_2: '3', ODMPDD_2: '31.5', OSMPDD_2: '32', LENS_TREATMENTS_2: 'UV protection|Tint' }), 'W2');
		expect(rx.rxType).toBe('3');
		expect(rx.values).toMatchObject({ ODSPH: '+1.00', BPDD: '63.5', LENS_TREATMENTS: 'UV protection|Tint' });
		expect(sumPd('31', 'x')).toBe('');
	});

	it('CTL: brand, manufacturer and supplier each from their own field (FIX)', () => {
		const rx = rxFromFindings(f({ CTLBRANDOD: 'B', CTLMANUFACTUREROD: 'M', CTLSUPPLIEROD: 'S', CTLODBC: '8.6', CTL_COMMENTS: 'c' }), 'CTL');
		expect(rx.values).toMatchObject({ CTLBRANDOD: 'B', CTLMANUFACTUREROD: 'M', CTLSUPPLIEROD: 'S', ODBC: '8.6', COMMENTS: 'c' });
	});
});

describe('report (spec §13.2 item 5)', () => {
	it('prints nothing without refraction values', () => {
		expect(refractionReport({})).toEqual([]);
		expect(refractionReport(f({ RX_TYPE_1: '1' }))).toEqual([]);
	});

	it('a cylinder-only refraction prints (FIX: any value, not only sphere)', () => {
		const s = refractionReport(f({ MROSCYL: '-0.50', MROSAXIS: '090' }));
		expect(s.map((x) => x.title)).toEqual(['Manifest (dry)']);
		expect(s[0].table!.body[1]).toEqual(['OS', '-', '-0.50', '090', '-', '-', '-', '-', '-']);
	});

	it('groups print in order: glasses, AR, MR, CR, CTL', () => {
		const x = f({ CTLODSPH: '-1.00', CRODSPH: '+0.50', MRODVA: '20/20', ARODSPH: '-1.00', ODSPH_2: '+1.00', RX_TYPE_2: '2', WETTYPE: 'Streak' });
		expect(refractionReport(x).map((s) => s.title)).toEqual([
			'Current glasses #2 · Trifocal',
			'Autorefraction',
			'Manifest (dry)',
			'Cycloplegic (wet) · Streak',
			'Contact lens'
		]);
	});

	it('contact lens has its own columns and the lens line', () => {
		const s = refractionReport(f({ CTLODSPH: '-1.00', CTLBRANDOD: 'Brand', CTLMANUFACTUREROD: 'Maker', CTLSUPPLIEROD: 'Shop', CTL_COMMENTS: 'daily wear' }))[0];
		expect(s.table!.head).toEqual(['Eye', 'Sph', 'Cyl', 'Axis', 'BC', 'Diam', 'ADD', 'Acuity']);
		expect(s.comments).toBe('OD: Brand by Maker via Shop. daily wear');
	});

	it('is part of the whole-exam report', () => {
		expect(buildReport(f({ ARODSPH: '-1.00' })).map((s) => s.title)).toContain('Autorefraction');
	});
});
