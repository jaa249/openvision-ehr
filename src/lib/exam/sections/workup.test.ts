import { describe, expect, it } from 'vitest';
import { FIELDS, FIELD_BY_ID, SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { buildReport } from '#lib/exam/report.ts';
import { ALIASES, COMMANDS } from '#lib/shorthand/codes.ts';
import { applyOps, parseShorthand, type Findings } from '#lib/shorthand/parse.ts';
import {
	WORKUP_ALIASES,
	WORKUP_DEFAULTS,
	WORKUP_FIELDS,
	fieldsState,
	formatTime,
	iopTarget,
	isHighIop,
	needsTimeStamp,
	normalizeReactivity,
	normalizeVA,
	workupReport
} from './workup.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));
const sec = (x: Findings, t: string) => workupReport(x).find((s) => s.title.startsWith(t));
const titles = (x: Findings) => workupReport(x).map((s) => s.title);

describe('workup catalog', () => {
	it('every field id is unique across the whole catalog', () => {
		const ids = FIELDS.map((x) => x.id);
		const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
		expect(dupes).toEqual([]);
	});

	it('every workup field is catalogued with a sane maxLength and a valid eye', () => {
		expect(WORKUP_FIELDS.length).toBeGreaterThan(50);
		for (const d of WORKUP_FIELDS) {
			expect(FIELD_BY_ID.get(d.id)).toBe(d);
			expect(d.maxLength).toBeGreaterThanOrEqual(1);
			expect(d.maxLength).toBeLessThanOrEqual(4000);
			expect(['ACUITY', 'IOP']).toContain(d.section);
			expect(['OD', 'OS', 'OU']).toContain(d.eye);
			if (d.id.startsWith('OD') || d.id.startsWith('DIMOD')) expect(d.eye).toBe('OD');
			if (d.id.startsWith('OS') || d.id.startsWith('DIMOS')) expect(d.eye).toBe('OS');
		}
		// measurements are short; VA columns are varchar(25) in eye_mag
		expect(FIELD_BY_ID.get('SCODVA')?.maxLength).toBe(25);
		expect(FIELD_BY_ID.get('ODIOPAP')?.maxLength).toBe(10);
		expect(FIELD_BY_ID.get('ODVF1')?.maxLength).toBe(1);
		expect(FIELD_BY_ID.get('BINOCVA')?.eye).toBe('OU');
		expect(FIELD_BY_ID.get('IOPTIME')?.eye).toBe('OU');
	});

	it('uses eye_mag column names for the core fields', () => {
		for (const id of ['SCODVA', 'PHOSVA', 'ODIOPAP', 'OSIOPTPN', 'IOPTIME', 'AMSLEROD', 'OSVF4', 'ODPUPILSIZE1', 'DIMOSPUPILREACTIVITY', 'PUPIL_COMMENTS'])
			expect(FIELD_BY_ID.has(id), id).toBe(true);
	});

	it('defaults target catalogued fields and are part of the seed', () => {
		for (const [id, value] of Object.entries(WORKUP_DEFAULTS)) {
			expect(FIELD_BY_ID.has(id), id).toBe(true);
			expect(SEED_DEFAULTS[id]).toBe(value);
		}
	});

	it('aliases point at real fields and do not shadow other codes', () => {
		for (const [code, ids] of Object.entries(WORKUP_ALIASES)) {
			expect(code).toBe(code.toUpperCase());
			for (const id of ids) expect(FIELD_BY_ID.has(id), `${code} -> ${id}`).toBe(true);
			expect(FIELD_BY_ID.has(code), `${code} is also a field id`).toBe(false);
			expect(COMMANDS[code], `${code} is also a command`).toBeUndefined();
			expect(ALIASES[code]).toEqual(ids);
		}
	});
});

describe('workup shorthand', () => {
	it('exact field ids enter VA and IOP (spec §2.3 stage 3)', () => {
		const { ops, errors } = parseShorthand('SCODVA:20/25-2; scosva:20/20; ODIOPAP:15; OSIOPAP 17');
		expect(errors).toEqual([]);
		const { findings } = applyOps({}, ops);
		expect(findings.SCODVA.value).toBe('20/25-2');
		expect(findings.SCOSVA.value).toBe('20/20');
		expect(findings.ODIOPAP.value).toBe('15');
		expect(findings.OSIOPAP.value).toBe('17');
	});

	it('convenience aliases resolve to both or one eye', () => {
		const { ops, errors } = parseShorthand('bva:20/20; iop:16; lapd:1+; pupcom:sluggish');
		expect(errors).toEqual([]);
		const { findings } = applyOps({}, ops);
		expect([findings.SCODVA.value, findings.SCOSVA.value]).toEqual(['20/20', '20/20']);
		expect([findings.ODIOPAP.value, findings.OSIOPAP.value]).toEqual(['16', '16']);
		expect(findings.OSAPD.value).toBe('1+');
		expect(findings.PUPIL_COMMENTS.value).toBe('sluggish');
	});

	it('measurement text is not vocabulary-expanded and is clipped to the column', () => {
		const { ops } = parseShorthand('RVA:20/20 inf temp; RIOP:123456789012');
		const { findings } = applyOps({}, ops);
		expect(findings.SCODVA.value).toBe('20/20 inf temp');
		expect(findings.ODIOPAP.value).toBe('1234567890');
	});

	it('the D command fills the pupil normals', () => {
		const { findings } = applyOps({}, parseShorthand('d').ops);
		expect(findings.ODPUPILREACTIVITY).toEqual({ value: '+2', isDefault: true });
		expect(findings.OSAPD).toEqual({ value: '0', isDefault: true });
	});
});

describe('entry helpers', () => {
	it('normalizes VA: "=" to "+", leading j to J (§8.1)', () => {
		expect(normalizeVA('20/20=2')).toBe('20/20+2');
		expect(normalizeVA('j1=')).toBe('J1+');
		expect(normalizeVA('20/40 j')).toBe('20/40 j');
	});

	it('prefixes a single-digit reactivity with + (§8.6)', () => {
		expect(normalizeReactivity('2')).toBe('+2');
		expect(normalizeReactivity('+3')).toBe('+3');
		expect(normalizeReactivity('brisk')).toBe('brisk');
	});

	it('formats and stamps the IOP time (§8.3)', () => {
		expect(formatTime(new Date(2026, 0, 1, 9, 5))).toBe('9:05 AM');
		expect(formatTime(new Date(2026, 0, 1, 0, 30))).toBe('12:30 AM');
		expect(formatTime(new Date(2026, 0, 1, 14, 0))).toBe('2:00 PM');
		expect(needsTimeStamp('')).toBe(true);
		expect(needsTimeStamp('12:00 AM')).toBe(true);
		expect(needsTimeStamp('00:00')).toBe(true);
		expect(needsTimeStamp('9:05 AM')).toBe(false);
	});

	it('high IOP compares numerically against the target (FIX §8.3)', () => {
		expect(isHighIop('3')).toBe(false); // text compare would call "3" > "21" high
		expect(isHighIop('100')).toBe(true);
		expect(isHighIop('21')).toBe(false);
		expect(isHighIop('22')).toBe(true);
		expect(isHighIop('soft')).toBe(false);
		expect(isHighIop('19', 18)).toBe(true);
		expect(iopTarget('OD', {})).toBe(21);
		expect(iopTarget('OD', {}, { ODIOPTARGET: '18' })).toBe(18);
		expect(iopTarget('OS', f({ OSIOPTARGET: '15' }), { OSIOPTARGET: '18' })).toBe(15);
	});

	it('derives the fields state per eye', () => {
		expect(fieldsState({}, 'OD')).toBe('untested');
		expect(fieldsState(f({ ODVF1: '0', ODVF2: '0', ODVF3: '0', ODVF4: '0' }), 'OD')).toBe('full');
		expect(fieldsState(f({ ODVF1: '0', ODVF2: '1' }), 'OD')).toBe('defect');
	});
});

describe('workup report (spec §13.2 items 3-4)', () => {
	it('an empty exam prints nothing', () => {
		expect(workupReport({})).toEqual([]);
	});

	it('acuity rows print only when either eye has a value, in report order', () => {
		const s = sec(f({ PHOSVA: '20/25', SCODVA: '20/40', MRNEARODVA: 'J1' }), 'Visual acuities')!;
		expect(s.rows).toMatchObject([
			{ label: 'sc', od: '20/40', os: '' },
			{ label: 'PH', od: '', os: '20/25' },
			{ label: 'MR near', od: 'J1', os: '' }
		]);
	});

	it('binocular VA and glare comments go in the acuity notes', () => {
		const s = sec(f({ BINOCVA: '20/20', GLARECOMMENTS: 'BAT high' }), 'Visual acuities')!;
		expect(s.rows).toEqual([]);
		expect(s.comments).toBe('Binocular VA 20/20. Glare: BAT high');
	});

	it('IOP prints each method only when present, with the time', () => {
		const s = sec(f({ ODIOPAP: '15', OSIOPAP: '17', IOPTIME: '9:05 AM', OSIOPFTN: 'soft' }), 'Intraocular')!;
		expect(s.title).toBe('Intraocular pressures @ 9:05 AM');
		expect(s.rows).toMatchObject([
			{ label: 'App', od: '15 mmHg', os: '17 mmHg' },
			{ label: 'FTN', od: '', os: 'soft' }
		]);
	});

	it('the IOP time alone prints nothing (FIX: time only with an IOP)', () => {
		expect(titles(f({ IOPTIME: '9:05 AM' }))).toEqual([]);
		expect(sec(f({ ODIOPPOST: '18', IOPTIME: '9:05 AM' }), 'Intraocular')?.title).toBe('Intraocular pressures');
	});

	it('untested fields print "not tested", never "full" (FIX)', () => {
		const s = sec(f({ SCODVA: '20/20' }), 'Confrontation fields')!;
		expect(s.summary).toBe('not tested OU');
		expect(s.table).toBeUndefined();
	});

	it('all quadrants unflagged prints "Full to CF OU"', () => {
		const zeros = Object.fromEntries(['OD', 'OS'].flatMap((e) => [1, 2, 3, 4].map((n) => [`${e}VF${n}`, '0'])));
		expect(sec(f(zeros), 'Confrontation fields')?.summary).toBe('Full to CF OU');
	});

	it('one eye tested prints per eye', () => {
		const s = sec(f({ ODVF1: '0', ODVF2: '0', ODVF3: '0', ODVF4: '0' }), 'Confrontation fields')!;
		expect(s.summary).toBe('Full to CF OD, not tested OS');
	});

	it('a flagged quadrant prints the quadrant grid', () => {
		const s = sec(f({ ODVF1: '1', ODVF2: '0', ODVF3: '0', ODVF4: '0', OSVF1: '0', OSVF2: '0', OSVF3: '0', OSVF4: '0' }), 'Confrontation fields')!;
		expect(s.table?.head).toEqual(['', 'OD temporal', 'OD nasal', 'OS nasal', 'OS temporal']);
		expect(s.table?.body).toEqual([
			['Superior', 'defect', 'full', 'full', 'full'],
			['Inferior', 'full', 'full', 'full', 'full']
		]);
	});

	it('pupils: "Round and reactive" when Normal and sizes blank; otherwise the measures', () => {
		expect(sec(f({ PUPIL_NORMAL: '1' }), 'Pupils')?.summary).toBe('Round and reactive');
		const s = sec(f({ PUPIL_NORMAL: '1', ODPUPILSIZE1: '3', ODPUPILSIZE2: '2', OSPUPILREACTIVITY: '+2', ODAPD: '0' }), 'Pupils')!;
		expect(s.rows).toMatchObject([
			{ label: 'Size', od: '3 → 2', os: '' },
			{ label: 'Reactivity', od: '', os: '+2' },
			{ label: 'APD', od: '0', os: '' }
		]);
	});

	it('dim pupils and Amsler print only when present', () => {
		expect(sec(f({ SCODVA: '20/20' }), 'Dim pupils')).toBeUndefined();
		const s = sec(f({ AMSLEROD: '0', AMSLEROS: '3', DIMODPUPILSIZE1: '6' }), 'Dim pupils')!;
		expect(s.rows).toMatchObject([
			{ label: 'Dim size', od: '6', os: '' },
			{ label: 'Amsler', od: '0/5', os: '3/5' }
		]);
		expect(sec(f({ PUPIL_COMMENTS: 'irregular OS' }), 'Dim pupils')?.comments).toBe('irregular OS');
	});

	it('Amsler alone does not drag in the fields line', () => {
		expect(titles(f({ AMSLEROD: '0' }))).toEqual(['Dim pupils and Amsler']);
	});

	it('the strip comes before the exam sections in the full report, titles unique', () => {
		const t = buildReport(f({ SCODVA: '20/20', ODIOPAP: '14', IOPTIME: '8:00 AM', ODCONJ: 'quiet', PUPIL_NORMAL: '1' })).map((s) => s.title);
		expect(t.slice(0, 4)).toEqual(['Visual acuities', 'Intraocular pressures @ 8:00 AM', 'Confrontation fields', 'Pupils']);
		expect(t).toContain('Anterior segment');
		expect(new Set(t).size).toBe(t.length);
	});
});
