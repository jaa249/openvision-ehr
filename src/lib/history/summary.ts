// Pure PMSFH helpers shared by the server, the panel, the banner and the report:
// allergy status, chronic texts for HPI (§7.4), shorthand splitting (§2.4) and summary lines (§1.3).
import { FH_NEGATIVE, FH_ROWS, SOCIAL_HABITS, SOCIAL_STATUSES, SOCIAL_TEXT } from './lists.ts';
import type { AllergyStatus, FamilyHistory, Issue, SocialHistory } from './types.ts';
import { english, type Translate } from '#lib/coding/english.ts';

/**
 * Banner/chart allergy status. Active allergies always win; otherwise a recorded
 * "No known allergies" confirmation; otherwise unknown (never silently NKDA).
 */
export function allergyStatus(
	active: { title: string; reaction: string | null }[],
	confirmation: { by: string; at: string } | null
): AllergyStatus {
	if (active.length) return { kind: 'listed', allergies: active };
	if (confirmation) return { kind: 'none', confirmedBy: confirmation.by, confirmedAt: confirmation.at };
	return { kind: 'unknown' };
}

/**
 * One line for the report header, CSV and screen readers. The labels are in `t`'s language (D48;
 * English by default, as the CSV keeps); recorded allergy titles and reactions stay as entered.
 */
export function allergyStatusText(s: AllergyStatus, t: Translate = english): string {
	if (s.kind === 'unknown') return t('sections.pmNotRecorded');
	if (s.kind === 'none') return t('sections.pmNkda');
	return s.allergies.map((a) => a.title + (a.reaction ? ` (${a.reaction})` : '')).join(', ');
}

/** Issues whose course is chronic, as "title codes" plus "\n" + comments (§7.4). */
export function chronicTexts(issues: Issue[]): string[] {
	return issues
		.filter((i) => i.occurrence === 'chronic')
		.map((i) => `${i.title} ${i.codes}`.trim() + (i.comments.trim() ? `\n${i.comments.trim()}` : ''));
}

/** Shorthand PMSFH text -> pieces: split on periods except between two digits ("timolol 0.5%"), trimmed (§2.4). */
export function splitIssueText(text: string): string[] {
	return text
		.split(/\.(?!\d)|(?<!\d)\./)
		.map((s) => s.trim().replace(/\s+/g, ' '))
		.filter(Boolean);
}

/** Allergy piece: title before the LAST space, reaction after it; no space = title only (§2.4 FIXes). */
export function splitAllergy(piece: string): { title: string; reaction: string } {
	const at = piece.lastIndexOf(' ');
	return at < 0 ? { title: piece, reaction: '' } : { title: piece.slice(0, at).trim(), reaction: piece.slice(at + 1).trim() };
}

/** Summary text of one issue (§1.3): title, then codes; allergies get the reaction in brackets. */
export function issueLine(i: Issue): string {
	if (i.type === 'ALLERGY') return i.title + (i.reaction ? ` (${i.reaction})` : '');
	return i.title + (i.codes ? ` ${i.codes}` : '');
}

/** Issues shown in a summary list: inactive medications are hidden (§1.3). */
export function visibleIssues(issues: Issue[], type: Issue['type']): Issue[] {
	return issues.filter((i) => i.type === type && (i.active || (type !== 'MED' && type !== 'EYEMED')));
}

export type FamilySummary =
	| { state: 'unrecorded' }
	| { state: 'negative' }
	| { state: 'positive'; lines: string[] };

/** FH summary: positives "Label: text" (first 100 characters); "Negative" only when rows were marked so (§7.5). */
export function summarizeFamily(fh: FamilyHistory): FamilySummary {
	const lines: string[] = [];
	let negatives = 0;
	for (const row of FH_ROWS) {
		const v = (fh[row.key] ?? '').trim();
		if (!v) continue;
		if (v.toLowerCase() === FH_NEGATIVE) negatives++;
		else lines.push(`${row.label}: ${v.slice(0, 100)}`);
	}
	if (lines.length) return { state: 'positive', lines };
	return negatives ? { state: 'negative' } : { state: 'unrecorded' };
}

const STATUS_LABEL: Record<string, string> = Object.fromEntries(SOCIAL_STATUSES.map((s) => [s.value, s.label]));

/** Social summary lines (§7.6): marital status and occupation, then each habit with a status or note. Empty = []. */
export function summarizeSocial(sh: SocialHistory): string[] {
	const out: string[] = [];
	for (const f of SOCIAL_TEXT) {
		const v = (sh[f.key] ?? '').trim();
		if (v) out.push(`${f.short}: ${v.slice(0, 40)}`);
	}
	for (const h of SOCIAL_HABITS) {
		const status = STATUS_LABEL[sh[`${h.key}_status`] ?? ''] ?? '';
		const note = (sh[h.key] ?? '').trim();
		if (!status && !note) continue;
		const clipped = note.length > 20 ? `${note.slice(0, 20)}…` : note;
		out.push(`${h.short}: ${[status, clipped].filter(Boolean).join(', ')}`);
	}
	return out;
}
