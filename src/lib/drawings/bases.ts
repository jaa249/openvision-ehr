// Base images for the drawing canvases (spec §5.1). All original OpenVision art, 450×250,
// OD (patient's right) on the viewer's left with OD/OS labels (decision D9).
import type { MessageKey } from '#lib/i18n/catalog.ts';
import blank from './blank.svg?url';
import ext from './ext.svg?url';
import antseg from './antseg.svg?url';
import retina from './retina.svg?url';

export const BLANK_BASE = blank;

const BASES: Record<string, string> = { EXT: ext, ANTSEG: antseg, RETINA: retina };

/** The zone's anatomical base, or the blank base for zones without one (HPI, NEURO, IMPPLAN). */
export function baseFor(zone: string): string {
	return BASES[zone] ?? blank;
}

export const ZONE_LABEL: Record<string, string> = {
	EXT: 'External',
	ANTSEG: 'Anterior segment',
	RETINA: 'Retina',
	HPI: 'HPI',
	NEURO: 'Neuro',
	IMPPLAN: 'Impression/Plan'
};

/** Screen labels of the zones (D48); catalog.test.ts checks every ZONE_LABEL id has one. */
export const ZONE_LABEL_KEY: Record<'EXT' | 'ANTSEG' | 'RETINA' | 'HPI' | 'NEURO' | 'IMPPLAN', MessageKey> = {
	EXT: 'drawing.zoneExternal',
	ANTSEG: 'drawing.zoneAntSeg',
	RETINA: 'drawing.zoneRetina',
	HPI: 'drawing.zoneHpi',
	NEURO: 'drawing.zoneNeuro',
	IMPPLAN: 'drawing.zoneImpPlan'
};
