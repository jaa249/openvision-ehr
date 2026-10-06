// Shared shapes for patient documents (server: src/lib/server/documents.ts; UI: this folder).
// Spec: docs/spec/BEHAVIOR.md §15.4.

/** Exam zones that show documents. OTHER holds categories tied to no zone. */
export const DOC_ZONES = ['EXT', 'ANTSEG', 'RETINA', 'NEURO', 'GLAUCOMA', 'OTHER'] as const;
export type DocZone = (typeof DOC_ZONES)[number];

export const DOC_ZONE_LABEL: Record<DocZone, string> = {
	EXT: 'External',
	ANTSEG: 'Anterior segment',
	RETINA: 'Retina / fundus',
	NEURO: 'Neuro',
	GLAUCOMA: 'Glaucoma',
	OTHER: 'Other'
};

/** File types we accept, decided by the file's first bytes (never by its name). */
export const DOC_MIMES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export type DocMime = (typeof DOC_MIMES)[number];

/** Largest file we store: 15 MB. The Node server must accept bodies this big (BODY_SIZE_LIMIT=20M). */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** What the file picker offers (camera capture on tablets comes from image/*). */
export const DOC_ACCEPT = 'image/png,image/jpeg,application/pdf,image/*';

export interface DocCategory {
	id: string;
	name: string;
	/** Zones that show it; empty = OTHER. */
	zones: DocZone[];
	/** The glaucoma flow sheet lists VF and OCT documents (§8.3). */
	flow: 'VF' | 'OCT' | null;
}

/** One stored document, without its bytes. */
export interface DocMeta {
	id: number;
	patientId: number;
	encounterId: number | null;
	category: string;
	categoryName: string;
	filename: string;
	mime: DocMime;
	size: number;
	sha256: string;
	/** YYYY-MM-DD: when the photo or test was taken. "Latest" sorts by this (§15.4 FIX). */
	takenOn: string;
	notes: string;
	createdAt: string;
	createdBy: string;
}

/** One category row in a zone's documents strip. */
export interface ZoneCategorySummary {
	category: string;
	name: string;
	count: number;
	latest: DocMeta | null;
}

export const isImage = (mime: string) => mime === 'image/png' || mime === 'image/jpeg';

/** "1.2 MB", "340 KB". */
export function formatBytes(n: number): string {
	if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	if (n >= 1024) return `${Math.round(n / 1024)} KB`;
	return `${n} B`;
}

/** URL that serves the file inline (images and PDFs open in the browser). */
export const docUrl = (patientId: number, id: number, download = false) =>
	`/api/patients/${patientId}/documents/${id}${download ? '?download=1' : ''}`;
