// Schema for the documents feature, appended to db.ts MIGRATIONS in a fixed slot.
// Pre-release (decision D16): edit freely until v0.1; delete data/ to rebuild.
//
// Spec: docs/spec/BEHAVIOR.md §15.4 (per-zone documents, "latest" by date), §8.3 (flow sheet VF/OCT),
// §17 S9 (exact keyed lookups, never a wildcard name) and S17 (validated content, size limit).
// Bytes live in the database next to the chart, like drawings, so a backup is one file.
//
// - document_categories: our own eye categories. `flow` marks the two the glaucoma flow sheet lists.
// - document_category_zones: which exam zones show a category (one category can sit in two zones,
//   e.g. visual fields under Neuro and Glaucoma). A category with no zone row belongs to OTHER.
// - documents: one row per file. encounter_id is NULL for patient-level papers (insurance card,
//   outside records). taken_on is the clinical date (when the photo or test was done), which is what
//   "latest" sorts by. Soft delete keeps who and when; deleted rows are never served.
export const DOCUMENTS_SQL = `
CREATE TABLE document_categories (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	seq INTEGER NOT NULL,
	flow TEXT CHECK (flow IN ('VF', 'OCT'))
);
CREATE TABLE document_category_zones (
	category_id TEXT NOT NULL REFERENCES document_categories(id),
	zone TEXT NOT NULL CHECK (zone IN ('EXT', 'ANTSEG', 'RETINA', 'NEURO', 'GLAUCOMA')),
	PRIMARY KEY (category_id, zone)
);
INSERT INTO document_categories (id, name, seq, flow) VALUES
	('EXT_PHOTO', 'External photos', 10, NULL),
	('ANTSEG_PHOTO', 'Anterior segment photos', 20, NULL),
	('TOPOGRAPHY', 'Corneal topography', 21, NULL),
	('SPECULAR', 'Specular microscopy', 22, NULL),
	('FUNDUS_PHOTO', 'Fundus photos', 30, NULL),
	('OCT_MACULA', 'OCT macula', 31, NULL),
	('ANGIOGRAPHY', 'FA / ICG angiography', 32, NULL),
	('OCT_NERVE', 'OCT optic nerve / RNFL', 40, 'OCT'),
	('VISUAL_FIELD', 'Visual fields', 41, 'VF'),
	('OUTSIDE_RECORDS', 'Outside records', 90, NULL),
	('REFERRAL', 'Referral letters', 91, NULL),
	('INSURANCE_CARD', 'Insurance cards', 92, NULL),
	('OTHER', 'Other documents', 99, NULL);
INSERT INTO document_category_zones (category_id, zone) VALUES
	('EXT_PHOTO', 'EXT'),
	('ANTSEG_PHOTO', 'ANTSEG'),
	('TOPOGRAPHY', 'ANTSEG'),
	('SPECULAR', 'ANTSEG'),
	('FUNDUS_PHOTO', 'RETINA'),
	('OCT_MACULA', 'RETINA'),
	('ANGIOGRAPHY', 'RETINA'),
	('OCT_NERVE', 'RETINA'),
	('OCT_NERVE', 'GLAUCOMA'),
	('VISUAL_FIELD', 'NEURO'),
	('VISUAL_FIELD', 'GLAUCOMA');
CREATE TABLE documents (
	id INTEGER PRIMARY KEY,
	patient_id INTEGER NOT NULL REFERENCES patients(id),
	encounter_id INTEGER REFERENCES encounters(id),
	category TEXT NOT NULL REFERENCES document_categories(id),
	filename TEXT NOT NULL,
	mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'application/pdf')),
	size INTEGER NOT NULL,
	sha256 TEXT NOT NULL,
	data BLOB NOT NULL,
	taken_on TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	created_by INTEGER NOT NULL REFERENCES users(id),
	updated_at TEXT,
	updated_by INTEGER REFERENCES users(id),
	deleted_at TEXT,
	deleted_by INTEGER REFERENCES users(id)
);
CREATE INDEX documents_patient ON documents(patient_id, category, taken_on);
CREATE INDEX documents_encounter ON documents(encounter_id);
`;
