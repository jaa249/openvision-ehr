// Coding panel types shared by the server, the API, the panel and the superbill (spec §11).
import type { Family, PatientStatus, VisitLevel } from './codes.ts';

/** A test checked under "Tests performed" (§11.3 with FIXes). */
export interface TestPerformed {
	cpt: string;
	/** Order label at the time it was checked (the provider's list can change later). */
	label: string;
	/** '' = no modifier. Never pre-filled with 59. */
	modifier: string;
	/** Impression item ids this test is for, at most 4 (FIX: the original kept only one). */
	justifiers: number[];
}

/** What the provider chose for this exam. Saved by autosave. */
export interface CodingState {
	family: Family;
	/** The chosen visit code; null = not chosen yet (the panel pre-selects the suggestion). */
	visitCode: string | null;
	/** Visit modifiers 22/24/25/57 that are switched on. */
	modifiers: string[];
	/**
	 * Impression item ids whose visit justifier is switched OFF. Stored as "off" so items added to the
	 * plan later start on, as the spec asks (all on by default).
	 */
	justifiersOff: number[];
	tests: TestPerformed[];
	/** 92060: only counts when the neuro findings support it (§9.4 FIX). */
	include92060: boolean;
	/** Display name of who last saved, and when (ISO). Absent until first save. */
	updatedBy?: string;
	updatedAt?: string;
}

export const EMPTY_CODING_STATE: CodingState = {
	family: 'eye',
	visitCode: null,
	modifiers: [],
	justifiersOff: [],
	tests: [],
	include92060: false
};

/** Diagnosis line of the summary: pointer letter A-L and its diagnosis code (ICD-10-CM or ICD-11, D44). */
export interface DxLine {
	letter: string;
	code: string;
	/** Impression item title it came from. */
	title: string;
}

/** Procedure line of the summary / superbill. */
export interface CptLine {
	code: string;
	description: string;
	modifiers: string[];
	/** Pointer letters into the dx list, at most 4. */
	pointers: string[];
	units: number;
	/** visit | sensorimotor | test */
	kind: 'visit' | 'sensorimotor' | 'test';
}

/** One documented element offered as evidence for a level (§11.1 FIX: show it, let the provider pick). */
export interface Evidence {
	id: string;
	label: string;
	detail: string;
	met: boolean;
	/** Which level this element speaks for. */
	supports: 'comprehensive' | 'any';
}

export interface PatientStatusResult {
	status: PatientStatus;
	reason: string;
	/** Date of the most recent qualifying earlier visit, if any. */
	lastVisit: string | null;
}

export interface VisitSuggestion {
	family: 'eye';
	patient: PatientStatusResult;
	level: VisitLevel;
	code: string;
	/** Plain reasons for the suggested level, shown under the code. */
	reasons: string[];
	evidence: Evidence[];
}

export const VISIT_STATUSES = [
	{ id: 'in_progress', label: 'In progress', help: 'The visit is still being documented.' },
	{ id: 'coding_complete', label: 'Coding complete', help: 'Codes reviewed and coding lines saved.' },
	{ id: 'checked_out', label: 'Checked out', help: 'The patient has left the office.' },
	{ id: 'send_notes', label: 'Send notes', help: 'The report needs to go to another provider.' }
] as const;
export type VisitStatusId = (typeof VISIT_STATUSES)[number]['id'];

export interface StatusChange {
	status: VisitStatusId;
	changedAt: string;
	/** The user's name at the time (FIX: a name, not a 0/1 flag). */
	changedBy: string;
}

export interface SavedLines {
	dx: DxLine[];
	cpt: CptLine[];
	savedAt: string | null;
	savedBy: string | null;
}

/** GET /api/patients/[pid]/encounters/[eid]/coding */
export interface CodingResponse {
	state: CodingState;
	/** Computed on the server from the saved findings and plan; the panel recomputes it live. */
	suggestion: VisitSuggestion;
	patient: PatientStatusResult;
	lines: SavedLines;
	status: VisitStatusId;
	statusHistory: StatusChange[];
	/** Provider or admin; techs can view only. */
	canEdit: boolean;
}

/** The pieces of the Imp/Plan the coding logic needs (works for ImpItem and the report's plan items). */
export interface CodingItem {
	id: number;
	title: string;
	codes: string;
}
