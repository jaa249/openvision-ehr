// Code summary (spec §11.2-11.4 with FIXes): the diagnosis list with pointer letters A-L and the CPT
// lines with modifiers and pointers, plus the checks shown under the summary. Pure. Shown in the Codes
// section and printed on the report; never saved as billing lines (D46).
//
// Rules:
// - Diagnoses come from coded impression items in plan order; comma-joined codes are expanded,
//   "Code" placeholders skipped, duplicates kept once. At most 12 get a letter (claim limit).
// - A justifier is an impression item; it points at the letters of all its codes.
// - At most 4 pointers per line. We never trim silently: more than 4 is an error to fix.
// - Nothing is switched on for the provider (B10 FIX): no forced 59 on tests, no forced 25 on the
//   visit, visit justifiers are never turned off by a test. Those appear as suggestions instead.
import {
	CPT_RE,
	DX_LETTERS,
	isDxCode,
	MAX_DX,
	MAX_POINTERS,
	MODIFIER_RE,
	SENSORIMOTOR,
	VISIT_CODE_BY_CODE,
	VISIT_MODIFIER_CODES
} from './codes.ts';
import { splitCodes } from './visit.ts';
import type { CodingItem, CodingState, CptLine, DxLine } from './types.ts';

export interface CodingCheck {
	level: 'error' | 'warning' | 'suggestion';
	message: string;
}

export interface CodingSummary {
	dx: DxLine[];
	cpt: CptLine[];
	checks: CodingCheck[];
	/** No errors: the lines may be saved. */
	ok: boolean;
}

export interface BuildInput {
	state: CodingState;
	/** The suggested visit code, used when the provider has not chosen one. */
	suggestedCode: string;
	items: CodingItem[];
	/** sensorimotorSuggested(findings): 92060 only counts when this is true. */
	sensorimotor: boolean;
}

/** Diagnoses with letters, and each item's pointer letters. */
export function dxList(items: CodingItem[]): { dx: DxLine[]; pointersFor: Map<number, string[]>; invalid: string[]; overflow: string[] } {
	const dx: DxLine[] = [];
	const letterOf = new Map<string, string>();
	const pointersFor = new Map<number, string[]>();
	const invalid: string[] = [];
	const overflow: string[] = [];
	for (const item of items) {
		const letters: string[] = [];
		for (const code of splitCodes(item.codes)) {
			if (!isDxCode(code)) {
				if (!invalid.includes(code)) invalid.push(code);
				continue;
			}
			let letter = letterOf.get(code);
			if (!letter) {
				if (dx.length >= MAX_DX) {
					if (!overflow.includes(code)) overflow.push(code);
					continue;
				}
				letter = DX_LETTERS[dx.length];
				letterOf.set(code, letter);
				dx.push({ letter, code, title: item.title });
			}
			if (!letters.includes(letter)) letters.push(letter);
		}
		pointersFor.set(item.id, letters);
	}
	return { dx, pointersFor, invalid, overflow };
}

const sortLetters = (l: string[]) => [...new Set(l)].sort((a, b) => DX_LETTERS.indexOf(a) - DX_LETTERS.indexOf(b));

export function buildCoding({ state, suggestedCode, items, sensorimotor }: BuildInput): CodingSummary {
	const checks: CodingCheck[] = [];
	const { dx, pointersFor, invalid, overflow } = dxList(items);
	const coded = items.filter((i) => (pointersFor.get(i.id) ?? []).length > 0);
	const uncoded = items.filter((i) => splitCodes(i.codes).length === 0);

	if (uncoded.length) {
		checks.push({
			level: 'warning',
			message: `${uncoded.length} impression item${uncoded.length === 1 ? ' has' : 's have'} no diagnosis code: ${uncoded.map((i) => i.title || 'untitled').join('; ')}.`
		});
	}
	if (invalid.length) checks.push({ level: 'warning', message: `Not a valid diagnosis code, left out: ${invalid.join(', ')}.` });
	if (overflow.length) {
		checks.push({ level: 'error', message: `More than ${MAX_DX} diagnoses; a claim holds ${MAX_DX}. Left out: ${overflow.join(', ')}. Remove or merge impression items.` });
	}
	if (!dx.length) checks.push({ level: 'warning', message: 'No coded diagnoses yet: code the impression items in Imp / Plan.' });

	const cpt: CptLine[] = [];
	const visitDef = VISIT_CODE_BY_CODE.get(state.visitCode ?? suggestedCode);
	const visitPointers = sortLetters(coded.filter((i) => !state.justifiersOff.includes(i.id)).flatMap((i) => pointersFor.get(i.id) ?? []));
	if (visitDef) {
		cpt.push({
			kind: 'visit',
			code: visitDef.code,
			description: visitDef.label,
			modifiers: state.modifiers.filter((m) => VISIT_MODIFIER_CODES.includes(m)),
			pointers: visitPointers,
			units: 1
		});
	} else checks.push({ level: 'error', message: 'Choose a visit code.' });

	if (state.include92060 && sensorimotor) {
		cpt.push({ kind: 'sensorimotor', code: SENSORIMOTOR.code, description: SENSORIMOTOR.label, modifiers: [], pointers: visitPointers, units: 1 });
	}

	for (const t of state.tests) {
		if (!CPT_RE.test(t.cpt)) {
			checks.push({ level: 'error', message: `Test "${t.label}" has an invalid CPT code (${t.cpt}).` });
			continue;
		}
		const mod = t.modifier.trim().toUpperCase();
		if (mod && !MODIFIER_RE.test(mod)) checks.push({ level: 'error', message: `Test ${t.cpt}: modifier "${t.modifier}" must be two letters or digits.` });
		if (t.justifiers.length > MAX_POINTERS) checks.push({ level: 'error', message: `Test ${t.cpt}: at most ${MAX_POINTERS} justifiers.` });
		const pointers = sortLetters(t.justifiers.flatMap((id) => pointersFor.get(id) ?? []));
		if (!pointers.length) checks.push({ level: 'warning', message: `Test ${t.cpt} (${t.label}) has no diagnosis pointer: pick a justifier.` });
		cpt.push({ kind: 'test', code: t.cpt, description: t.label, modifiers: mod ? [mod] : [], pointers, units: 1 });
	}

	for (const line of cpt) {
		if (line.pointers.length > MAX_POINTERS) {
			checks.push({
				level: 'error',
				message: `${line.code} points to ${line.pointers.length} diagnoses (${line.pointers.join('')}); a line holds ${MAX_POINTERS}. ${line.kind === 'test' ? 'Turn off a justifier.' : 'Turn off some visit justifiers.'}`
			});
		}
	}
	if (visitDef && !visitPointers.length && dx.length) checks.push({ level: 'warning', message: 'The visit code has no diagnosis pointer: switch on a visit justifier.' });

	// Suggestions only (B10 FIX): never applied for the provider.
	if (state.tests.length && !state.modifiers.includes('25')) {
		checks.push({
			level: 'suggestion',
			message: 'Tests are billed with the visit. If the visit was significant and separately identifiable from them, consider modifier 25.'
		});
	}
	const testOnly = state.tests.flatMap((t) => t.justifiers).filter((id) => !state.justifiersOff.includes(id));
	if (testOnly.length && state.tests.length) {
		const titles = [...new Set(testOnly)].map((id) => items.find((i) => i.id === id)?.title).filter(Boolean);
		if (titles.length) checks.push({ level: 'suggestion', message: `Also a visit justifier: ${titles.join('; ')}. Keep it on the visit only if the visit addressed it beyond the test.` });
	}

	return { dx, cpt, checks, ok: !checks.some((c) => c.level === 'error') };
}
