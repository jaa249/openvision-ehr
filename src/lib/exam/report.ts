// Printed exam report: which sections and rows appear (docs/spec/BEHAVIOR.md §13.2).
// Pure, so the single and mass-print pages render the same thing and tests can pin the rules.

import { SECTION_DEF, type SectionId } from './catalog.ts';
import { workupReport } from './sections/workup.ts';
import { refractionReport } from './sections/refraction.ts';
import { historyReport } from './sections/history.ts';
import { neuroReport } from './sections/neuro.ts';
import { dilationReport } from './sections/dilation.ts';
import type { Findings } from '#lib/shorthand/parse.ts';

export interface ReportRow {
	label: string;
	od: string;
	os: string;
}
export interface ReportSection {
	title: string;
	/** OD | label | OS rows (the exam-section layout). */
	rows: ReportRow[];
	comments: string;
	/** One-line result printed as plain text, e.g. "Full to CF OU" (no "Comments:" label). */
	summary?: string;
	/** Optional free-form table, e.g. refraction (Sph/Cyl/Axis...). Printed after the rows. */
	table?: { head: string[]; body: string[][] };
}

/** Core rows print whenever their section prints; extra rows only when filled (§13.2 items 7, 8, 10). */
const LAYOUT: { section: SectionId; title: string; core: string[]; extra: string[] }[] = [
	{ section: 'EXT', title: 'External', core: ['BROW', 'UL', 'LL', 'MCT'], extra: ['ADNEXA'] },
	{
		section: 'ANTSEG',
		title: 'Anterior segment',
		core: ['CONJ', 'CORNEA', 'AC', 'LENS', 'IRIS'],
		extra: ['GONIO', 'KTHICKNESS', 'SCHIRMER1', 'SCHIRMER2', 'TBUT']
	},
	{
		section: 'RETINA',
		title: 'Retina',
		core: ['DISC', 'CUP', 'MACULA', 'VESSELS', 'VITREOUS', 'PERIPH'],
		extra: ['CMT']
	}
];

/** "Additional findings": External measurements, each only when filled (§13.2 item 9, with the MRD/fissure FIX). */
const ADDITIONAL = ['LF', 'MRD', 'VFISSURE', 'CAROTID', 'TEMPART', 'CNV', 'CNVII'];

export function buildReport(findings: Findings): ReportSection[] {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	const row = (section: SectionId, id: string): ReportRow | null => {
		const r = SECTION_DEF.get(section)?.rows.find((x) => x.id === id);
		if (!r) return null;
		const unit = r.measure ? ` ${r.measure}` : '';
		const fmt = (s: string) => (s ? s + unit : '');
		return { label: r.label, od: fmt(v(r.od)), os: fmt(v(r.os)) };
	};
	const filled = (r: ReportRow | null): r is ReportRow => !!r && !!(r.od || r.os);

	// HPI first (item 1); PMSFH is patient-level, so ExamReport prints it from PrintableEncounter (item 2).
	// Then workup (vision, IOP, pupils, fields), motility, and refraction (items 3-6).
	const neuro = neuroReport(findings);
	const out: ReportSection[] = [...historyReport(findings), ...workupReport(findings), ...neuro.strip, ...refractionReport(findings)];
	for (const l of LAYOUT) {
		// Dilation prints just before Retina (§13.2 item 10 "Dilation Time").
		if (l.section === 'RETINA') out.push(...dilationReport(findings));
		const sec = SECTION_DEF.get(l.section)!;
		const core = l.core.map((id) => row(l.section, id)).filter((r): r is ReportRow => !!r);
		const extra = l.extra.map((id) => row(l.section, id)).filter(filled);
		const comments = v(sec.comments.field);
		// A section prints when anything in it was recorded, for either eye (FIX: not OD-only).
		if (!core.some(filled) && !extra.length && !comments) {
			if (l.section === 'EXT') out.push(...additional());
			continue;
		}
		out.push({ title: l.title, rows: [...core, ...extra], comments });
		if (l.section === 'EXT') out.push(...additional());
	}
	// Cover test and neuro comments after Retina (item 11).
	out.push(...neuro.after);
	return out;

	function additional(): ReportSection[] {
		const rows = ADDITIONAL.map((id) => row('EXT', id)).filter(filled);
		const [od, base, os] = [v('ODHERTEL'), v('HERTELBASE'), v('OSHERTEL')];
		if (od || os || base) rows.push({ label: `Hertel${base ? ` (base ${base})` : ''}`, od: od && `${od} mm`, os: os && `${os} mm` });
		// Neuro block (item 9): color, red desaturation, coins, NPA, NPC, accommodation, amplitudes, stereopsis.
		rows.push(...neuro.additional);
		const title = neuro.orthophoric ? 'Additional findings (orthophoric)' : 'Additional findings';
		return rows.length || neuro.orthophoric ? [{ title, rows, comments: '' }] : [];
	}
}
