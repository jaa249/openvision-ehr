// What the small shorthand codes under a row label mean, for their tooltip:
// "RC · LC · BC" -> RC = right eye, LC = left eye, BC = both eyes. Pure; the wording is i18n.
// A pair of codes that differ only by R/L (RC, LC) or OD/OS (SCODVA, SCOSVA) at the same place is a
// right / left pair; B + the shared part (BC) or the shared part alone (MRD) means both eyes.
import type { MessageKey } from '#lib/i18n/catalog.ts';
import type { Params } from '#lib/i18n/translate.ts';

export type CodeRole = 'right' | 'left' | 'both' | 'other';
export interface CodePart {
	code: string;
	role: CodeRole;
}

/** Splits a hint ("RC · LC · BC") into its codes. */
export const hintCodes = (hint: string): string[] =>
	hint
		.split(/\s*·\s*/)
		.map((s) => s.trim())
		.filter(Boolean);

/** If a and b are a right/left pair, the part they share (with the eye letters removed); else null. */
function pairStem(a: string, b: string): string | null {
	for (const [r, l] of [
		['OD', 'OS'],
		['R', 'L']
	] as const) {
		for (let i = a.indexOf(r); i >= 0; i = a.indexOf(r, i + 1)) {
			if (b === a.slice(0, i) + l + a.slice(i + r.length)) return a.slice(0, i) + a.slice(i + r.length);
		}
	}
	return null;
}

/** Each code with its role. */
export function describeHint(hint: string): CodePart[] {
	const codes = hintCodes(hint);
	const role = new Map<string, CodeRole>();
	const stems = new Set<string>();
	for (const a of codes) {
		for (const b of codes) {
			if (a === b || role.has(a)) continue;
			const stem = pairStem(a, b);
			if (stem !== null) {
				role.set(a, 'right');
				role.set(b, 'left');
				stems.add(stem);
			}
		}
	}
	for (const c of codes) {
		if (role.has(c)) continue;
		if (stems.has(c) || (c.startsWith('B') && stems.has(c.slice(1)))) role.set(c, 'both');
	}
	return codes.map((code) => ({ code, role: role.get(code) ?? 'other' }));
}

type T = (key: MessageKey, params?: Params) => string;
const ROLE_KEY: Record<Exclude<CodeRole, 'other'>, MessageKey> = { right: 'tips.codeRight', left: 'tips.codeLeft', both: 'tips.codeBoth' };

/**
 * The tooltip of a code hint, in the page language: "Shorthand codes: RC = right eye, LC = left eye
 * and BC = both eyes. In the shorthand bar (Alt+K) type a code, a colon and the value." Every code is
 * spelled out in full (the hint itself may be cut short on narrow screens).
 */
export function codeHintText(hint: string, t: T, list: (items: string[]) => string, keys: string): string {
	const items = describeHint(hint).map((p) => (p.role === 'other' ? p.code : t(ROLE_KEY[p.role], { code: p.code })));
	return t('tips.codeHint', { codes: list(items), keys });
}
