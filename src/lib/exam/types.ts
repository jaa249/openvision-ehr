// Shapes shared by server loaders and client components.
import type { PlanReport, Signature } from '#lib/plan/types.ts';
import type { ChosenCodes } from '#lib/coding/types.ts';
import type { AllergyStatus, Pmsfh } from '#lib/history/types.ts';

export interface PatientHeader {
	id: number;
	mrn: string;
	name: string;
	legalName: string;
	legalFirst: string;
	legalLast: string;
	preferredName: string | null;
	dob: string;
	age: number;
	photoUrl: string | null;
	/** Not recorded / NKDA (confirmed) / listed; an empty list is never shown as NKDA. */
	allergyStatus: AllergyStatus;
}

export interface EncounterInfo {
	id: number;
	date: string;
	visitType: string;
	/** The provider who authorizes the visit and signs it (D43). */
	provider: string;
	providerId: number;
	/** The technician who worked the visit up; null when none did. */
	technician: string | null;
	technicianId: number | null;
}

import type { Findings } from '#lib/shorthand/parse.ts';

export interface PriorVisit extends EncounterInfo {
	findings: Findings;
}

export interface Practice {
	name: string;
	address: string;
	phone: string;
	fax: string;
}

export interface PrintableEncounter {
	patient: PatientHeader;
	encounter: EncounterInfo;
	findings: Findings;
	/** Zones with a saved drawing for this visit (spec §13.4), e.g. ['EXT', 'RETINA']. */
	drawingZones?: string[];
	/** Patient history at print time (spec §13.2 item 2); absent = not loaded. */
	history?: Pmsfh;
	/** Impression/Plan and orders (§13.2 item 12); null = nothing recorded. */
	plan?: PlanReport | null;
	/** null = not signed. */
	signature?: Signature | null;
	/** Codes the provider chose, printed as "Codes for your billing system" (D46); null/absent = none chosen or suggestions off. */
	codes?: ChosenCodes | null;
}
