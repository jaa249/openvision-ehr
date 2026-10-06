// Quick picks: one-tap findings per section (docs/spec/BEHAVIOR.md §4).
// The starter list is short clinical terms, curated for this project.

import { SECTION_DEF, type SectionId } from './catalog.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

export type PickMode = 'add' | 'replace' | 'append';
export type QpZone = 'EXT' | 'ANTSEG' | 'RETINA';
export const QP_ZONES: QpZone[] = ['EXT', 'ANTSEG', 'RETINA'];

export interface QuickPick {
	id: number;
	zone: QpZone;
	row: string; // row id within the section, e.g. CONJ
	label: string;
	text: string; // '' with mode 'replace' = clear the field
	mode: PickMode;
}

export const GRADES = ['no', 'trace', '+1', '+2', '+3'];
export const SIZES = ['1mm', '2mm', '3mm', '4mm', '5mm'];

/** [row, label, text, mode]; text defaults to label, mode to 'add'. */
type Seed = [row: string, label: string, text?: string, mode?: PickMode];

const CLEAR = (row: string): Seed => [row, 'clear field', '', 'replace'];

export const QP_SEED: Record<QpZone, Seed[]> = {
	EXT: [
		CLEAR('BROW'),
		['BROW', 'ptosis'],
		['BROW', 'rhytids'],
		['BROW', 'scar'],
		['BROW', 'seb ker', 'seborrheic keratosis'],
		['BROW', 'act ker', 'actinic keratosis'],
		['BROW', 'BCC'],
		['BROW', 'SCC'],
		CLEAR('UL'),
		['UL', 'normal', 'normal lids and lashes', 'replace'],
		['UL', 'dermatochalasis'],
		['UL', '2mm ptosis'],
		['UL', '3mm ptosis'],
		['UL', 'lesion'],
		['UL', 'chalazion'],
		['UL', 'stye'],
		CLEAR('LL'),
		['LL', 'good tone', 'good tone', 'replace'],
		['LL', 'dermatochalasis'],
		['LL', 'ectropion'],
		['LL', 'entropion'],
		['LL', 'trichiasis'],
		['LL', 'lesion'],
		['LL', 'fat prolapse'],
		['LL', 'erythema'],
		['LL', 'ecchymosis'],
		['LL', 'chalazion'],
		['LL', 'stye'],
		['MCT', 'lesion'],
		['MCT', 'NLDO, acute'],
		['MCT', 'NLDO, chronic'],
		['MRD', '0', '0', 'replace'],
		['MRD', '1', '1', 'replace'],
		['MRD', '2', '2', 'replace'],
		['MRD', '3', '3', 'replace'],
		['LF', '17', '17', 'replace'],
		['LF', '15', '15', 'replace'],
		['LF', '13', '13', 'replace']
	],
	ANTSEG: [
		CLEAR('CONJ'),
		['CONJ', 'quiet', 'quiet', 'replace'],
		['CONJ', 'injection'],
		['CONJ', 'papillae'],
		['CONJ', 'giant papillae'],
		['CONJ', 'pinguecula'],
		['CONJ', 'follicles'],
		['CONJ', 'mucopurulence'],
		['CONJ', 'moderate bleb'],
		['CONJ', 'Seidel negative'],
		CLEAR('CORNEA'),
		['CORNEA', 'clear', 'clear', 'replace'],
		['CORNEA', 'abrasion'],
		['CORNEA', 'MDF dystrophy', 'map-dot-fingerprint dystrophy'],
		['CORNEA', 'metallic FB', 'metallic foreign body'],
		['CORNEA', 'edema'],
		['CORNEA', 'dendrite'],
		['CORNEA', 'stromal scar'],
		['CORNEA', 'guttata'],
		['CORNEA', 'fine KP', 'fine keratic precipitates'],
		['CORNEA', 'mutton-fat KP', 'mutton-fat keratic precipitates'],
		CLEAR('AC'),
		['AC', 'deep and quiet', 'deep and quiet', 'replace'],
		['AC', 'cell/flare'],
		['AC', 'narrow'],
		['AC', 'hyphema'],
		CLEAR('IRIS'),
		['IRIS', 'PXE', 'pseudoexfoliation'],
		['IRIS', 'patent PI'],
		['IRIS', 'nevus'],
		['IRIS', 'NVI'],
		CLEAR('LENS'),
		['LENS', 'clear', 'clear', 'replace'],
		['LENS', 'NS'],
		['LENS', 'cortical'],
		['LENS', 'PSC'],
		['LENS', 'PXE', 'pseudoexfoliation'],
		['LENS', 'PCIOL'],
		['LENS', 'PC open', 'posterior capsule open']
	],
	RETINA: [
		CLEAR('DISC'),
		['DISC', 'pink', 'pink', 'replace'],
		['DISC', 'at risk', 'disc at risk', 'replace'],
		['DISC', 'pallor'],
		['DISC', 'NVD'],
		['DISC', 'gr I edema', 'grade I papilledema', 'replace'],
		['DISC', 'gr III edema', 'grade III papilledema', 'replace'],
		['DISC', 'gr V edema', 'grade V papilledema', 'replace'],
		CLEAR('CUP'),
		['CUP', '0.1', '0.1', 'replace'],
		['CUP', '0.3', '0.3', 'replace'],
		['CUP', '0.5', '0.5', 'replace'],
		['CUP', '0.8', '0.8', 'replace'],
		['CUP', '0.95', '0.95', 'replace'],
		['CUP', 'V (vertical)', 'V', 'append'],
		['CUP', 'H (horizontal)', 'H', 'append'],
		['CUP', 'x (by)', 'x', 'append'],
		['CUP', 'notch'],
		CLEAR('MACULA'),
		['MACULA', 'flat', 'flat', 'replace'],
		['MACULA', 'hard drusen'],
		['MACULA', 'soft drusen'],
		['MACULA', 'PED'],
		['MACULA', 'CSR'],
		CLEAR('VESSELS'),
		['VESSELS', '2:3', '2:3', 'replace'],
		['VESSELS', '1:2'],
		['VESSELS', 'BDR'],
		['VESSELS', 'PDR'],
		['VESSELS', 'BRVO'],
		['VESSELS', 'CRVO'],
		['VESSELS', 'BRAO'],
		['VESSELS', 'CRAO'],
		CLEAR('VITREOUS'),
		['VITREOUS', 'clear', 'clear', 'replace'],
		['VITREOUS', 'floater', 'vitreous floater'],
		['VITREOUS', 'PVD'],
		['VITREOUS', 'hemorrhage', 'vitreous hemorrhage'],
		CLEAR('PERIPH'),
		['PERIPH', 'clear', 'clear', 'replace'],
		['PERIPH', 'retinal tear'],
		['PERIPH', 'retinoschisis'],
		['PERIPH', 'NVE'],
		['PERIPH', 'RD', 'retinal detachment']
	]
};

export function seedRows(): Omit<QuickPick, 'id'>[] {
	return QP_ZONES.flatMap((zone) =>
		QP_SEED[zone].map(([row, label, text, mode]) => ({
			zone,
			row,
			label,
			text: text ?? label,
			mode: mode ?? 'add'
		}))
	);
}

/** The field ids a pick writes to, OD before OS (spec §4.3). */
export function pickTargets(pick: Pick<QuickPick, 'zone' | 'row'>, eye: 'OD' | 'OS' | 'OU'): string[] {
	const row = SECTION_DEF.get(pick.zone as SectionId)?.rows.find((r) => r.id === pick.row);
	if (!row) return [];
	if (eye === 'OD') return [row.od];
	if (eye === 'OS') return [row.os];
	return [row.od, row.os];
}

/**
 * Write a pick into the findings (spec §4.3, with the double-space FIX).
 * `modifier` (grade/size/location) prefixes the text and applies to both eyes of an OU pick.
 */
export function applyPick(
	findings: Findings,
	pick: Omit<QuickPick, 'id'>,
	eye: 'OD' | 'OS' | 'OU',
	modifier: string | null
): { findings: Findings; changed: string[] } {
	const next: Findings = { ...findings };
	const changed: string[] = [];
	const prefixed = pick.text && modifier ? `${modifier} ${pick.text}` : pick.text;
	for (const id of pickTargets(pick, eye)) {
		const cur = findings[id] ?? { value: '', isDefault: false };
		let value: string;
		if (pick.mode === 'replace') value = prefixed;
		else if (pick.mode === 'append') value = cur.value + pick.text; // no separator, no prefix (parity)
		else if (!cur.value || cur.isDefault) value = prefixed;
		else if (cur.value.endsWith('x')) value = cur.value + pick.text;
		else value = `${cur.value}, ${prefixed}`;
		if (value === cur.value && !cur.isDefault) continue;
		next[id] = { value, isDefault: false };
		changed.push(id);
	}
	return { findings: next, changed };
}
