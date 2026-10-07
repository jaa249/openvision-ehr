// Screen and paper labels of the Rx pages in the reader's language (D48). The English constants in
// refraction.ts stay as they are: the exam report, exports and stored values use them. Lens materials
// and treatments are stored values (the dispense record), so they are not translated.
import { RX_TYPES, type RxKind } from '#lib/exam/sections/refraction.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';

/** RX_TYPES by its English label (rxType is stored as the index). */
export const RX_TYPE_KEY: Record<(typeof RX_TYPES)[number], MessageKey> = {
	'Single vision': 'rx.typeSingleVision',
	Bifocal: 'rx.typeBifocal',
	Trifocal: 'rx.typeTrifocal',
	Progressive: 'rx.typeProgressive'
};

/** METHOD_LABEL for each Rx kind. */
export const METHOD_KEY: Record<RxKind, MessageKey> = {
	W: 'rx.methodCurrentGlasses',
	MR: 'rx.methodManifest',
	CR: 'rx.methodCycloplegic',
	AR: 'rx.methodAutorefraction',
	CTL: 'rx.methodContactLens'
};

/** Column headings of rxTable() (dispensed history), by their English text. */
export const RX_TABLE_HEAD_KEY: Record<string, MessageKey> = {
	Eye: 'rx.colEye',
	Lens: 'rx.colLens',
	Sph: 'rx.colSph',
	Cyl: 'rx.colCyl',
	Axis: 'rx.colAxis',
	Prism: 'rx.colPrism',
	'Mid ADD': 'rx.colMidAdd',
	ADD: 'rx.colAdd',
	PD: 'rx.colPd',
	BC: 'rx.colBc',
	Diam: 'rx.colDiam',
	Qty: 'rx.colQty',
	Brand: 'rx.colBrand'
};

/** Rx type label for a stored index ('0'-'3'); '' when not one. */
export const rxTypeKey = (index: string): MessageKey | null => {
	const label = RX_TYPES[Number(index)];
	return /^[0-3]$/.test(index) && label ? RX_TYPE_KEY[label] : null;
};
