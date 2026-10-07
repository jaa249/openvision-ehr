// ICD-11 titles in other languages (D50), appended to db.ts MIGRATIONS after the i18n slot.
//
// - icd11_titles: WHO's title of each code in one language, from WHO's SimpleTabulation file for that
//   language (unchanged; D44: never translated by us). English stays in the icd11 table. `uri` is WHO's
//   linearization URI from the same file (the same as English: checked for every 2026-01 file), so code,
//   title and URI are stored together. `search` is the title folded for matching only (lower case, accents,
//   Arabic diacritics and tatweel removed; src/lib/server/icd11_titles.ts); it is never shown.
//   Codes WHO left untranslated have no row (English is shown).
// - icd11_titles_meta: one row per loaded language (release, source file, SHA-256, rows, when).
// - imp_items / issues.title_lang: the language of the WHO titles in code_text ('' = saved before D50, English).
export const ICD11_TITLES_SQL = `
CREATE TABLE icd11_titles (
	lang TEXT NOT NULL,
	code TEXT NOT NULL,
	uri TEXT NOT NULL,
	title TEXT NOT NULL,
	search TEXT NOT NULL,
	PRIMARY KEY (lang, code)
) WITHOUT ROWID;
CREATE TABLE icd11_titles_meta (
	lang TEXT PRIMARY KEY,
	release TEXT NOT NULL,
	source TEXT NOT NULL,
	sha256 TEXT NOT NULL,
	row_count INTEGER NOT NULL,
	loaded_at TEXT NOT NULL
);
ALTER TABLE imp_items ADD COLUMN title_lang TEXT NOT NULL DEFAULT '';
ALTER TABLE issues ADD COLUMN title_lang TEXT NOT NULL DEFAULT '';
`;
