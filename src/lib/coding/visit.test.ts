import { describe, expect, it } from 'vitest';
import type { Findings } from '#lib/shorthand/parse.ts';
import { VISIT_CODES, visitCode, type Family, type PatientStatus, type VisitLevel } from './codes.ts';
import { levelEvidence, patientStatus, recordedSections, splitCodes, suggestVisit, yearsBefore } from './visit.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));

describe('visit code table', () => {
	it('maps every eye family combination to the right code', () => {
		const cases: [PatientStatus, VisitLevel, string][] = [
			['new', 'intermediate', '92002'],
			['new', 'comprehensive', '92004'],
			['established', 'intermediate', '92012'],
			['established', 'comprehensive', '92014']
		];
		for (const [p, l, code] of cases) expect(visitCode('eye', p, l)?.code).toBe(code);
	});
	it('has the office E/M codes 99202-99205 and 99212-99215 only (B8: no 99002/99003/99012/99013)', () => {
		const em = VISIT_CODES.filter((c) => c.family === 'em').map((c) => c.code);
		expect(em).toEqual(['99202', '99203', '99204', '99205', '99212', '99213', '99214', '99215']);
		for (const bad of ['99002', '99003', '99012', '99013']) expect(VISIT_CODES.some((c) => c.code === bad)).toBe(false);
		expect(visitCode('em', 'established', 'moderate')?.code).toBe('99214');
	});
	it('has no impossible combinations and never says "Detailed"', () => {
		expect(visitCode('eye', 'new', 'moderate')).toBeUndefined();
		expect(visitCode('em' as Family, 'new', 'comprehensive')).toBeUndefined();
		for (const c of VISIT_CODES) expect(c.label.toLowerCase()).not.toContain('detailed');
	});
});

describe('new vs established (§11.1 FIX)', () => {
	const today = { date: '2026-10-06', providerId: 1 };
	it('new with no earlier visit', () => {
		expect(patientStatus(today, []).status).toBe('new');
	});
	it('established with a same-provider visit within 3 years', () => {
		const r = patientStatus(today, [{ date: '2025-09-14', providerId: 1 }]);
		expect(r).toMatchObject({ status: 'established', lastVisit: '2025-09-14' });
	});
	it('3-year boundary: the same date 3 years back counts, the day before does not', () => {
		expect(patientStatus(today, [{ date: '2023-10-06', providerId: 1 }]).status).toBe('established');
		const r = patientStatus(today, [{ date: '2023-10-05', providerId: 1 }]);
		expect(r.status).toBe('new');
		expect(r.reason).toContain('more than 3 years');
	});
	it('ignores future and same-day visits', () => {
		expect(patientStatus(today, [{ date: '2026-12-01', providerId: 1 }]).status).toBe('new');
		expect(patientStatus(today, [{ date: '2026-10-06', providerId: 1 }]).status).toBe('new');
	});
	it('another provider leaves the patient new (no specialty-group model yet)', () => {
		const r = patientStatus(today, [{ date: '2026-01-01', providerId: 2 }]);
		expect(r.status).toBe('new');
		expect(r.reason).toContain('different provider');
	});
	it('picks the most recent qualifying visit and accepts ISO timestamps', () => {
		const r = patientStatus({ date: '2026-10-06T09:00:00Z', providerId: 1 }, [
			{ date: '2024-08-02', providerId: 1 },
			{ date: '2025-09-14T10:00:00Z', providerId: 1 }
		]);
		expect(r.lastVisit).toBe('2025-09-14');
	});
	it('yearsBefore keeps the calendar date', () => {
		expect(yearsBefore('2028-02-29', 3)).toBe('2025-02-29');
		expect('2025-02-28' < yearsBefore('2028-02-29', 3)).toBe(true);
	});
});

const fullExam = f({
	CC1: 'blur',
	TIMING1: 'weeks',
	SEVERITY1: 'mild',
	LOCATION1: 'OU',
	QUALITY1: 'hazy',
	SCODVA: '20/25',
	ODIOPAP: '15',
	RUL: 'normal',
	ODCONJ: 'quiet',
	ODDISC: 'pink',
	ODPERIPH: 'flat',
	TROPICAMIDE: '1%'
});
const established = { status: 'established' as const, reason: 'Seen before.', lastVisit: '2025-09-14' };

describe('level evidence (advisory)', () => {
	it('lists each documented element with met / not met', () => {
		const ev = levelEvidence({ findings: fullExam, items: [{ title: 'Cataract', codes: 'H25.13' }, { title: 'Dry eye', codes: '' }], orders: ['OCT macula'] });
		const by = Object.fromEntries(ev.map((e) => [e.id, e]));
		expect(by.history.met).toBe(true);
		expect(by.history.detail).toContain('4 HPI elements');
		expect(by.sections.met).toBe(true);
		expect(by.dilation.met).toBe(true);
		expect(by.periphery.detail).toContain('OD');
		expect(by.diagnoses.detail).toBe('1 coded item of 2 in the impression.');
		expect(by.orders.met).toBe(true);
		for (const e of ev) expect(e.label.toLowerCase()).not.toContain('detailed');
	});
	it('reports missing sections and nothing met on an empty exam', () => {
		const ev = levelEvidence({ findings: {}, items: [], orders: [] });
		expect(ev.every((e) => !e.met)).toBe(true);
		expect(ev.find((e) => e.id === 'sections')!.detail).toContain('Missing: Vision, IOP / pupils, External, Slit lamp, Fundus');
	});
	it('recordedSections ignores blanks and unknown ids', () => {
		expect([...recordedSections(f({ SCODVA: ' ', ODCONJ: 'quiet', BOGUS: 'x' }))]).toEqual(['ANTSEG']);
	});
	it('splitCodes drops placeholders', () => {
		expect(splitCodes('H40.003, Code, e11.9')).toEqual(['H40.003', 'E11.9']);
	});
});

describe('suggestVisit', () => {
	it('comprehensive (92014) with a complete dilated exam and orders', () => {
		const s = suggestVisit({ findings: fullExam, items: [], orders: ['OCT'], patient: established });
		expect(s.code).toBe('92014');
		expect(s.level).toBe('comprehensive');
		expect(s.reasons.join(' ')).toContain('Advisory');
	});
	it('intermediate (92002) for a new patient without dilation, saying what is missing', () => {
		const { TROPICAMIDE: _t, ...rest } = fullExam;
		const s = suggestVisit({ findings: rest, items: [], orders: ['OCT'], patient: { status: 'new', reason: 'No earlier visit.', lastVisit: null } });
		expect(s.code).toBe('92002');
		expect(s.reasons.join(' ')).toContain('missing dilation');
	});
	it('comprehensive needs history or orders on top of the exam', () => {
		const exam = f({ SCODVA: '20/20', ODIOPAP: '14', RUL: 'normal', ODCONJ: 'quiet', ODDISC: 'pink', ODPERIPH: 'flat', TROPICAMIDE: '1%' });
		expect(suggestVisit({ findings: exam, items: [], orders: [], patient: established }).code).toBe('92012');
		expect(suggestVisit({ findings: exam, items: [], orders: ['Visual field'], patient: established }).code).toBe('92014');
	});
});
