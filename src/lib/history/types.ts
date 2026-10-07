// Patient-level history (PMSFH): issues, allergy status, family and social history.
// Shared by the server (src/lib/server/history.ts), PmsfhPanel, the banner and the report.
// Spec: docs/spec/BEHAVIOR.md §1.3 (summary), §2.4 (shorthand issues), §7.2 (editor), §7.5-7.7.
import type { CodeSetId } from '#lib/codesets/index.ts';

/** Issue list types, in the editor's order (§7.2). */
export type IssueType = 'POH' | 'POS' | 'EYEMED' | 'PMH' | 'MED' | 'SURG' | 'ALLERGY';

export const ISSUE_TYPES: readonly IssueType[] = ['POH', 'POS', 'EYEMED', 'PMH', 'MED', 'SURG', 'ALLERGY'];

export interface Issue {
	id: number;
	type: IssueType;
	title: string;
	/** Diagnosis codes, ";"-separated (e.g. ICD-10). */
	codes: string;
	/** The code set the codes were saved with (D44); absent = ICD-10-CM. */
	codeSystem?: CodeSetId;
	/** YYYY-MM-DD or ''. */
	begin: string;
	end: string;
	/** PMH course: 'chronic' issues feed the HPI chronic boxes (§7.4). */
	occurrence: string;
	/** Allergy reaction. */
	reaction: string;
	/** Surgery outcome. */
	outcome: string;
	/** Collaborator (POH) or surgeon (POS/SURG). */
	provider: string;
	comments: string;
	active: boolean;
}

/** What the editor sends to save an issue (id present = edit that issue). */
export interface IssueInput {
	id?: number | null;
	type: IssueType;
	title: string;
	codes?: string;
	begin?: string;
	end?: string;
	occurrence?: string;
	reaction?: string;
	outcome?: string;
	provider?: string;
	comments?: string;
}

/**
 * Allergy status shown in the banner (decided 2026-10-06, replaces "empty list = No known allergies"):
 * - unknown: nobody has recorded allergies (amber "Allergies not recorded")
 * - none: someone ticked "No known allergies" (who and when kept)
 * - listed: one or more active allergies
 */
export type AllergyStatus =
	| { kind: 'unknown' }
	| { kind: 'none'; confirmedBy: string; confirmedAt: string }
	| { kind: 'listed'; allergies: { title: string; reaction: string | null }[] };

/** Family history (§7.5): row key -> text ('' = not answered, FH_NEGATIVE = marked negative). */
export type FamilyHistory = Record<string, string>;
/** Social history (§7.6): field key -> value. */
export type SocialHistory = Record<string, string>;

export interface Pmsfh {
	issues: Issue[];
	allergyStatus: AllergyStatus;
	family: FamilyHistory;
	social: SocialHistory;
}

/**
 * Which patient history a visit's report shows (D36): 'signed' = the snapshot taken when the exam was
 * signed (`at` = when); 'current' = the live history of an unsigned exam; 'legacy' = an exam signed before
 * snapshots existed, so only the live history can be shown, and it is not part of the signed record.
 */
export type HistorySource = { kind: 'signed'; at: string } | { kind: 'current' } | { kind: 'legacy' };

/** A quick-pick title chip in the editor (§7.2): picking it copies the title and its code. */
export interface TitlePick {
	title: string;
	codes: string;
}

/** GET /history response: the history plus quick-pick titles per type. */
export interface PmsfhResponse extends Pmsfh {
	quickPicks: Record<IssueType, TitlePick[]>;
}

/** What a shorthand PMSFH entry did (§2.4), for the toast. */
export interface ShorthandIssueResult {
	type: IssueType;
	added: string[];
	updated: string[];
}
