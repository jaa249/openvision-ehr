// Shorthand parser: turns "rc:1+ inj; lk:tr spk.a; das" into operations.
// Grammar and resolution order: docs/spec/BEHAVIOR.md §2.2–2.5.
// Pure functions only, so the same code runs in the browser and in tests.

import { FIELD_BY_ID, FIELDS, SEED_DEFAULTS, type SectionId } from '#lib/exam/catalog.ts';
import { ALIASES, COMMANDS, SPECIAL } from './codes.ts';
import { expandVocab } from './vocab.ts';
import type { IssueType } from '#lib/history/types.ts';

export type Op =
	| { kind: 'set'; fields: string[]; text: string; append: boolean; source: string }
	| { kind: 'setEach'; values: Record<string, string>; source: string }
	| { kind: 'defaults'; sections: SectionId[] | 'all'; source: string }
	| { kind: 'clear'; sections: SectionId[] | 'all'; source: string }
	/** PMSFH entry (§2.4): creates patient issues through the history API; never touches findings. */
	| { kind: 'issue'; type: IssueType; text: string; source: string };

/** Shorthand codes that create patient issues (§2.4), with the extra spellings the original accepted. */
export const ISSUE_CODES: Record<string, IssueType> = {
	POH: 'POH',
	PMH: 'PMH',
	POS: 'POS',
	SURG: 'SURG',
	SURGERY: 'SURG',
	PSURG: 'SURG',
	PSURGH: 'SURG',
	MEDS: 'MED',
	MEDICATION: 'MED',
	MEDICATIONS: 'MED',
	ALL: 'ALLERGY',
	ALLERGY: 'ALLERGY'
};
const ISSUE_EXAMPLE: Record<IssueType, string> = {
	POH: 'glaucoma suspect',
	PMH: 'hypertension',
	POS: 'cataract extraction OD',
	EYEMED: 'artificial tears',
	MED: 'lisinopril',
	SURG: 'appendectomy',
	ALLERGY: 'sulfa hives'
};

export interface ParseError {
	entry: string;
	code: string;
	message: string;
	suggestions: string[];
}

export interface ParseResult {
	ops: Op[];
	errors: ParseError[];
}

const ALL_CODES = [...Object.keys(ISSUE_CODES), ...Object.keys(COMMANDS), ...Object.keys(ALIASES), ...SPECIAL, ...FIELDS.map((f) => f.id)];

function resolve(code: string): string[] | null {
	if (FIELD_BY_ID.has(code)) return [code];
	return ALIASES[code] ?? null;
}

export function parseShorthand(input: string): ParseResult {
	const ops: Op[] = [];
	const errors: ParseError[] = [];
	let previous: string[] | null = null;
	/** A code-less entry right after a PMSFH entry adds to the same list ("poh:dry eye; blepharitis"). */
	let previousIssue: IssueType | null = null;

	// FIX: a newline is a space, never a silent cut-off (§2.2).
	const entries = input.replace(/\r?\n/g, ' ').split(';');

	for (const raw of entries) {
		const entry = raw.replace(/^[\W_]+/, '').replace(/^\s+/, '');
		if (!entry.trim()) continue;

		const command = COMMANDS[entry.trim().toUpperCase()];
		if (command) {
			ops.push({ ...command, source: entry.trim() });
			previous = null;
			previousIssue = null;
			continue;
		}

		// PMSFH codes (§2.4), "poh:text" or "poh text". ".a" has no meaning here (they always add), so a trailing one is dropped.
		const issue = entry.match(/^([A-Za-z]+)\s*:(.*)$/s) ?? entry.match(/^([A-Za-z]+)\s+(.*)$/s);
		const issueType = issue ? ISSUE_CODES[issue[1].toUpperCase()] : ISSUE_CODES[entry.trim().toUpperCase()];
		if (!issue && issueType) {
			const c = entry.trim().toUpperCase();
			errors.push({ entry: entry.trim(), code: c, message: `${c} needs text, e.g. ${c}:${ISSUE_EXAMPLE[issueType]}`, suggestions: [] });
			previous = null;
			previousIssue = null;
			continue;
		}
		if (issue && issueType) {
			const text = issue[2].trim().replace(/\.a$/, '').trim();
			if (text) ops.push({ kind: 'issue', type: issueType, text, source: entry.trim() });
			else {
				const c = issue[1].toUpperCase();
				errors.push({ entry: entry.trim(), code: c, message: `${c} needs text, e.g. ${c}:${ISSUE_EXAMPLE[issueType]}`, suggestions: [] });
			}
			previous = null;
			previousIssue = issueType;
			continue;
		}
		const lead = entry.match(/^([A-Za-z0-9_]+)(\s*:|\s)/);
		const startsWithCode = !!lead && (lead[2].includes(':') || !!resolve(lead[1].toUpperCase()) || SPECIAL.has(lead[1].toUpperCase()));
		if (previousIssue && !startsWithCode) {
			const text = entry.trim().replace(/\.a$/, '').trim();
			if (text) ops.push({ kind: 'issue', type: previousIssue, text, source: entry.trim() });
			continue;
		}
		previousIssue = null;

		let code = '';
		let text = '';
		const withColon = entry.match(/^([A-Za-z0-9_]+)\s*:(.*)$/s);
		const withSpace = entry.match(/^([A-Za-z0-9_]+)\s+(.*)$/s);
		if (withColon) {
			code = withColon[1].toUpperCase();
			text = withColon[2];
		} else if (withSpace && (resolve(withSpace[1].toUpperCase()) || SPECIAL.has(withSpace[1].toUpperCase()))) {
			code = withSpace[1].toUpperCase();
			text = withSpace[2];
		}

		let append = false;
		text = text.trimEnd();
		if (text.endsWith('.a')) {
			append = true;
			text = text.slice(0, -2);
		}

		if (!code && resolve(entry.trim().toUpperCase())) {
			const c = entry.trim().toUpperCase();
			errors.push({ entry: entry.trim(), code: c, message: `${c} needs a value, e.g. ${c}:quiet`, suggestions: [] });
			previous = null;
			continue;
		}

		if (!code) {
			// Text with no code continues the previous field of this batch (§2.5 FIX).
			if (previous) {
				let t = entry.trim();
				if (t.endsWith('.a')) t = t.slice(0, -2);
				ops.push({ kind: 'set', fields: previous, text: finish(previous, t), append: true, source: entry.trim() });
				continue;
			}
			const first = (entry.match(/^[A-Za-z0-9_]+/)?.[0] ?? entry).toUpperCase();
			errors.push(unknown(entry.trim(), first));
			continue;
		}

		if (code === 'HERT') {
			// Hertel: OD-base-OS, e.g. HERT:15-100-16 (§2.3; FIX: bad input gets a message, not a crash).
			const m = text.trim().match(/^(\d{1,2}(?:\.\d)?)\s*-\s*(\d{2,3})\s*-\s*(\d{1,2}(?:\.\d)?)$/);
			if (!m) {
				errors.push({ entry: entry.trim(), code, message: 'HERT needs OD-base-OS, e.g. HERT:15-100-16', suggestions: [] });
			} else {
				ops.push({ kind: 'setEach', values: { ODHERTEL: m[1], HERTELBASE: m[2], OSHERTEL: m[3] }, source: entry.trim() });
			}
			previous = null;
			continue;
		}

		const fields = resolve(code);
		if (!fields) {
			errors.push(unknown(entry.trim(), code));
			previous = null;
			continue;
		}

		ops.push({ kind: 'set', fields, text: finish(fields, text.trim()), append, source: entry.trim() });
		previous = fields;
	}

	return { ops, errors };
}

function finish(fields: string[], text: string): string {
	const expand = fields.some((f) => FIELD_BY_ID.get(f)?.expand);
	const clipped = text.slice(0, Math.min(...fields.map((f) => FIELD_BY_ID.get(f)?.maxLength ?? 2000)));
	return expand ? expandVocab(clipped) : clipped;
}

function unknown(entry: string, code: string): ParseError {
	const suggestions = suggest(code);
	return {
		entry,
		code,
		message: suggestions.length
			? `Unknown code ${code}. Did you mean ${suggestions.join(', ')}?`
			: `Unknown code ${code}.`,
		suggestions
	};
}

export function suggest(code: string, limit = 3): string[] {
	return ALL_CODES.map((c) => ({ c, d: distance(code, c) }))
		.filter(({ c, d }) => d <= Math.max(1, Math.floor(code.length / 3)) || (code.length >= 2 && c.startsWith(code)))
		.sort((a, b) => a.d - b.d || a.c.length - b.c.length)
		.slice(0, limit)
		.map(({ c }) => c);
}

function distance(a: string, b: string): number {
	const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = dp[0];
		dp[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = dp[j];
			dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = tmp;
		}
	}
	return dp[b.length];
}

// ---------- applying operations ----------

export interface Finding {
	value: string;
	isDefault: boolean;
}
export type Findings = Record<string, Finding>;

function sectionFields(sections: SectionId[] | 'all'): string[] {
	return FIELDS.filter((f) => sections === 'all' || sections.includes(f.section)).map((f) => f.id);
}

/**
 * Apply operations to a copy of the findings. Returns the new findings and the ids that changed.
 * `defaults` maps field id -> the provider's normal value.
 */
export function applyOps(
	findings: Findings,
	ops: Op[],
	defaults: Record<string, string> = SEED_DEFAULTS
): { findings: Findings; changed: string[] } {
	const next: Findings = { ...findings };
	const changed = new Set<string>();
	const put = (id: string, value: string, isDefault: boolean) => {
		const cur = next[id] ?? { value: '', isDefault: false };
		if (cur.value === value && cur.isDefault === isDefault) return;
		next[id] = { value, isDefault };
		changed.add(id);
	};

	for (const op of ops) {
		if (op.kind === 'set') {
			for (const id of op.fields) {
				const cur = next[id]?.value ?? '';
				const value = op.append && cur ? `${cur}, ${op.text}` : op.text;
				put(id, value, false);
			}
		} else if (op.kind === 'setEach') {
			for (const [id, value] of Object.entries(op.values)) put(id, value, false);
		} else if (op.kind === 'issue') {
			// Patient history, not exam findings: the exam page sends these to the history API.
			continue;
		} else if (op.kind === 'defaults') {
			// Defaults always replace (parity, §3.2).
			for (const id of sectionFields(op.sections)) if (id in defaults) put(id, defaults[id], true);
		} else {
			for (const id of sectionFields(op.sections)) put(id, '', false);
		}
	}
	return { findings: next, changed: [...changed] };
}
