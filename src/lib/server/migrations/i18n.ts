// Translations (D48): the practice's default language, appended to db.ts MIGRATIONS after the
// billing-aid slot. Each user's own choice is the `locale` pref (user_prefs, no schema change).
// The value is checked in code (isLocale); anything unknown reads as English, so adding or retiring
// a language never needs a migration.
export const I18N_SQL = `
ALTER TABLE practice ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'en';
`;
