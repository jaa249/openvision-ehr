// Test fixture: a few rows of WHO ICD-11 MMS 2026-01, read at test time from the downloaded, unchanged WHO
// file (D49: `npm run codes:fetch` puts it in codes/, git-ignored) so no excerpt of it is kept in the repo
// (CC BY-ND 3.0 IGO). Without the file, ICD11_FIXTURE is empty and HAVE_ICD11_FILE false: tests that need
// it skip (`describe.skipIf(!HAVE_ICD11_FILE)`) instead of failing.
// International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019
// https://icd.who.int. Used by the loader, plan and engine tests so they do not need all 37k rows.
// Test-only: imports node:fs, never import it from app code.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { findCodeFile } from '#lib/server/codepaths.ts';
import { ICD11_LANGUAGES, RELEASES } from './releases.ts';

/** The codes the tests rely on (eyelid, glaucoma, cataract, retina, diabetes, laterality and so on). */
export const ICD11_FIXTURE_CODES: readonly string[] = [
	'1A00', '5A11', '9A03', '9A03.2', '9A03.20', '9A03.21', '9A03.22', '9A03.23',
	'9A03.24', '9A03.2Y', '9A03.2Z', '9A60', '9A60.0', '9A60.00', '9A60.01', '9A60.02',
	'9A60.0Y', '9A60.0Z', '9A60.Z', '9A61', '9A61.0', '9A61.5', '9B10', '9B10.0',
	'9B10.00', '9B10.01', '9B10.02', '9B10.0Y', '9B10.0Z', '9B10.1', '9B10.10', '9B10.1Y',
	'9B10.1Z', '9B10.2', '9B10.20', '9B10.21', '9B10.22', '9B10.23', '9B10.2Y', '9B10.Z',
	'9B71', '9B71.0', '9B71.00', '9B71.01', '9B71.0Z', '9C40.A', '9C40.A0', '9C40.A1',
	'9C40.AY', '9C40.AZ', '9C61', '9C61.0', '9C61.00', '9C61.01', '9C61.02', '9C61.0Y',
	'9C61.0Z', 'XK9J', 'XK8G', 'XK9K'
];

/** Path of the downloaded WHO file, or null (the tests that need it then skip). */
export const ICD11_FILE_PATH = findCodeFile(RELEASES.icd11.file);
export const HAVE_ICD11_FILE = ICD11_FILE_PATH !== null;
export const HAVE_ICD10_FILE = findCodeFile(RELEASES.icd10cm.file) !== null;
/** A test name that says why it was skipped: describe.skipIf(!HAVE_ICD11_FILE)(needsCodes('...', HAVE_ICD11_FILE), ...). */
export const needsCodes = (name: string, have: boolean) => (have ? name : `${name} (skipped: no code file, run npm run codes:fetch)`);

function fixtureText(file: string): string {
	const [header, ...rows] = gunzipSync(readFileSync(file)).toString('utf8').split(/\r?\n/);
	const wanted = new Set(ICD11_FIXTURE_CODES);
	// Rows are taken whole and unchanged; the third column is the code. (These codes' titles have no tabs
	// or line breaks, so a line is a row.)
	const picked = rows.filter((r) => wanted.has(r.split('\t')[2]));
	if (picked.length !== wanted.size) throw new Error(`ICD-11 fixture: found ${picked.length} of ${wanted.size} codes`);
	return [header.replace(/^﻿/, ''), ...picked].join('\n') + '\n';
}

export const ICD11_FIXTURE = ICD11_FILE_PATH ? fixtureText(ICD11_FILE_PATH) : '';

// ---------- WHO ICD-11 titles in other languages (D50) ----------
// The same codes, read at test time from WHO's downloaded language files (`node scripts/fetch-codes.mjs icd11
// --lang es,zh,ar`), unchanged. Without a file the tests for that language skip.

/** Path of WHO's downloaded file for a language, or null. */
export const icd11LanguageFilePath = (lang: string): string | null => {
	const rel = ICD11_LANGUAGES.find((l) => l.lang === lang);
	return rel ? findCodeFile(rel.file) : null;
};
export const haveIcd11Language = (lang: string) => icd11LanguageFilePath(lang) !== null;

/** WHO's rows for the fixture codes in that language (whole and unchanged), or '' without the file. */
export function icd11LanguageFixture(lang: string): string {
	const path = icd11LanguageFilePath(lang);
	return path ? fixtureText(path) : '';
}
