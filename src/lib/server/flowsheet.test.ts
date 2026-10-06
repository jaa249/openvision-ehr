import { beforeEach, describe, expect, it } from 'vitest';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { Issue } from '#lib/history/types.ts';
import type { DocMeta } from '#lib/components/documents/types.ts';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { saveFindings } from './exam.ts';
import { uploadDocument } from './documents.ts';
import {
	assembleFlowsheet,
	buildFlowsheet,
	FLOW_VISITS,
	formatHour,
	iopTargets,
	minutesOf,
	pickIop,
	splitEyeMeds,
	type FlowVisitInput
} from './flowsheet.ts';

const f = (o: Record<string, string>): Findings => Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));
const set = (db: DB, pid: number, eid: number, o: Record<string, string>) =>
	saveFindings(db, pid, eid, 1, Object.entries(o).map(([field, value]) => ({ field, value, isDefault: false })));

const issue = (o: Partial<Issue>): Issue => ({
	id: 1,
	type: 'EYEMED',
	title: 'Latanoprost',
	codes: '',
	begin: '',
	end: '',
	occurrence: '',
	reaction: '',
	outcome: '',
	provider: '',
	comments: '',
	active: true,
	...o
});

const doc = (id: number, takenOn: string, category = 'VISUAL_FIELD'): DocMeta => ({
	id,
	patientId: 1,
	encounterId: null,
	category,
	categoryName: '',
	filename: 'x.pdf',
	mime: 'application/pdf',
	size: 1,
	sha256: '',
	takenOn,
	notes: '',
	createdAt: '',
	createdBy: ''
});

const base = { issues: [], vf: [], oct: [], defaults: {}, today: '2026-10-06' };

describe('pickIop', () => {
	it('applanation, else Tono-Pen; finger tension ignored; method per eye', () => {
		const fi = f({ ODIOPAP: '18', ODIOPTPN: '20', OSIOPTPN: '16', OSIOPFTN: 'soft' });
		expect(pickIop(fi, 'OD')).toEqual({ value: 18, method: 'AP' });
		expect(pickIop(fi, 'OS')).toEqual({ value: 16, method: 'TPN' }); // FIX: OS method recorded
		expect(pickIop(f({ ODIOPFTN: 'firm' }), 'OD')).toBeNull();
	});
});

describe('formatHour (FIX: "08", not "008")', () => {
	it('formats to 24-hour HH:MM', () => {
		expect(formatHour('8:30 AM')).toBe('08:30');
		expect(formatHour('12:05 AM')).toBe('00:05');
		expect(formatHour('12:15 PM')).toBe('12:15');
		expect(formatHour('2:05 pm')).toBe('14:05');
		expect(formatHour('14:05')).toBe('14:05');
		expect(formatHour('08:30:00')).toBe('08:30');
		expect(formatHour('')).toBeNull();
		expect(formatHour('13:00 PM')).toBeNull();
		expect(formatHour('morning')).toBeNull();
		expect(minutesOf('08:30')).toBe(510);
	});
});

describe('splitEyeMeds (FIX: current = no end, or end after the visit)', () => {
	const meds = [
		issue({ id: 1, title: 'Latanoprost', begin: '2025-01-01' }),
		issue({ id: 2, title: 'Timolol', begin: '2024-01-01', end: '2026-12-01' }), // ends after the visit
		issue({ id: 3, title: 'Brimonidine', begin: '2023-01-01', end: '2025-06-01' }), // ended before
		issue({ id: 4, title: 'Dorzolamide', begin: '2024-01-01', end: '2026-10-06' }), // ended on the visit day
		issue({ id: 5, title: 'Netarsudil', begin: '2027-01-01' }), // starts later
		issue({ id: 6, type: 'MED', title: 'Lisinopril' })
	];
	it('splits as of the visit date', () => {
		const { current, prior } = splitEyeMeds(meds, '2026-10-06');
		expect(current.map((m) => m.title)).toEqual(['Latanoprost', 'Timolol']);
		expect(prior.map((m) => m.title)).toEqual(['Dorzolamide', 'Brimonidine']);
	});
	it('a past visit sees what was current then', () => {
		const { current, prior } = splitEyeMeds(meds, '2025-03-01');
		expect(current.map((m) => m.title).sort()).toEqual(['Brimonidine', 'Dorzolamide', 'Latanoprost', 'Timolol']);
		expect(prior).toEqual([]);
	});
});

describe('assembleFlowsheet', () => {
	const visits: FlowVisitInput[] = [
		{ id: 3, date: '2024-08-02', visitType: 'Comp', findings: f({ ODIOPAP: '22', OSIOPAP: '19', IOPTIME: '9:05 AM', ODGONIO: 'open to CBB', OSGONIO: 'open to CBB', ODCUP: '0.4' }) },
		{ id: 4, date: '2025-09-14', visitType: 'Comp', findings: f({ ODIOPAP: '18', ODIOPTARGET: '17', IOPTIME: '2:30 PM' }) }, // OS missing
		{ id: 1, date: '2026-10-06', visitType: 'Follow-up', findings: f({ ODIOPTPN: '15', OSIOPAP: '14' }) },
		{ id: 9, date: '2026-12-01', visitType: 'Later', findings: f({ ODIOPAP: '30' }) }
	];

	it('excludes visits after the exam and orders oldest first', () => {
		const s = assembleFlowsheet({ ...base, visits, currentId: 1 });
		expect(s.visits.map((v) => v.id)).toEqual([3, 4, 1]);
		expect(s.visits.at(-1)?.current).toBe(true);
		expect(s.asOf).toBe('2026-10-06');
	});

	it('without an exam: every visit, targets from the newest', () => {
		const s = assembleFlowsheet({ ...base, visits, currentId: null });
		expect(s.visits.map((v) => v.id)).toEqual([3, 4, 1, 9]);
		expect(s.encounterId).toBeNull();
	});

	it('missing values are gaps (null), never the text "null"', () => {
		const s = assembleFlowsheet({ ...base, visits, currentId: 1 });
		expect(s.visits[1].iop.OS).toBeNull();
		expect(JSON.stringify(s)).not.toContain('"null"');
		expect(s.visits[2].iop).toEqual({ OD: { value: 15, method: 'TPN' }, OS: { value: 14, method: 'AP' } });
	});

	it('targets carry forward from the last visit that set one; else provider, else 21', () => {
		const s = assembleFlowsheet({ ...base, visits, currentId: 1, defaults: { OSIOPTARGET: '18' } });
		expect(s.visits.map((v) => v.target.OD)).toEqual([21, 17, 17]);
		expect(s.visits.map((v) => v.target.OS)).toEqual([18, 18, 18]);
		expect(s.targets).toEqual({ OD: { value: 17, source: 'prior', from: '2025-09-14' }, OS: { value: 18, source: 'provider' } });
	});

	it('hours formatted HH:MM', () => {
		const s = assembleFlowsheet({ ...base, visits, currentId: 1 });
		expect(s.visits.map((v) => v.time)).toEqual(['09:05', '14:30', null]);
	});

	it('gonio, cups and VF/OCT markers aligned by date; docs after the exam excluded', () => {
		const s = assembleFlowsheet({
			...base,
			visits,
			currentId: 1,
			vf: [doc(20, '2026-11-01'), doc(21, '2025-10-01'), doc(22, '2025-09-14')],
			oct: [doc(30, '2026-01-10', 'OCT_NERVE'), doc(31, '2020-01-01', 'OCT_NERVE')]
		});
		expect(s.vf.map((d) => d.id)).toEqual([21, 22]);
		expect(s.markers).toEqual([
			{ date: '2024-08-02', kind: 'GONIO', ref: 3 },
			{ date: '2025-09-14', kind: 'VF', ref: 22 },
			{ date: '2025-10-01', kind: 'VF', ref: 21 },
			{ date: '2026-01-10', kind: 'OCT', ref: 30 }
		]); // the 2020 OCT predates the charted visits
		expect(s.dates).toEqual(['2024-08-02', '2025-09-14', '2025-10-01', '2026-01-10', '2026-10-06']);
		expect(s.oct.map((d) => d.id)).toEqual([30, 31]); // the list still shows every OCT
		expect(s.visits[0].cup).toEqual({ OD: '0.4', OS: '' });
	});

	it('with no priors, today’s reading still charts', () => {
		const s = assembleFlowsheet({ ...base, visits: [{ id: 1, date: '2026-10-06', visitType: 'New', findings: f({ ODIOPAP: '16' }) }], currentId: 1 });
		expect(s.visits).toHaveLength(1);
		expect(s.visits[0].iop.OD).toEqual({ value: 16, method: 'AP' });
		expect(s.dates).toEqual(['2026-10-06']);
	});

	it('keeps only the last 20 visits', () => {
		const many: FlowVisitInput[] = Array.from({ length: 25 }, (_, i) => ({
			id: i + 1,
			date: `2020-01-${String(i + 1).padStart(2, '0')}`,
			visitType: 'F/U',
			findings: f({ ODIOPAP: String(10 + i) })
		}));
		const s = assembleFlowsheet({ ...base, visits: many, currentId: 25 });
		expect(s.visits).toHaveLength(FLOW_VISITS);
		expect(s.visits[0].id).toBe(6);
	});
});

describe('database: iopTargets and buildFlowsheet', () => {
	let db: DB;
	beforeEach(() => {
		db = openDatabase(':memory:');
		seedDemo(db, '2026-10-06');
		// Patient 1: encounters 3 (2024-08-02), 4 (2025-09-14), 1 (today). Patient 2: encounter 2.
		db.prepare("DELETE FROM user_defaults WHERE field IN ('ODIOPTARGET', 'OSIOPTARGET')").run();
	});

	it('lookup order: exam, latest prior, provider default, 21', () => {
		expect(iopTargets(db, 1, 1, 1)).toEqual({ OD: { value: 21, source: 'default' }, OS: { value: 21, source: 'default' } });
		db.prepare("INSERT INTO user_defaults (user_id, field, value) VALUES (1, 'ODIOPTARGET', '18')").run();
		expect(iopTargets(db, 1, 1, 1)!.OD).toEqual({ value: 18, source: 'provider' });
		set(db, 1, 3, { ODIOPTARGET: '19' });
		set(db, 1, 4, { ODIOPTARGET: '16' });
		expect(iopTargets(db, 1, 1, 1)!.OD).toEqual({ value: 16, source: 'prior', from: '2025-09-14' });
		expect(iopTargets(db, 1, 4, 1)!.OD).toEqual({ value: 16, source: 'exam' });
		expect(iopTargets(db, 1, 3, 1)!.OD).toEqual({ value: 19, source: 'exam' });
		set(db, 1, 1, { ODIOPTARGET: '14' });
		expect(iopTargets(db, 1, 1, 1)!.OD).toEqual({ value: 14, source: 'exam' });
		// A later visit never feeds an earlier one.
		expect(iopTargets(db, 1, 3, 1)!.OS).toEqual({ value: 21, source: 'default' });
	});

	it('is scoped to the patient', () => {
		expect(iopTargets(db, 2, 1, 1)).toBeNull();
		expect(buildFlowsheet(db, 2, 1, 1)).toBeNull();
		expect(buildFlowsheet(db, 99, null, 1)).toBeNull();
	});

	it('builds from real rows, with flow-sheet documents only', () => {
		set(db, 1, 1, { ODIOPAP: '17', OSIOPAP: '15', IOPTIME: '8:30 AM' });
		db.prepare(
			"INSERT INTO issues (patient_id, type, title, begin_date, end_date, created_at, updated_at) VALUES (1, 'EYEMED', 'Timolol', '2024-01-01', '2025-01-01', 'x', 'x')"
		).run();
		const pdf = new TextEncoder().encode('%PDF-1.7\n%%EOF\n');
		uploadDocument(db, 1, { category: 'VISUAL_FIELD', bytes: pdf, takenOn: '2025-09-14' }, 1);
		uploadDocument(db, 1, { category: 'FUNDUS_PHOTO', bytes: pdf, takenOn: '2025-09-14' }, 1);
		uploadDocument(db, 2, { category: 'VISUAL_FIELD', bytes: pdf, takenOn: '2025-09-14' }, 1);
		const s = buildFlowsheet(db, 1, 1, 1, '2026-10-06')!;
		expect(s.visits.map((v) => v.id)).toEqual([3, 4, 1]);
		expect(s.visits[2]).toMatchObject({ time: '08:30', iop: { OD: { value: 17, method: 'AP' } } });
		expect(s.vf).toHaveLength(1);
		expect(s.oct).toHaveLength(0);
		expect(s.meds.current.map((m) => m.title)).toEqual(['Artificial tears']);
		expect(s.meds.prior.map((m) => m.title)).toEqual(['Timolol']);
		expect(s.visits[0].cup).toEqual({ OD: '0.4', OS: '0.4' });
	});
});
