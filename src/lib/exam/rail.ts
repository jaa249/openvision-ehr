// Section rail marks (DESIGN §5.2: empty / started / complete / abnormal), from data the exam already has.
// Pure so the rail, its tooltip and the tests agree. Rules (D54):
// - empty: nothing recorded in the section.
// - abnormal: a recorded text finding that is not the practice's normal for that field and was not filled
//   by "Normal" (isDefault), or an IOP reading above that eye's target. Measurements (numbers) that differ
//   from the normal value are not abnormal on their own: a pupil of 4 mm or an MRD of +2 is a reading.
// - complete: every field that has a practice normal (the section's main findings, both eyes) holds a
//   value, typed or from "Normal". Sections without normals (HPI, refraction, plan, codes) never show
//   complete: the rail cannot know when they are done, so they stay "started".
// - started: anything else with at least one value.
// Abnormal wins over complete: it is the one a doctor must not miss.
import { FIELDS, type SectionId } from './catalog.ts';
import { IOP_METHODS, iopTarget, isHighIop } from './sections/workup.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

export const RAIL_STATES = ['empty', 'started', 'complete', 'abnormal'] as const;
export type RailState = (typeof RAIL_STATES)[number];

const BY_SECTION = new Map<SectionId, string[]>();
for (const f of FIELDS) BY_SECTION.set(f.section, [...(BY_SECTION.get(f.section) ?? []), f.id]);

/** Words that always mean "nothing abnormal", whatever the practice's normal for the field says. */
const NORMAL_WORDS = new Set(['wnl', 'nl', 'normal', 'within normal limits', 'unremarkable', 'neg', 'negative']);

const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
const isNumber = (s: string) => /^[+-]?\d+(\.\d+)?$/.test(s.trim());

/** A recorded value counts as normal: equal to the field's normal (case and spacing aside), a normal word, or a number. */
export function isNormalValue(value: string, normal: string): boolean {
	const v = squash(value);
	if (!v) return true;
	if (v === squash(normal) || NORMAL_WORDS.has(v)) return true;
	return isNumber(v) && isNumber(normal);
}

const has = (findings: Findings, id: string) => !!findings[id]?.value?.trim();

export function railState(section: SectionId, findings: Findings, defaults: Record<string, string> = {}): RailState {
	const ids = BY_SECTION.get(section) ?? [];
	const filled = ids.filter((id) => has(findings, id));
	if (!filled.length) return 'empty';
	const abnormal =
		filled.some((id) => {
			const normal = defaults[id]?.trim();
			const f = findings[id];
			return !!normal && !f.isDefault && !isNormalValue(f.value, normal);
		}) ||
		(section === 'IOP' &&
			(['OD', 'OS'] as const).some((eye) =>
				IOP_METHODS.filter((m) => m.numeric).some((m) => isHighIop(findings[eye === 'OD' ? m.od : m.os]?.value, iopTarget(eye, findings, defaults)))
			));
	if (abnormal) return 'abnormal';
	const main = ids.filter((id) => defaults[id]?.trim());
	if (main.length && main.every((id) => has(findings, id))) return 'complete';
	return 'started';
}
