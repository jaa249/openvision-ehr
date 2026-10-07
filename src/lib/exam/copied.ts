// Field states in the accessible name (WCAG 1.4.1, 1.3.1): a field still holding the default "normal"
// value says "(default)", one filled from a prior visit says "(copied from <date>)". The tint and bar
// show it on screen (tokens.css --default-tint / --copied-tint); this says it to a screen reader.
// The exam page shares which visit each copied field came from through a Svelte context.
import { getContext, setContext } from 'svelte';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import type { Params } from '#lib/i18n/translate.ts';

type T = (key: MessageKey, params?: Params) => string;
/** The visit date (ISO yyyy-mm-dd) a copied field came from, or undefined (copied from another screen). */
export type CopiedFrom = (fieldId: string) => string | undefined;

const KEY = Symbol('openvision.copiedFrom');
const NONE: CopiedFrom = () => undefined;

export function setCopiedFrom(fn: CopiedFrom): void {
	setContext(KEY, fn);
}

export function useCopiedFrom(): CopiedFrom {
	return getContext<CopiedFrom | undefined>(KEY) ?? NONE;
}

/**
 * The field's accessible name with its state. The visible label stays first (label in name, 2.5.3).
 * `date` is already formatted for the page language.
 */
export function stateLabel(t: T, label: string, state: { isDefault?: boolean; copied?: boolean; date?: string }): string {
	if (state.isDefault) return t('sections.labelDefault', { label });
	if (state.copied) return state.date ? t('sections.labelCopied', { label, date: state.date }) : t('sections.labelCopiedNoDate', { label });
	return label;
}
