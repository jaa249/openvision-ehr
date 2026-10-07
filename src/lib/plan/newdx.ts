// "New Dx" box parsing (spec §10.4): first line = title, a trailing code token of the practice's code
// set on that line = code, later lines = plan; under 2 characters is ignored.
import { displayCode } from './codes.ts';
import { icd11Normalize, type CodeSetId } from '#lib/codesets/index.ts';

export interface NewDx {
	title: string;
	/** Normalised code ("H40.013", "9C61.0Z&XK9J") or ''. When set, the item gets the set's code type (§10.4 FIX). */
	code: string;
	plan: string;
}

/**
 * A trailing ICD-10-CM token: "ICD10:H40.013", "ICD-10 H40.013", "H40.013" or "H40013".
 * Without the ICD prefix a bare token needs a dot or 4+ characters, so words like "A1c" stay in the title.
 */
const TRAILING = /(?:^|\s)(?:(ICD-?10(?:-CM)?)\s*:?\s*)?([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4}|[0-9A-Z]{1,4})?)\s*$/i;

/**
 * A trailing ICD-11 token: "ICD11:9C61.0Z", "9C61.0Z&XK9J", "9C610Z". The same rule as ICD-10 keeps words
 * in the title: a dot, 4+ characters or the "ICD11:" prefix. Every ICD-11 stem has 4+ characters with a
 * digit third, which ordinary words do not.
 */
const TRAILING_11 = /(?:^|\s)(?:(ICD-?11)\s*:?\s*)?([0-9A-Z][A-Z][0-9][0-9A-Z](?:\.?[0-9A-Z]{1,2})?(?:\s*&\s*X[A-Z][0-9][0-9A-Z]{1,3})*)\s*$/i;

export function parseNewDx(text: string, set: CodeSetId = 'icd10cm'): NewDx | null {
	const trimmed = text.trim();
	if (trimmed.length < 2) return null;
	const [first, ...rest] = trimmed.split(/\r?\n/);
	let title = first.trim();
	let code = '';
	const m = (set === 'icd11' ? TRAILING_11 : TRAILING).exec(title);
	if (m) {
		const token = m[2];
		const prefixed = !!m[1];
		let d: string | null = null;
		if (set === 'icd11') {
			d = prefixed || token.includes('.') || token.length >= 4 ? icd11Normalize(token) : null;
		} else {
			const looksLikeCode = prefixed || token.includes('.') || (token.length >= 4 && /^[A-Z][0-9]{2}/i.test(token));
			d = looksLikeCode ? displayCode(token) : null;
		}
		if (d) {
			code = d;
			title = title.slice(0, m.index).replace(/[\s:,;-]+$/, '').trim();
		}
	}
	const plan = rest.join('\n').trim();
	if (!title && !code) return null;
	return { title, code, plan };
}
