// Shapes shared by server loaders and client components.

export interface PatientHeader {
	id: number;
	mrn: string;
	name: string;
	legalName: string;
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
