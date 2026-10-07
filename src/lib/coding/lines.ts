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
	SENSORIMOTOR_LABEL_KEY,
	VISIT_CODE_BY_CODE,
	VISIT_CODE_LABEL_KEY,
	VISIT_MODIFIER_CODES
} from './codes.ts';
import { english, type Translate } from './english.ts';
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
	/** Translator for the checks and the visit / 92060 descriptions (D48); English when left out. */
	t?: Translate;
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

export function buildCoding({ state, suggestedCode, items, sensorimotor, t = english }: BuildInput): CodingSummary {
	const checks: CodingCheck[] = [];
	const { dx, pointersFor, invalid, overflow } = dxList(items);
	const coded = items.filter((i) => (pointersFor.get(i.id) ?? []).length > 0);
	const uncoded = items.filter((i) => splitCodes(i.codes).length === 0);

	if (uncoded.length) {
		checks.push({
			level: 'warning',
			message: t('codes.checkUncoded', { count: uncoded.length, titles: uncoded.map((i) => i.title || t('codes.untitled')).join('; ') })
		});
	}
	if (invalid.length) checks.push({ level: 'warning', message: t('codes.checkInvalidDx', { codes: invalid.join(', ') }) });
	if (overflow.length) {
		checks.push({ level: 'error', message: t('codes.checkTooManyDx', { max: MAX_DX, codes: overflow.join(', ') }) });
	}
	if (!dx.length) checks.push({ level: 'warning', message: t('codes.checkNoDx') });

	const cpt: CptLine[] = [];
	const visitDef = VISIT_CODE_BY_CODE.get(state.visitCode ?? suggestedCode);
	const visitPointers = sortLetters(coded.filter((i) => !state.justifiersOff.includes(i.id)).flatMap((i) => pointersFor.get(i.id) ?? []));
	if (visitDef) {
		cpt.push({
			kind: 'visit',
			code: visitDef.code,
			description: t(VISIT_CODE_LABEL_KEY[visitDef.code]),
			modifiers: state.modifiers.filter((m) => VISIT_MODIFIER_CODES.includes(m)),
			pointers: visitPointers,
			units: 1
		});
	} else checks.push({ level: 'error', message: t('codes.checkChooseVisit') });

	if (state.include92060 && sensorimotor) {
		cpt.push({ kind: 'sensorimotor', code: SENSORIMOTOR.code, description: t(SENSORIMOTOR_LABEL_KEY), modifiers: [], pointers: visitPointers, units: 1 });
	}

	for (const test of state.tests) {
		if (!CPT_RE.test(test.cpt)) {
			checks.push({ level: 'error', message: t('codes.checkTestBadCpt', { label: test.label, cpt: test.cpt }) });
			continue;
		}
		const mod = test.modifier.trim().toUpperCase();
		if (mod && !MODIFIER_RE.test(mod)) checks.push({ level: 'error', message: t('codes.checkTestBadModifier', { cpt: test.cpt, modifier: test.modifier }) });
		if (test.justifiers.length > MAX_POINTERS) checks.push({ level: 'error', message: t('codes.checkTestTooManyJustifiers', { cpt: test.cpt, max: MAX_POINTERS }) });
		const pointers = sortLetters(test.justifiers.flatMap((id) => pointersFor.get(id) ?? []));
		if (!pointers.length) checks.push({ level: 'warning', message: t('codes.checkTestNoPointer', { cpt: test.cpt, label: test.label }) });
		cpt.push({ kind: 'test', code: test.cpt, description: test.label, modifiers: mod ? [mod] : [], pointers, units: 1 });
	}

	for (const line of cpt) {
		if (line.pointers.length > MAX_POINTERS) {
			const params = { code: line.code, n: line.pointers.length, letters: line.pointers.join(''), max: MAX_POINTERS };
			checks.push({ level: 'error', message: t(line.kind === 'test' ? 'codes.checkTooManyPointersTest' : 'codes.checkTooManyPointersVisit', params) });
		}
	}
	if (visitDef && !visitPointers.length && dx.length) checks.push({ level: 'warning', message: t('codes.checkVisitNoPointer') });

	// Suggestions only (B10 FIX): never applied for the provider.
	if (state.tests.length && !state.modifiers.includes('25')) {
		checks.push({ level: 'suggestion', message: t('codes.checkConsider25') });
	}
	const testOnly = state.tests.flatMap((x) => x.justifiers).filter((id) => !state.justifiersOff.includes(id));
	if (testOnly.length && state.tests.length) {
		const titles = [...new Set(testOnly)].map((id) => items.find((i) => i.id === id)?.title).filter(Boolean);
		if (titles.length) checks.push({ level: 'suggestion', message: t('codes.checkAlsoVisitJustifier', { titles: titles.join('; ') }) });
	}

	return { dx, cpt, checks, ok: !checks.some((c) => c.level === 'error') };
}
