import { describe, expect, it } from 'vitest';
import { FIELDS, FIELD_BY_ID, SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { buildReport } from '#lib/exam/report.ts';
import { ALIASES, COMMANDS } from '#lib/shorthand/codes.ts';
import { applyOps, parseShorthand, type Findings } from '#lib/shorthand/parse.ts';
import {
	DILATION_ALIASES,
	DILATION_DEFAULTS,
	DILATION_FIELDS,
	DROP_IDS,
	dilationDrops,
	dilationReport,
	dropGiven,
	isDilated,
	risksDiscussed
} from './dilation.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));

describe('dilation catalog', () => {
	it('has the form_eye_postseg dilation columns plus DIL_TIME and NEO10, in the IOP section', () => {
		const ids = DILATION_FIELDS.map((x) => x.id).sort();
		expect(ids).toEqual(
			['ATROPINE', 'CYCLOGYL', 'CYCLOMYDRIL', 'DIL_MEDS', 'DIL_RISKS', 'DIL_TIME', 'NEO10', 'NEO25', 'TROPICAMIDE'].sort()
		);
		for (const d of DILATION_FIELDS) {
			expect(d.section).toBe('IOP');
			expect(FIELD_BY_ID.get(d.id)).toBe(d);
		}
		expect(FIELD_BY_ID.get('TROPICAMIDE')!.maxLength).toBe(25);
		expect(FIELD_BY_ID.get('DIL_RISKS')!.maxLength).toBe(2);
	});

	it('ids are unique across the catalog', () => {
		const all = FIELDS.map((x) => x.id);
		expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
	});

	it('is never defaulted (dilating is not a "normal" value)', () => {
		expect(DILATION_DEFAULTS).toEqual({});
		for (const d of DILATION_FIELDS) expect(SEED_DEFAULTS[d.id]).toBeUndefined();
	});

	it('aliases target real fields, are wired in and clash with no command', () => {
		for (const [code, targets] of Object.entries(DILATION_ALIASES)) {
			expect(ALIASES[code]).toEqual(targets);
			expect(COMMANDS[code]).toBeUndefined();
			for (const t of targets) expect(FIELD_BY_ID.has(t)).toBe(true);
		}
	});

	it('shorthand writes the strength typed', () => {
		const { ops, errors } = parseShorthand('TROP:1%;NEO:2.5%;DILTIME:2:10 PM;DILRISK:on');
		expect(errors).toEqual([]);
		const { findings } = applyOps({}, ops, {});
		expect(findings.TROPICAMIDE.value).toBe('1%');
		expect(findings.NEO25.value).toBe('2.5%');
		expect(findings.DIL_RISKS.value).toBe('on');
	});
});

describe('isDilated', () => {
	it('is false with nothing, with only the risks box, or with off values', () => {
		expect(isDilated({})).toBe(false);
		expect(isDilated(f({ DIL_RISKS: 'on', DIL_TIME: '2:10 PM' }))).toBe(false);
		expect(isDilated(f({ TROPICAMIDE: '0', NEO25: 'off', CYCLOGYL: '  ' }))).toBe(false);
	});
	it('is true with any drop or other-drops text', () => {
		for (const id of DROP_IDS) expect(isDilated(f({ [id]: '1%' }))).toBe(true);
		expect(isDilated(f({ DIL_MEDS: 'paremyd' }))).toBe(true);
	});
	it('helpers', () => {
		expect(dropGiven(f({ ATROPINE: '1%' }), 'ATROPINE')).toBe(true);
		expect(risksDiscussed(f({ DIL_RISKS: 'on' }))).toBe(true);
		expect(risksDiscussed(f({ DIL_RISKS: '' }))).toBe(false);
	});
});

describe('dilationReport', () => {
	it('prints nothing when not dilated', () => {
		expect(dilationReport(f({ DIL_TIME: '2:10 PM', DIL_RISKS: 'on' }))).toEqual([]);
	});
	it('prints one line with drops in toggle order, time and risks', () => {
		const r = dilationReport(f({ NEO25: '2.5%', TROPICAMIDE: '1%', DIL_TIME: '2:10 PM', DIL_RISKS: 'on' }));
		expect(r).toHaveLength(1);
		expect(r[0].summary).toBe('Dilated: tropicamide 1%, phenylephrine 2.5% at 2:10 PM. Risks discussed.');
		expect(r[0].rows).toEqual([]);
	});
	it('handles imported "on" flags and other drops; no time when blank', () => {
		expect(dilationDrops(f({ ATROPINE: 'on', DIL_MEDS: 'paremyd' }))).toEqual(['atropine', 'paremyd']);
		expect(dilationReport(f({ CYCLOGYL: '1%' }))[0].summary).toBe('Dilated: cyclopentolate 1%.');
	});
	it('prints just before Retina in the full report', () => {
		const titles = buildReport(f({ TROPICAMIDE: '1%', ODDISC: 'pink' })).map((s) => s.title);
		expect(titles.indexOf('Dilation')).toBeGreaterThanOrEqual(0);
		expect(titles.indexOf('Dilation')).toBe(titles.indexOf('Retina') - 1);
	});
});
