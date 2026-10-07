// glaucoma section module: per-eye IOP targets (ODIOPTARGET / OSIOPTARGET) and the high-IOP rule.
// Spec: docs/spec/BEHAVIOR.md §8.3 (targets lookup and highlight FIXes, flow sheet).
// Wired into catalog.ts (FIELDS, SEED_DEFAULTS) and shorthand/codes.ts (ALIASES).
// Rule: import only TYPES from catalog.ts here (it imports values from this file).
import type { FieldDef, FieldText } from '../catalog.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
// workup imports nothing from here, so importing its values is not circular.
import { DEFAULT_IOP_TARGET, WORKUP_FIELDS } from './workup.ts';

export { DEFAULT_IOP_TARGET };

export type TargetEye = 'OD' | 'OS';
export const TARGET_IDS: Record<TargetEye, string> = { OD: 'ODIOPTARGET', OS: 'OSIOPTARGET' };

// The workup module defined the target fields first (it owns the IOP box). Whichever module defines a
// field first owns it, so the catalog never holds the same id twice; these specs take over if workup
// ever drops them.
const SPECS: FieldDef[] = [
	{ id: 'ODIOPTARGET', section: 'IOP', row: 'IOPTARGET', eye: 'OD', label: 'IOP target OD', maxLength: 10, expand: false },
	{ id: 'OSIOPTARGET', section: 'IOP', row: 'IOPTARGET', eye: 'OS', label: 'IOP target OS', maxLength: 10, expand: false }
];
const taken = new Set(WORKUP_FIELDS.map((f) => f.id));
export const GLAUCOMA_FIELDS: FieldDef[] = SPECS.filter((f) => !taken.has(f.id));
/** Screen labels of GLAUCOMA_FIELDS (D48). */
export const GLAUCOMA_FIELD_TEXT: Record<string, FieldText> = Object.fromEntries(
	GLAUCOMA_FIELDS.map((f): [string, FieldText] => [f.id, (t) => t('sections.iopTargetLabel', { eye: f.eye })])
);

/**
 * Shorthand codes (the field ids are codes too, e.g. ODIOPTARGET:16). SHORTHAND.md lists none for
 * targets, so these are ours and clash with no existing code: TGT:15 sets both eyes.
 */
export const GLAUCOMA_ALIASES: Record<string, string[]> = {
	RTGT: ['ODIOPTARGET'],
	LTGT: ['OSIOPTARGET'],
	TGT: ['ODIOPTARGET', 'OSIOPTARGET'],
	BTGT: ['ODIOPTARGET', 'OSIOPTARGET'],
	TARGET: ['ODIOPTARGET', 'OSIOPTARGET']
};

/** No default: a target is a clinical decision, never pre-filled as "normal" (§8.3). */
export const GLAUCOMA_DEFAULTS: Record<string, string> = {};

/** A pressure as a number (mmHg), or null for blank or text such as "soft" / "digital". */
export function iopNumber(v: string | undefined | null): number | null {
	const t = (v ?? '').trim();
	return /^\d{1,3}(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** True when an IOP reading is above the eye's target (21 when none), compared as numbers (§8.3 FIX). */
export function iopHigh(value: string | undefined, target: string | undefined): boolean {
	const n = iopNumber(value);
	if (n === null) return false;
	return n > (iopNumber(target) ?? DEFAULT_IOP_TARGET);
}

export type TargetSource = 'exam' | 'prior' | 'provider' | 'default';

export interface ResolvedTarget {
	value: number;
	source: TargetSource;
	/** Visit date the value came from when source = 'prior'. */
	from?: string;
}

/**
 * The target for one eye (§8.3 FIX, lookup order): this exam's value, else the latest PRIOR visit
 * that set one, else the provider's list entry, else 21. `priors` must be newest first and contain
 * only visits before this one.
 */
export function resolveTarget(
	eye: TargetEye,
	current: Findings,
	priors: { date: string; findings: Findings }[],
	defaults: Record<string, string> = {}
): ResolvedTarget {
	const id = TARGET_IDS[eye];
	const own = iopNumber(current[id]?.value);
	if (own !== null) return { value: own, source: 'exam' };
	for (const p of priors) {
		const v = iopNumber(p.findings[id]?.value);
		if (v !== null) return { value: v, source: 'prior', from: p.date };
	}
	const d = iopNumber(defaults[id]);
	if (d !== null) return { value: d, source: 'provider' };
	return { value: DEFAULT_IOP_TARGET, source: 'default' };
}

export const TARGET_SOURCE_LABEL: Record<TargetSource, string> = {
	exam: 'set at this visit',
	prior: 'from the last visit that set one',
	provider: 'your default',
	default: 'standard 21'
};

/** Screen text of TARGET_SOURCE_LABEL (D48), for pages that show where a target came from. */
export const TARGET_SOURCE_LABEL_KEY: Record<TargetSource, MessageKey> = {
	exam: 'sections.tgtSourceLabelExam',
	prior: 'sections.tgtSourceLabelPrior',
	provider: 'sections.tgtSourceLabelProvider',
	default: 'sections.tgtSourceLabelDefault'
};
