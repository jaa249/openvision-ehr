// "New Dx" box parsing (spec §10.4): first line = title, a trailing ICD-10 token on that line = code,
// later lines = plan; under 2 characters is ignored.
import { displayCode } from './codes.ts';

export interface NewDx {
	title: string;
	/** Display code ("H40.013") or ''. When set, the item's code type is ICD10 (§10.4 FIX). */
	code: string;
	plan: string;
}

/**
 * A trailing code token: "ICD10:H40.013", "ICD-10 H40.013", "H40.013" or "H40013".
 * Without the ICD prefix a bare token needs a dot or 4+ characters, so words like "A1c" stay in the title.
 */
const TRAILING = /(?:^|\s)(?:(ICD-?10(?:-CM)?)\s*:?\s*)?([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4}|[0-9A-Z]{1,4})?)\s*$/i;

export function parseNewDx(text: string): NewDx | null {
	const trimmed = text.trim();
	if (trimmed.length < 2) return null;
	const [first, ...rest] = trimmed.split(/\r?\n/);
	let title = first.trim();
	let code = '';
	const m = TRAILING.exec(title);
	if (m) {
		const token = m[2];
		const prefixed = !!m[1];
		const looksLikeCode = prefixed || token.includes('.') || (token.length >= 4 && /^[A-Z][0-9]{2}/i.test(token));
		const d = looksLikeCode ? displayCode(token) : null;
		if (d) {
			code = d;
			title = title.slice(0, m.index).replace(/[\s:,;-]+$/, '').trim();
		}
	}
	const plan = rest.join('\n').trim();
	if (!title && !code) return null;
	return { title, code, plan };
}
