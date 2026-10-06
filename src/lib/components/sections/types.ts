// Contract every custom section panel follows (Vision, IOP / pupils, Refraction, later HPI/Neuro/Plan).
import type { Findings } from '#lib/shorthand/parse.ts';

export interface PanelProps {
	/** Which chart this is, for panels that load patient-level data (HPI's past history). */
	context: { patientId: number; encounterId: number };
	findings: Findings;
	/** Values the shorthand bar would write, shown as a ghost until committed. */
	preview: Findings | null;
	/** Fields just filled from a prior visit (tint until edited). */
	copied: Set<string>;
	/** The provider's normal values (field id -> value). */
	defaults: Record<string, string>;
	/** Typing in one field (autosaved, no undo entry). */
	onedit: (field: string, value: string) => void;
	/**
	 * A bulk change (button, copy, normal...): pass the full next findings and the changed ids.
	 * It gets an undo toast with `label`.
	 */
	oncommit: (next: Findings, changed: string[], label: string) => void;
	/**
	 * Read-only exam (signed, or another page holds the edit lock, spec §15.1): show values, change
	 * nothing and post nothing. The exam page also makes the editing area inert, so a panel that
	 * ignores this flag still cannot be typed into; panels that load and save their own data
	 * (plan, coding, history) should honor it.
	 */
	readonly?: boolean;
}
