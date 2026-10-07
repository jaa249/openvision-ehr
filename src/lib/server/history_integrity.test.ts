// Patient history integrity (0.1.0 review): edits and deletes keep the previous entry (issue_versions,
// soft delete, audit), a signed exam reprints the history it was signed with (history_snapshots, D36),
// and the report never prints "None" for a category nobody recorded (D29).
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { addIssuesFromShorthand, deleteIssue, getPmsfh, historyForEncounter, quickPickTitles, saveFamily, saveIssue } from './history.ts';
import { activeAllergies, addAllergy, getPatientRecord, removeAllergy } from './patients.ts';
import { listIssueVersions } from './issue_versions.ts';
import { listAudit } from './audit.ts';
import { buildFlowsheet } from './flowsheet.ts';
import { examContentHash, getSignedHash, signExam, type SigningUser } from './signing.ts';
import { getPractice, getPrintable } from './report.ts';
import ExamReport from '#lib/components/ExamReport.svelte';

const TODAY = '2026-10-06';
const NOW = new Date('2026-10-06T15:00:00Z');
const LATER = new Date('2026-10-06T16:30:00Z');
const DR: SigningUser = { id: 1, displayName: 'Dr. Example', role: 'provider' };
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
});

const issueId = (pid: number, type: string, title: string) =>
	(db.prepare('SELECT id FROM issues WHERE patient_id = ? AND type = ? AND title = ?').get(pid, type, title) as { id: number }).id;
const raw = (id: number) => db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Record<string, unknown>;
const html = (pid: number, eid: number, generatedOn = 'Oct 6, 2026') =>
	render(ExamReport, { props: { item: getPrintable(db, pid, eid)!, practice: getPractice(db), generatedOn } }).body;

describe('editing a history item keeps the previous entry', () => {
	it('an update writes the old row to issue_versions with who and when, and is audited', () => {
		const id = issueId(1, 'PMH', 'Hypertension');
		const r = saveIssue(db, 1, 2, { id, type: 'PMH', title: 'Hypertension', codes: 'I10', comments: 'Off lisinopril since August' }, { encounterId: 1, now: LATER });
		expect(r).toEqual({ id, created: false });
		const versions = listIssueVersions(db, 1, id);
		expect(versions).toHaveLength(1);
		expect(versions[0]).toMatchObject({ action: 'update', changedBy: 2, changedAt: LATER.toISOString() });
		expect(versions[0].data).toMatchObject({ id, title: 'Hypertension', comments: 'Controlled on lisinopril', begin_date: '2015-01-01', deleted_at: null });
		expect(raw(id).comments).toBe('Off lisinopril since August');
		const a = listAudit(db, { patientId: 1 }).filter((x) => x.action === 'history.update');
		expect(a).toEqual([expect.objectContaining({ userId: 2, encounterId: 1, detail: { issueId: id, type: 'PMH', versionId: versions[0].id } })]);
	});

	it('a save that changes nothing writes no version', () => {
		const id = issueId(1, 'PMH', 'Hypertension');
		const row = raw(id);
		saveIssue(db, 1, 1, {
			id,
			type: 'PMH',
			title: row.title,
			codes: row.codes,
			begin: row.begin_date,
			occurrence: row.occurrence,
			comments: row.comments
		});
		expect(listIssueVersions(db, 1, id)).toEqual([]);
	});

	it('the shorthand making an ended item active again keeps its previous contents', () => {
		const r = saveIssue(db, 2, 1, { type: 'PMH', title: 'Migraine', begin: '2010-01-01', end: '2020-01-01' })!;
		addIssuesFromShorthand(db, 2, 2, 1, 'PMH', 'Migraine', LATER);
		expect(raw(r.id).end_date).toBe('');
		expect(listIssueVersions(db, 2, r.id).map((v) => [v.action, v.data.end_date])).toEqual([['update', '2020-01-01']]);
	});
});

describe('deleting a history item', () => {
	it('hides it from every reader but keeps the row and a version with who and when', () => {
		const tears = issueId(1, 'EYEMED', 'Artificial tears');
		expect(buildFlowsheet(db, 1, null, TODAY)!.meds.current.length).toBe(1);
		expect(deleteIssue(db, 1, tears, 2, { encounterId: 1, now: LATER })).toBe(true);
		expect(deleteIssue(db, 1, tears, 2)).toBe(false); // already deleted

		expect(getPmsfh(db, 1, TODAY).issues.some((i) => i.id === tears)).toBe(false);
		expect(getPrintable(db, 1, 1)!.history!.issues.some((i) => i.id === tears)).toBe(false);
		expect(buildFlowsheet(db, 1, null, TODAY)!.meds.current).toEqual([]);
		expect(raw(tears)).toMatchObject({ title: 'Artificial tears', deleted_at: LATER.toISOString(), deleted_by: 2 });
		expect(listIssueVersions(db, 1, tears)).toEqual([
			expect.objectContaining({ action: 'delete', changedBy: 2, changedAt: LATER.toISOString(), data: expect.objectContaining({ title: 'Artificial tears' }) })
		]);
		expect(listAudit(db, { patientId: 1 }).find((x) => x.action === 'history.delete')).toMatchObject({ userId: 2, encounterId: 1, detail: { issueId: tears } });
	});

	it('a deleted item cannot be edited, and adding its title again starts a new item', () => {
		const id = issueId(1, 'POH', 'Glaucoma suspect');
		deleteIssue(db, 1, id, 1);
		expect(saveIssue(db, 1, 1, { id, type: 'POH', title: 'Glaucoma suspect' })).toBeNull();
		const again = saveIssue(db, 1, 1, { type: 'POH', title: 'Glaucoma suspect' })!;
		expect(again.created).toBe(true);
		expect(again.id).not.toBe(id);
		const shorthand = addIssuesFromShorthand(db, 1, 1, 1, 'PMH', 'Hypertension', NOW)!;
		expect(shorthand.updated).toEqual(['Hypertension']); // a live item is still updated in place
	});

	it('a removed allergy leaves the allergy status, chart list and quick picks, and is kept as a version', () => {
		const sulfa = issueId(1, 'ALLERGY', 'Sulfa');
		expect(removeAllergy(db, 1, sulfa, 1, LATER)).toBe(true);
		expect(activeAllergies(db, 1)).toEqual([]);
		expect(getPatientRecord(db, 1)!.allergyStatus).toEqual({ kind: 'unknown' });
		expect(addAllergy(db, 1, { title: 'sulfa' }, 1)).not.toBe(sulfa); // not deduplicated against the deleted row
		expect(listIssueVersions(db, 1, sulfa).map((v) => v.action)).toEqual(['delete']);

		// Quick picks count live items only: four patients' deleted titles never reach the list.
		for (let n = 0; n < 4; n++) {
			const r = saveIssue(db, 2, 1, { type: 'SURG', title: `Deleted surgery ${n}` })!;
			deleteIssue(db, 2, r.id, 1);
		}
		expect(quickPickTitles(db, 1, TODAY).SURG.some((t) => t.title.startsWith('Deleted surgery'))).toBe(false);
	});

	it('the database refuses a hard delete, a change to a deleted item, and any change to a version', () => {
		const id = issueId(1, 'MED', 'Lisinopril');
		expect(() => db.prepare('DELETE FROM issues WHERE id = ?').run(id)).toThrow(/never deleted/);
		saveIssue(db, 1, 1, { id, type: 'MED', title: 'Lisinopril', begin: '2015-01-01', comments: '20 mg daily' });
		deleteIssue(db, 1, id, 1);
		expect(() => db.prepare("UPDATE issues SET deleted_at = NULL WHERE id = ?").run(id)).toThrow(/cannot be changed/);
		expect(() => db.prepare("UPDATE issue_versions SET data = '{}'").run()).toThrow(/append-only/);
		expect(() => db.prepare('DELETE FROM issue_versions').run()).toThrow(/append-only/);
		expect(listIssueVersions(db, 1, id).map((v) => v.action)).toEqual(['update', 'delete']);
	});
});

describe('a signed exam reprints the history it was signed with (D36)', () => {
	it('sign, then change history: the report shows the snapshot, labelled with the signing date', () => {
		signExam(db, 1, 1, DR, null, NOW);
		const hash = getSignedHash(db, 1);
		// After signing, the patient's history keeps changing (allowed: it is patient-level).
		deleteIssue(db, 1, issueId(1, 'ALLERGY', 'Sulfa'), 1, { now: LATER });
		saveIssue(db, 1, 1, { type: 'PMH', title: 'Asthma' }, { now: LATER });
		saveFamily(db, 1, 1, { glaucoma: 'sister' }, LATER);

		const item = getPrintable(db, 1, 1)!;
		expect(item.historySource).toEqual({ kind: 'signed', at: NOW.toISOString() });
		expect(item.history!.issues.map((i) => i.title)).toContain('Sulfa');
		expect(item.history!.issues.map((i) => i.title)).not.toContain('Asthma');
		expect(item.history!.family.glaucoma).toBe('mother');
		expect(item.history!.allergyStatus).toEqual({ kind: 'listed', allergies: [{ title: 'Sulfa', reaction: 'hives' }] });
		expect(historyForEncounter(db, 1)!.source.kind).toBe('signed');

		const out = html(1, 1);
		expect(out).toContain('Past history (as recorded at signing,');
		expect(out).not.toContain('Asthma');
		expect(out).toMatch(/Allergies:<\/strong> Sulfa/); // the allergy line agrees with the signed history

		// The signature hash does not cover history: the stored hash still verifies.
		expect(examContentHash(db, 1)).toBe(hash);
	});

	it('an unsigned exam shows the current history, labelled as current', () => {
		saveIssue(db, 1, 1, { type: 'PMH', title: 'Asthma' });
		expect(getPrintable(db, 1, 1)!.historySource).toEqual({ kind: 'current' });
		const out = html(1, 1);
		expect(out).toContain('Past history (current)');
		expect(out).toContain('Asthma');
	});

	it('an exam signed before snapshots existed prints current history, marked as not part of the signed record', () => {
		db.prepare("INSERT INTO exam_signatures (encounter_id, signed_by, signed_at, content_hash) VALUES (4, 1, '2025-09-14T16:00:00.000Z', 'x')").run();
		const item = getPrintable(db, 1, 4)!;
		expect(item.historySource).toEqual({ kind: 'legacy' });
		expect(html(1, 4, 'Oct 7, 2026')).toContain('Current history (printed Oct 7, 2026), not part of the signed record');
		expect(historyForEncounter(db, 999)).toBeNull();
	});

	it('the snapshot table is append-only', () => {
		signExam(db, 1, 1, DR, null, NOW);
		expect(() => db.prepare("UPDATE history_snapshots SET data = '{}'").run()).toThrow(/cannot be changed/);
		expect(() => db.prepare('DELETE FROM history_snapshots').run()).toThrow(/cannot be removed/);
	});
});

describe('report: empty history categories (D29)', () => {
	it('print "Not recorded", never "None", when only part of the history was taken', () => {
		saveFamily(db, 2, 1, { glaucoma: 'mother' }, NOW);
		const text = html(2, 2).replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '|').replace(/\s*\|[\s|]*/g, '|');
		for (const h of ['POH', 'Eye surgery', 'PMH', 'Medication', 'Surgery', 'Allergy']) expect(text).toContain(`|${h}|Not recorded|`);
		expect(text).toContain('|FH|Glaucoma: mother|');
		expect(text).not.toContain('|None|');
	});
});
