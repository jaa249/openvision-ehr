// Shorthand parser: turns "rc:1+ inj; lk:tr spk.a; das" into operations.
// Grammar and resolution order: docs/spec/BEHAVIOR.md §2.2–2.5.
// Pure functions only, so the same code runs in the browser and in tests.

import { FIELD_BY_ID, FIELDS, SEED_DEFAULTS, type SectionId } from '#lib/exam/catalog.ts';
import { ALIASES, COMMANDS } from './codes.ts';
import { expandVocab } from './vocab.ts';

export type Op =
	| { kind: 'set'; fields: string[]; text: string; append: boolean; source: string }
	| { kind: 'defaults'; sections: SectionId[] | 'all'; source: string }
	| { kind: 'clear'; sections: SectionId[] | 'all'; source: string };

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

const ALL_CODES = [...Object.keys(COMMANDS), ...Object.keys(ALIASES), ...FIELDS.map((f) => f.id)];

function resolve(code: string): string[] | null {
	if (FIELD_BY_ID.has(code)) return [code];
	return ALIASES[code] ?? null;
}

export function parseShorthand(input: string): ParseResult {
	const ops: Op[] = [];
	const errors: ParseError[] = [];
	let previous: string[] | null = null;

	// FIX: a newline is a space, never a silent cut-off (§2.2).
	const entries = input.replace(/\r?\n/g, ' ').split(';');

	for (const raw of entries) {
		const entry = raw.replace(/^[\W_]+/, '').replace(/^\s+/, '');
		if (!entry.trim()) continue;

		const command = COMMANDS[entry.trim().toUpperCase()];
		if (command) {
			ops.push({ ...command, source: entry.trim() });
			previous = null;
			continue;
		}

		let code = '';
		let text = '';
		const withColon = entry.match(/^([A-Za-z0-9_]+)\s*:(.*)$/s);
		const withSpace = entry.match(/^([A-Za-z0-9_]+)\s+(.*)$/s);
		if (withColon) {
			code = withColon[1].toUpperCase();
			text = withColon[2];
		} else if (withSpace && resolve(withSpace[1].toUpperCase())) {
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
		} else if (op.kind === 'defaults') {
			// Defaults always replace (parity, §3.2).
			for (const id of sectionFields(op.sections)) if (id in defaults) put(id, defaults[id], true);
		} else {
			for (const id of sectionFields(op.sections)) put(id, '', false);
		}
	}
	return { findings: next, changed: [...changed] };
}
