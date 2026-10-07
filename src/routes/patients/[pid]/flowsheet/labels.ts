// Flow sheet labels in the reader's language (D48). The English constants stay where they are
// (glaucoma.ts, the server's flow sheet); these maps say which message shows each of them.
import type { TargetSource } from '#lib/exam/sections/glaucoma.ts';
import type { MarkerKind } from '#lib/server/flowsheet.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';

/** TARGET_SOURCE_LABEL: where the IOP target in force came from. */
export const TARGET_SOURCE_KEY: Record<TargetSource, MessageKey> = {
	exam: 'flowsheet.sourceExam',
	prior: 'flowsheet.sourcePrior',
	provider: 'flowsheet.sourceProvider',
	default: 'flowsheet.sourceDefault'
};

/** Short names of the "performed" markers (chart strip and table). */
export const MARKER_KIND_KEY: Record<MarkerKind, MessageKey> = {
	VF: 'flowsheet.markerVf',
	OCT: 'flowsheet.markerOct',
	GONIO: 'flowsheet.markerGonio'
};

/** IOP method: short (table) and long (chart point label). */
export const METHOD_SHORT_KEY: Record<'AP' | 'TPN', MessageKey> = { AP: 'flowsheet.methodApShort', TPN: 'flowsheet.methodTpnShort' };
export const METHOD_LONG_KEY: Record<'AP' | 'TPN', MessageKey> = { AP: 'flowsheet.methodAp', TPN: 'flowsheet.methodTpn' };
