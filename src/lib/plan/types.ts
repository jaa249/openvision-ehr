// Impression/Plan, orders and coding: types shared by the server, the panels and the report.
// Spec: docs/spec/BEHAVIOR.md §10 (Imp/Plan builder, orders), §11 (coding).
import type { CodeSetId } from '#lib/codesets/index.ts';

/** Where an impression item came from (§10.4). */
export type ImpKind = 'free' | 'finding' | 'issue';

export interface ImpItem {
	id: number;
	/** 1-based display order. */
	seq: number;
	kind: ImpKind;
	title: string;
	/** Diagnosis codes of `codeSystem`, ", "-separated ('' = not coded yet). */
	codes: string;
	/** "ICD10:H40.1131 (description)" / "ICD11:9C61.0Z&XK9J (title; title)" text, kept in step with `codes` (§10.4 FIX). */
	codeText: string;
	/** The code set the codes were saved with (D44); an item keeps it when the practice switches. */
	codeSystem: CodeSetId;
	/** ICD-11 only: WHO URI of each code part, ", "-separated per code and "&"-joined within one ('' for ICD-10-CM). */
	codeUris: string;
	plan: string;
	/** Back-link: the finding field ids, ","-separated (kind 'finding'), or "issue:<id>" (kind 'issue'). */
	link: string;
	/** The set's tag whenever `codes` is set (§10.4 FIX: typed codes get a code type, so they can be billed). */
	codeType: 'ICD10' | 'ICD11' | '';
}

/** One order checked for this visit (§10.6), copied from the list when saved. */
export interface VisitOrder {
	/** The list item it came from; null once that item was removed from the list. */
	optionId: number | null;
	label: string;
	/** CPT code when the order is a billable test ('' = not billable). */
	cpt: string;
}

/** A Builder row (§10.2): an engine finding or one of the patient's issues. */
export interface Candidate {
	/** Stable id within one Builder list, e.g. "finding:LENS:NS" or "issue:12". */
	key: string;
	/** Which include checkbox it belongs to: Exam findings, POH/POS, PMH. */
	source: 'finding' | 'poh' | 'pmh';
	kind: ImpKind;
	title: string;
	codes: string;
	codeText: string;
	/** Code descriptions, one per line. */
	description: string;
	/** What the plan starts as when this row is added. */
	plan: string;
	link: string;
	/** Field ids (findings) or issue type (issues). */
	location: string;
}

/** POST .../plan/candidates response. */
export interface CandidateSet {
	findings: Candidate[];
	poh: Candidate[];
	pmh: Candidate[];
}

/** One row of the provider's orders / tests list (§10.6, §11.3). A CPT code makes it billable as a test. */
export interface OrderOption {
	id: number;
	label: string;
	cpt: string;
}

/**
 * GET /api/patients/[pid]/encounters/[eid]/plan — stable shape, read by the Coding panel too:
 * `items` (in order; their codes are the diagnosis justifiers) and `orderOptions` / `orderDetails`
 * (an order with a CPT code is a test that can be billed, §11.3). Fields may be added, never renamed.
 */
export interface PlanData {
	items: ImpItem[];
	/** Labels of the orders checked for this visit (§10.6), in list order. */
	orders: string[];
	/** The same orders with their list item id and CPT code. */
	orderDetails: VisitOrder[];
	/** Free-text plan / RTC (§10.6). */
	orderPlan: string;
	/** The visit provider's orders list to choose from (seeded on first use). */
	orderOptions: OrderOption[];
	/** True when the signed-in user owns that list and may edit it (pencil). */
	canEditOrders: boolean;
	/** Whose list it is, for the hint when someone else's list is shown. */
	orderListOwner: string;
	/** The practice's current diagnosis code set (D44): the code finder and New Dx use it. */
	codeSet: CodeSetId;
	/** US code suggestions (D45): when off there is no Codes section to point to. */
	usBilling: boolean;
}

/** What the printed report needs (§13.2 item 12). */
export interface PlanReport {
	/** codeUris: ICD-11 only, as on ImpItem (the FHIR export keeps code, title and URI together, D47). */
	items: { title: string; codes: string; codeText: string; codeSystem?: CodeSetId; codeUris?: string; plan: string }[];
	orders: string[];
	/** Free-text plan / RTC printed under the orders. */
	orderPlan: string;
}

/** Signature block on the report (§13.2 item 12 FIX: actual signing date, shown even with no items). */
export interface Signature {
	signedBy: string;
	/** ISO timestamp of signing. */
	signedAt: string;
	/** Notes appended after signing, oldest first (the signed content itself never changes). */
	addenda: { by: string; /** ISO timestamp. */ at: string; text: string }[];
}
