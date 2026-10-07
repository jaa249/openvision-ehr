// Printed exam report: which sections and rows appear (docs/spec/BEHAVIOR.md §13.2).
// Pure, so the single and mass-print pages render the same thing and tests can pin the rules.

import { ROW_LABEL_KEY, SECTION_DEF, type SectionId } from './catalog.ts';
import { workupReport } from './sections/workup.ts';
import { refractionReport } from './sections/refraction.ts';
import { historyReport } from './sections/history.ts';
import { neuroReport } from './sections/neuro.ts';
import { dilationReport } from './sections/dilation.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import type { Params } from '#lib/i18n/translate.ts';
import { english, type Translate } from '#lib/coding/english.ts';

/** A heading or label in the reader's language (D48); `label` / `title` keep the English. */
export interface ReportText {
	key: MessageKey;
	params?: Params;
}

export interface ReportRow {
	label: string;
	od: string;
	os: string;
	/** Translated label, when the row has one; otherwise `label` prints as is. */
	labelText?: ReportText;
}
export interface ReportSection {
	/** English title: also what drawings and tests match on. */
	title: string;
	/** Translated title, when the section has one; otherwise `title` prints as is. */
	titleText?: ReportText;
	/** OD | label | OS rows (the exam-section layout). */
	rows: ReportRow[];
	comments: string;
	/** One-line result printed as plain text, e.g. "Full to CF OU" (no "Comments:" label). */
	summary?: string;
	/** Optional free-form table, e.g. refraction (Sph/Cyl/Axis...). Printed after the rows. */
	table?: { head: string[]; body: string[][] };
}

/** Core rows print whenever their section prints; extra rows only when filled (§13.2 items 7, 8, 10). */
const LAYOUT: { section: SectionId; title: string; titleKey: MessageKey; core: string[]; extra: string[] }[] = [
	{ section: 'EXT', title: 'External', titleKey: 'report.sectionExternal', core: ['BROW', 'UL', 'LL', 'MCT'], extra: ['ADNEXA'] },
	{
		section: 'ANTSEG',
		title: 'Anterior segment',
		titleKey: 'report.sectionAnteriorSegment',
		core: ['CONJ', 'CORNEA', 'AC', 'LENS', 'IRIS'],
		extra: ['GONIO', 'KTHICKNESS', 'SCHIRMER1', 'SCHIRMER2', 'TBUT']
	},
	{
		section: 'RETINA',
		title: 'Retina',
		titleKey: 'report.sectionRetina',
		core: ['DISC', 'CUP', 'MACULA', 'VESSELS', 'VITREOUS', 'PERIPH'],
		extra: ['CMT']
	}
];

/** "Additional findings": External measurements, each only when filled (§13.2 item 9, with the MRD/fissure FIX). */
const ADDITIONAL = ['LF', 'MRD', 'VFISSURE', 'CAROTID', 'TEMPART', 'CNV', 'CNVII'];

/**
 * The report's sections. `title` and `label` are English (drawings and tests match on them); titleText,
 * labelText and the words in summaries and tables are in `t`'s language (D48, English by default).
 * Recorded values always print as entered.
 */
export function buildReport(findings: Findings, t: Translate = english): ReportSection[] {
	const v = (id: string) => findings[id]?.value?.trim() ?? '';
	const row = (section: SectionId, id: string): ReportRow | null => {
		const r = SECTION_DEF.get(section)?.rows.find((x) => x.id === id);
		if (!r) return null;
		const unit = r.measure ? ` ${r.measure}` : '';
		const fmt = (s: string) => (s ? s + unit : '');
		const key = ROW_LABEL_KEY[r.id];
		return { label: r.label, ...(key ? { labelText: { key } } : {}), od: fmt(v(r.od)), os: fmt(v(r.os)) };
	};
	const filled = (r: ReportRow | null): r is ReportRow => !!r && !!(r.od || r.os);

	// HPI first (item 1); PMSFH is patient-level, so ExamReport prints it from PrintableEncounter (item 2).
	// Then workup (vision, IOP, pupils, fields), motility, and refraction (items 3-6).
	const neuro = neuroReport(findings, t);
	const out: ReportSection[] = [...historyReport(findings, t), ...workupReport(findings, t), ...neuro.strip, ...refractionReport(findings, t)];
	for (const l of LAYOUT) {
		// Dilation prints just before Retina (§13.2 item 10 "Dilation Time").
		if (l.section === 'RETINA') out.push(...dilationReport(findings, t));
		const sec = SECTION_DEF.get(l.section)!;
		const core = l.core.map((id) => row(l.section, id)).filter((r): r is ReportRow => !!r);
		const extra = l.extra.map((id) => row(l.section, id)).filter(filled);
		const comments = v(sec.comments.field);
		// A section prints when anything in it was recorded, for either eye (FIX: not OD-only).
		if (!core.some(filled) && !extra.length && !comments) {
			if (l.section === 'EXT') out.push(...additional());
			continue;
		}
		out.push({ title: l.title, titleText: { key: l.titleKey }, rows: [...core, ...extra], comments });
		if (l.section === 'EXT') out.push(...additional());
	}
	// Cover test and neuro comments after Retina (item 11).
	out.push(...neuro.after);
	return out;

	function additional(): ReportSection[] {
		const rows = ADDITIONAL.map((id) => row('EXT', id)).filter(filled);
		const [od, base, os] = [v('ODHERTEL'), v('HERTELBASE'), v('OSHERTEL')];
		if (od || os || base)
			rows.push({
				label: `Hertel${base ? ` (base ${base})` : ''}`,
				labelText: base ? { key: 'report.hertelBase', params: { base } } : { key: 'report.hertel' },
				od: od && `${od} mm`,
				os: os && `${os} mm`
			});
		// Neuro block (item 9): color, red desaturation, coins, NPA, NPC, accommodation, amplitudes, stereopsis.
		rows.push(...neuro.additional);
		const title = neuro.orthophoric ? 'Additional findings (orthophoric)' : 'Additional findings';
		const titleText: ReportText = { key: neuro.orthophoric ? 'report.additionalFindingsOrthophoric' : 'report.additionalFindings' };
		return rows.length || neuro.orthophoric ? [{ title, titleText, rows, comments: '' }] : [];
	}
}
