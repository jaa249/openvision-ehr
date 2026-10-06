// Small helpers shared by VisionPanel and PressurePanel.
import type { Findings } from '#lib/shorthand/parse.ts';

export interface CellState {
	value: string;
	/** Shorthand-bar preview (not yet committed). */
	ghost: boolean;
	isDefault: boolean;
	copied: boolean;
}

/** What one field shows: the shorthand ghost wins, then the saved value (same rules as SectionPanel). */
export function cellState(id: string, findings: Findings, preview: Findings | null, copied: Set<string>): CellState {
	const ghost = preview?.[id];
	const real = findings[id];
	return {
		value: ghost?.value ?? real?.value ?? '',
		ghost: !!ghost,
		isDefault: !ghost && !!real?.isDefault,
		copied: !ghost && copied.has(id)
	};
}

/** Next findings with `values` written, plus the ids that actually changed (for oncommit). */
export function withValues(
	findings: Findings,
	values: Record<string, string>,
	isDefault = false
): { next: Findings; changed: string[] } {
	const next: Findings = { ...findings };
	const changed: string[] = [];
	for (const [id, value] of Object.entries(values)) {
		const cur = findings[id];
		if ((cur?.value ?? '') === value && !!cur?.isDefault === isDefault) continue;
		next[id] = { value, isDefault };
		changed.push(id);
	}
	return { next, changed };
}

/** Sets an input's value without losing the caret (used when typing is normalized, e.g. "=" -> "+"). */
export function replaceKeepingCaret(el: HTMLInputElement, value: string): void {
	if (el.value === value) return;
	const pos = el.selectionStart;
	el.value = value;
	if (pos !== null) el.setSelectionRange(pos, pos);
}
