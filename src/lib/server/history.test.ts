import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate, openDatabase, seedDemo, type DB } from './db.ts';
import {
	addIssuesFromShorthand,
	deleteIssue,
	getPmsfh,
	HistoryValidationError,
	quickPickTitles,
	saveFamily,
	saveIssue,
	saveSocial,
	setNoKnownAllergies
} from './history.ts';
import { addAllergy, removeAllergy } from './patients.ts';
import { getPatientHeader } from './exam.ts';
import { BUILTIN_TITLES } from '#lib/history/lists.ts';

const TODAY = '2026-10-06';
const NOW = new Date('2026-10-06T15:00:00Z');
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
});

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof HistoryValidationError) return e.errors;
		throw e;
	}
	return null;
};
const titles = (pid: number, type: string) =>
	getPmsfh(db, pid, TODAY)
		.issues.filter((i) => i.type === type)
		.map((i) => i.title);

describe('demo data and reading', () => {
	it('Jordan has issues, history and listed allergies; Alex has nothing recorded', () => {
		const j = getPmsfh(db, 1, TODAY);
		expect(j.allergyStatus).toEqual({ kind: 'listed', allergies: [{ title: 'Sulfa', reaction: 'hives' }] });
		expect(titles(1, 'PMH')).toEqual(['Hypertension', 'Type 2 diabetes']);
		expect(j.family.glaucoma).toBe('mother');
		expect(j.social.occupation).toBe('teacher');
		const a = getPmsfh(db, 2, TODAY);
		expect(a).toEqual({ issues: [], allergyStatus: { kind: 'unknown' }, family: {}, social: {} });
	});
});

describe('saveIssue', () => {
	it('inserts, linked to the visit it was added in', () => {
		const r = saveIssue(db, 2, 1, { type: 'POH', title: '  Dry   eye ', codes: '', provider: 'Dr. Referral' }, { encounterId: 2, now: NOW })!;
		expect(r.created).toBe(true);
		const row = db.prepare('SELECT title, provider, encounter_id, created_by FROM issues WHERE id = ?').get(r.id);
		expect(row).toEqual({ title: 'Dry eye', provider: 'Dr. Referral', encounter_id: 2, created_by: 1 });
	});

	it('validates: title required, real dates, end not before begin, lists', () => {
		const e = errorsOf(() => saveIssue(db, 1, 1, { type: 'PMH', title: ' ', begin: '2025-02-30', end: '2024-01-01', occurrence: 'often' }))!;
		expect(Object.keys(e).sort()).toEqual(['begin', 'occurrence', 'title']);
		expect(errorsOf(() => saveIssue(db, 1, 1, { type: 'PMH', title: 'Asthma', begin: '2025-01-02', end: '2025-01-01' }))?.end).toMatch(/before/);
		expect(errorsOf(() => saveIssue(db, 1, 1, { type: 'NOPE', title: 'x' }))?.type).toBeTruthy();
		expect(errorsOf(() => saveIssue(db, 1, 1, { type: 'SURG', title: 'x', outcome: 'great' }))?.outcome).toBeTruthy();
	});

	it('blanks fields the type does not have', () => {
		const r = saveIssue(db, 2, 1, { type: 'POH', title: 'Myopia', reaction: 'x', occurrence: 'chronic', end: '2026-01-01' })!;
		const i = getPmsfh(db, 2, TODAY).issues.find((x) => x.id === r.id)!;
		expect([i.reaction, i.occurrence, i.end]).toEqual(['', '', '']);
	});

	it('a duplicate title of the same type updates in place; another type never collides', () => {
		const pmh = saveIssue(db, 1, 1, { type: 'PMH', title: 'hypertension', comments: 'new note', occurrence: 'chronic' })!;
		expect(pmh.created).toBe(false);
		expect(titles(1, 'PMH')).toEqual(['Hypertension', 'Type 2 diabetes']);
		const poh = saveIssue(db, 1, 1, { type: 'POH', title: 'Hypertension' })!;
		expect(poh.created).toBe(true);
		expect(titles(1, 'PMH')).toHaveLength(2);
	});

	it('editing to an existing title of the same type is refused', () => {
		const id = getPmsfh(db, 1, TODAY).issues.find((i) => i.title === 'Type 2 diabetes')!.id;
		expect(errorsOf(() => saveIssue(db, 1, 1, { id, type: 'PMH', title: 'HYPERTENSION' }))?.title).toMatch(/already/);
	});

	it('edits only issues of this patient', () => {
		const id = getPmsfh(db, 1, TODAY).issues[0].id;
		expect(saveIssue(db, 2, 1, { id, type: 'PMH', title: 'stolen' })).toBeNull();
		expect(saveIssue(db, 99, 1, { type: 'PMH', title: 'x' })).toBeNull();
	});

	it('medication start defaults to the visit date (meds) or today (eye meds)', () => {
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (9, 2, 1, '2026-09-01', 'Urgent')").run();
		const med = saveIssue(db, 2, 1, { type: 'MED', title: 'Metformin' }, { encounterId: 9, now: NOW })!;
		const eye = saveIssue(db, 2, 1, { type: 'EYEMED', title: 'Timolol 0.5%' }, { encounterId: 9, now: NOW })!;
		const begin = (id: number) => getPmsfh(db, 2, TODAY).issues.find((i) => i.id === id)!.begin;
		expect(begin(med.id)).toBe('2026-09-01');
		expect(begin(eye.id)).toBe(TODAY);
	});

	it('an end date in the past makes an issue inactive', () => {
		const r = saveIssue(db, 2, 1, { type: 'MED', title: 'Amoxicillin', begin: '2026-01-01', end: '2026-01-10' })!;
		expect(getPmsfh(db, 2, TODAY).issues.find((i) => i.id === r.id)!.active).toBe(false);
	});
});

describe('deleteIssue', () => {
	it('is scoped to the patient', () => {
		const id = getPmsfh(db, 1, TODAY).issues[0].id;
		expect(deleteIssue(db, 2, id)).toBe(false);
		expect(deleteIssue(db, 1, id)).toBe(true);
		expect(deleteIssue(db, 1, id)).toBe(false);
	});
});

describe('allergy status (unknown / none / listed)', () => {
	it('NKDA is recorded with who and when, and shows in the header', () => {
		setNoKnownAllergies(db, 2, 1, true, NOW);
		expect(getPatientHeader(db, 2)?.allergyStatus).toEqual({ kind: 'none', confirmedBy: 'Dr. Example', confirmedAt: NOW.toISOString() });
		setNoKnownAllergies(db, 2, 1, false, NOW);
		expect(getPatientHeader(db, 2)?.allergyStatus).toEqual({ kind: 'unknown' });
	});

	it('NKDA is refused while active allergies exist', () => {
		expect(errorsOf(() => setNoKnownAllergies(db, 1, 1, true, NOW))?.nkda).toMatch(/active allergies/);
		expect(setNoKnownAllergies(db, 99, 1, true, NOW)).toBe(false);
	});

	it('adding an allergy (any route) clears NKDA; removing the last returns to unknown, not NKDA', () => {
		setNoKnownAllergies(db, 2, 1, true, NOW);
		const id = addAllergy(db, 2, { title: 'Latex' }, 1)!;
		expect(getPmsfh(db, 2, TODAY).allergyStatus.kind).toBe('listed');
		removeAllergy(db, 2, id);
		expect(getPmsfh(db, 2, TODAY).allergyStatus).toEqual({ kind: 'unknown' });

		setNoKnownAllergies(db, 2, 1, true, NOW);
		saveIssue(db, 2, 1, { type: 'ALLERGY', title: 'Codeine', reaction: 'nausea' });
		expect(getPmsfh(db, 2, TODAY).allergyStatus).toEqual({ kind: 'listed', allergies: [{ title: 'Codeine', reaction: 'nausea' }] });

		const cid = getPmsfh(db, 2, TODAY).issues[0].id;
		deleteIssue(db, 2, cid);
		setNoKnownAllergies(db, 2, 1, true, NOW);
		addIssuesFromShorthand(db, 2, 2, 1, 'ALLERGY', 'iodine', NOW);
		expect(getPmsfh(db, 2, TODAY).allergyStatus.kind).toBe('listed');
	});
});

describe('family and social history (versioned, merged)', () => {
	it('each save is a new version and keys not sent are kept (psych/suicide FIX)', () => {
		saveFamily(db, 2, 1, { psych: 'brother', suicide: 'negative' }, NOW);
		const fh = saveFamily(db, 2, 1, { glaucoma: 'mother', cataract: '' }, NOW)!;
		expect(fh).toEqual({ psych: 'brother', suicide: 'negative', glaucoma: 'mother' });
		expect(getPmsfh(db, 2, TODAY).family).toEqual(fh);
		const n = db.prepare("SELECT COUNT(*) AS n FROM patient_history WHERE patient_id = 2 AND kind = 'family'").get() as { n: number };
		expect(n.n).toBe(2);
		saveFamily(db, 2, 1, { glaucoma: 'mother' }, NOW); // unchanged: no new version
		expect((db.prepare("SELECT COUNT(*) AS n FROM patient_history WHERE patient_id = 2").get() as { n: number }).n).toBe(2);
	});

	it('rejects unknown rows and over-long text', () => {
		expect(errorsOf(() => saveFamily(db, 2, 1, { favourite_colour: 'blue' }))).toHaveProperty('favourite_colour');
		expect(errorsOf(() => saveFamily(db, 2, 1, { glaucoma: 'x'.repeat(201) }))).toHaveProperty('glaucoma');
		expect(errorsOf(() => saveFamily(db, 2, 1, ['glaucoma']))).toHaveProperty('data');
	});

	it('social keeps stored dates, lets occupation be cleared, validates status and dates', () => {
		saveSocial(db, 2, 1, { occupation: 'pilot', tobacco_status: 'quit', tobacco_date: '2020-05-01' }, NOW);
		const sh = saveSocial(db, 2, 1, { occupation: '', alcohol_status: 'never' }, NOW)!;
		expect(sh).toEqual({ tobacco_status: 'quit', tobacco_date: '2020-05-01', alcohol_status: 'never' });
		const e = errorsOf(() => saveSocial(db, 2, 1, { tobacco_status: 'sometimes', coffee_date: '2026-02-30', shoe_size: '9' }))!;
		expect(Object.keys(e).sort()).toEqual(['coffee_date', 'shoe_size', 'tobacco_status']);
	});

	it('another patient\'s history is untouched', () => {
		saveFamily(db, 2, 1, { glaucoma: 'father' }, NOW);
		expect(getPmsfh(db, 1, TODAY).family.glaucoma).toBe('mother');
		expect(saveFamily(db, 99, 1, {}, NOW)).toBeNull();
	});
});

describe('shorthand PMSFH entries (§2.4)', () => {
	it('splits on periods except between digits, trims, and links to the visit', () => {
		const r = addIssuesFromShorthand(db, 2, 2, 1, 'POH', 'glaucoma suspect. dry eye .  ', NOW)!;
		expect(r).toEqual({ type: 'POH', added: ['glaucoma suspect', 'dry eye'], updated: [] });
		const e = addIssuesFromShorthand(db, 2, 2, 1, 'MED', 'timolol 0.5% daily. aspirin 81mg', NOW)!;
		expect(e.added).toEqual(['timolol 0.5% daily', 'aspirin 81mg']);
		const rows = db.prepare("SELECT title, begin_date, encounter_id FROM issues WHERE patient_id = 2 AND type = 'MED' ORDER BY id").all();
		expect(rows).toEqual([
			{ title: 'timolol 0.5% daily', begin_date: TODAY, encounter_id: 2 },
			{ title: 'aspirin 81mg', begin_date: TODAY, encounter_id: 2 }
		]);
		expect(db.prepare("SELECT begin_date FROM issues WHERE patient_id = 2 AND type = 'POH' LIMIT 1").get()).toEqual({ begin_date: '' });
	});

	it('allergies split at the last space; reaction resets per piece; no space = title only', () => {
		addIssuesFromShorthand(db, 2, 2, 1, 'ALLERGY', 'sulfa hives. penicillin. sea food swelling', NOW);
		const rows = db.prepare("SELECT title, reaction FROM issues WHERE patient_id = 2 ORDER BY id").all();
		expect(rows).toEqual([
			{ title: 'sulfa', reaction: 'hives' },
			{ title: 'penicillin', reaction: '' },
			{ title: 'sea food', reaction: 'swelling' }
		]);
	});

	it('an existing title of the same type is updated, not duplicated', () => {
		const r = addIssuesFromShorthand(db, 1, 1, 1, 'ALLERGY', 'SULFA rash', NOW)!;
		expect(r).toEqual({ type: 'ALLERGY', added: [], updated: ['SULFA'] });
		expect(getPmsfh(db, 1, TODAY).allergyStatus).toEqual({ kind: 'listed', allergies: [{ title: 'Sulfa', reaction: 'rash' }] });
		const p = addIssuesFromShorthand(db, 1, 1, 1, 'PMH', 'hypertension', NOW)!;
		expect(p.updated).toEqual(['hypertension']);
		expect(titles(1, 'PMH')).toHaveLength(2);
	});

	it('refuses a visit of another patient', () => {
		expect(addIssuesFromShorthand(db, 2, 1, 1, 'POH', 'x', NOW)).toBeNull();
		expect(titles(2, 'POH')).toEqual([]);
	});
});

describe('quick-pick titles (§7.2)', () => {
	it('falls back to the built-in list with fewer than 4 of the provider\'s own', () => {
		expect(quickPickTitles(db, 1, TODAY).POH).toEqual(BUILTIN_TITLES.POH);
	});

	it('uses the most frequent titles among patients seen in the last 30 days', () => {
		for (const t of ['Asthma', 'Asthma', 'Migraine', 'Gout']) {
			db.prepare("INSERT INTO issues (patient_id, type, title, created_at, updated_at) VALUES (2, 'PMH', ?, 'x', 'x')").run(t);
		}
		const picks = quickPickTitles(db, 1, TODAY).PMH.map((p) => p.title);
		expect(picks[0]).toBe('Asthma');
		expect(picks).toEqual(expect.arrayContaining(['Hypertension', 'Type 2 diabetes', 'Migraine', 'Gout']));
		expect(picks.filter((p) => p === 'Asthma')).toHaveLength(1);
		// Nobody seen in the window: built-in list.
		expect(quickPickTitles(db, 1, '2027-06-01').PMH).toEqual(BUILTIN_TITLES.PMH);
	});
});

describe('migration from the old allergies table', () => {
	it('copies allergies into issues and drops the table', () => {
		const raw = new DatabaseSync(':memory:');
		migrate(raw, 6); // schema before the history migration
		raw.exec("INSERT INTO users (id, display_name) VALUES (1, 'Dr. Old')");
		raw.exec("INSERT INTO patients (id, mrn, legal_first, legal_last, dob) VALUES (5, '5', 'Pat', 'Old', '1950-01-01')");
		raw.exec("INSERT INTO allergies (patient_id, title, reaction) VALUES (5, 'Latex', 'rash'), (5, 'Codeine', NULL)");
		migrate(raw);
		expect(raw.prepare("SELECT type, title, reaction FROM issues ORDER BY id").all()).toEqual([
			{ type: 'ALLERGY', title: 'Latex', reaction: 'rash' },
			{ type: 'ALLERGY', title: 'Codeine', reaction: '' }
		]);
		expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'allergies'").get()).toBeUndefined();
		expect(getPmsfh(raw, 5, TODAY).allergyStatus.kind).toBe('listed');
	});
});
