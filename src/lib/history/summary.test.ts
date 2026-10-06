import { describe, expect, it } from 'vitest';
import {
	allergyStatus,
	allergyStatusText,
	chronicTexts,
	splitAllergy,
	splitIssueText,
	summarizeFamily,
	summarizeSocial,
	visibleIssues
} from './summary.ts';
import type { Issue } from './types.ts';

const issue = (over: Partial<Issue>): Issue => ({
	id: 1,
	type: 'PMH',
	title: 'x',
	codes: '',
	begin: '',
	end: '',
	occurrence: '',
	reaction: '',
	outcome: '',
	provider: '',
	comments: '',
	active: true,
	...over
});

describe('allergy status', () => {
	it('listed beats a confirmation; no confirmation is unknown, never NKDA', () => {
		const conf = { by: 'Dr. A', at: '2026-10-06T10:00:00Z' };
		expect(allergyStatus([{ title: 'Latex', reaction: null }], conf).kind).toBe('listed');
		expect(allergyStatus([], conf)).toEqual({ kind: 'none', confirmedBy: 'Dr. A', confirmedAt: conf.at });
		expect(allergyStatus([], null)).toEqual({ kind: 'unknown' });
	});
	it('prints Not recorded / NKDA / the list', () => {
		expect(allergyStatusText({ kind: 'unknown' })).toBe('Not recorded');
		expect(allergyStatusText({ kind: 'none', confirmedBy: 'x', confirmedAt: 'y' })).toBe('NKDA');
		expect(allergyStatusText({ kind: 'listed', allergies: [{ title: 'Sulfa', reaction: 'hives' }, { title: 'Latex', reaction: null }] })).toBe(
			'Sulfa (hives), Latex'
		);
	});
});

describe('chronic texts (§7.4)', () => {
	it('only chronic issues, "title codes" then comments on a new line', () => {
		const texts = chronicTexts([
			issue({ title: 'Hypertension', codes: 'I10', occurrence: 'chronic', comments: ' stable ' }),
			issue({ title: 'Asthma', occurrence: 'chronic' }),
			issue({ title: 'Flu', occurrence: 'first' })
		]);
		expect(texts).toEqual(['Hypertension I10\nstable', 'Asthma']);
	});
});

describe('shorthand splitting (§2.4)', () => {
	it('splits on periods but not between digits', () => {
		expect(splitIssueText('timolol 0.5%. latanoprost .  x.')).toEqual(['timolol 0.5%', 'latanoprost', 'x']);
		expect(splitIssueText('v1.2 trial. 3. 4')).toEqual(['v1.2 trial', '3', '4']);
	});
	it('allergy at the last space', () => {
		expect(splitAllergy('sulfa hives')).toEqual({ title: 'sulfa', reaction: 'hives' });
		expect(splitAllergy('penicillin')).toEqual({ title: 'penicillin', reaction: '' });
	});
});

describe('summaries', () => {
	it('family: positives, negative only when marked, otherwise not recorded', () => {
		expect(summarizeFamily({})).toEqual({ state: 'unrecorded' });
		expect(summarizeFamily({ glaucoma: 'negative', htn: 'Negative' })).toEqual({ state: 'negative' });
		expect(summarizeFamily({ glaucoma: 'mother', amd: 'negative' })).toEqual({ state: 'positive', lines: ['Glaucoma: mother'] });
	});
	it('social: text fields then habits with status and a short note', () => {
		expect(summarizeSocial({})).toEqual([]);
		expect(summarizeSocial({ occupation: 'teacher', tobacco_status: 'quit', alcohol: 'one glass of wine with dinner' })).toEqual([
			'Occupation: teacher',
			'Cigs: Quit',
			'ETOH: one glass of wine wi…'
		]);
	});
	it('inactive medications are hidden, other inactive issues stay', () => {
		const list = [issue({ id: 1, type: 'MED', active: false }), issue({ id: 2, type: 'MED' }), issue({ id: 3, type: 'PMH', active: false })];
		expect(visibleIssues(list, 'MED').map((i) => i.id)).toEqual([2]);
		expect(visibleIssues(list, 'PMH').map((i) => i.id)).toEqual([3]);
	});
});
