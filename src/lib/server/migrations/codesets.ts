// Schema for the diagnosis code-set choice (D44) and the US billing switch (D45), appended last to
// db.ts MIGRATIONS.
//
// - practice.diagnosis_code_set: 'icd10cm' (existing installs and the demo) or 'icd11'.
// - practice.us_billing: 1 = the Coding section, coding API and superbill exist (US CPT billing).
// - icd11 / icd11_meta: WHO ICD-11 MMS, loaded from codes/ on first use (src/lib/server/icd11.ts).
//   `bare` is the code without its dot, for prefix search. `parent` is WHO's parent entity URI.
// - imp_items / issues: each coded row keeps the code system it was saved with, and for ICD-11 the
//   WHO URI of every code part (WHO licence: code, title and URI are stored together). Issues also get
//   code_text (WHO titles) because, unlike impression items, they had no place for code titles.
//   Old rows default to ICD-10-CM with no URIs, which is what they are.
export const CODESETS_SQL = `
ALTER TABLE practice ADD COLUMN diagnosis_code_set TEXT NOT NULL DEFAULT 'icd10cm' CHECK (diagnosis_code_set IN ('icd10cm', 'icd11'));
ALTER TABLE practice ADD COLUMN us_billing INTEGER NOT NULL DEFAULT 1 CHECK (us_billing IN (0, 1));
CREATE TABLE icd11 (
	code TEXT PRIMARY KEY,
	bare TEXT NOT NULL,
	uri TEXT NOT NULL,
	title TEXT NOT NULL,
	is_leaf INTEGER NOT NULL,
	is_residual INTEGER NOT NULL,
	chapter TEXT NOT NULL,
	parent TEXT NOT NULL DEFAULT '',
	kind TEXT NOT NULL DEFAULT 'category'
) WITHOUT ROWID;
CREATE INDEX icd11_bare ON icd11(bare);
CREATE INDEX icd11_chapter ON icd11(chapter);
CREATE TABLE icd11_meta (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	source TEXT NOT NULL,
	row_count INTEGER NOT NULL,
	loaded_at TEXT NOT NULL
);
ALTER TABLE imp_items ADD COLUMN code_system TEXT NOT NULL DEFAULT 'icd10cm' CHECK (code_system IN ('icd10cm', 'icd11'));
ALTER TABLE imp_items ADD COLUMN code_uris TEXT NOT NULL DEFAULT '';
ALTER TABLE issues ADD COLUMN code_system TEXT NOT NULL DEFAULT 'icd10cm' CHECK (code_system IN ('icd10cm', 'icd11'));
ALTER TABLE issues ADD COLUMN code_uris TEXT NOT NULL DEFAULT '';
ALTER TABLE issues ADD COLUMN code_text TEXT NOT NULL DEFAULT '';
`;
