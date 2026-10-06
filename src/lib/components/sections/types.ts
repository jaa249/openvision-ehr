// Contract every custom section panel follows (Vision, IOP / pupils, Refraction, later HPI/Neuro/Plan).
import type { Findings } from '#lib/shorthand/parse.ts';

export interface PanelProps {
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
}
