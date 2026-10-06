// Shapes shared by server loaders and client components.

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
	allergies: { title: string; reaction: string | null }[];
}

export interface EncounterInfo {
	id: number;
	date: string;
	visitType: string;
	provider: string;
	providerId: number;
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
}
