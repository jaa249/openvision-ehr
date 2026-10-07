// Test fixture: a few rows of WHO ICD-11 MMS 2026-01, read at test time from the shipped, unchanged WHO file
// (codes/icd11_mms_2026-01_en.txt.gz) so no excerpt of it is kept in the repo (CC BY-ND 3.0 IGO).
// International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019
// https://icd.who.int. Used by the loader, plan and engine tests so they do not need all 37k rows.
// Test-only: imports node:fs, never import it from app code.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

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

function fixtureText(): string {
	const file = new URL('../../../codes/icd11_mms_2026-01_en.txt.gz', import.meta.url);
	const [header, ...rows] = gunzipSync(readFileSync(file)).toString('utf8').split(/\r?\n/);
	const wanted = new Set(ICD11_FIXTURE_CODES);
	// Rows are taken whole and unchanged; the third column is the code. (These codes' titles have no tabs
	// or line breaks, so a line is a row.)
	const picked = rows.filter((r) => wanted.has(r.split('\t')[2]));
	if (picked.length !== wanted.size) throw new Error(`ICD-11 fixture: found ${picked.length} of ${wanted.size} codes`);
	return [header.replace(/^﻿/, ''), ...picked].join('\n') + '\n';
}

export const ICD11_FIXTURE = fixtureText();
