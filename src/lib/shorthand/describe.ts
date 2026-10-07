// Plain words for a shorthand code in the page language ("RC" -> "Conjunctiva, right eye"), shared by
// the bar's suggestions and the keyboard help sheet so both always say the same thing.

import { FIELD_BY_ID, ROW_LABEL_KEY, SECTION_DEF, fieldLabel, sectionLabel } from '#lib/exam/catalog.ts';
import { ISSUE_TYPE_KEYS } from '#lib/history/lists.ts';
import type { MessageKey } from '#lib/i18n/catalog.ts';
import { glossary } from '#lib/i18n/glossary.ts';
import type { Params } from '#lib/i18n/translate.ts';
import type { CodeEntry } from './suggest.ts';

type T = (key: MessageKey, params?: Params) => string;

const EYE_KEY: Record<string, MessageKey> = { OD: 'keys.eyeRight', OS: 'keys.eyeLeft', OU: 'keys.eyeBoth' };

/** "Conjunctiva, both eyes" for row fields; the field's own screen label otherwise. */
export function describeFields(fields: readonly string[], t: T): string {
	const defs = fields.map((id) => FIELD_BY_ID.get(id));
	if (!defs.length || defs.some((d) => !d)) return fields.join(' + ');
	// Group by row, in order; a row of the OD/OS grid gets its name plus which eyes.
	const groups: { row: string; section: string; ids: string[]; eyes: Set<string> }[] = [];
	for (const d of defs) {
		const g = groups.find((x) => x.row === d!.row && x.section === d!.section);
		if (g) {
			g.ids.push(d!.id);
			g.eyes.add(d!.eye);
		} else groups.push({ row: d!.row, section: d!.section, ids: [d!.id], eyes: new Set([d!.eye]) });
	}
	const eyeWord = (eyes: Set<string>) => t(EYE_KEY[eyes.size > 1 || eyes.has('OU') ? 'OU' : [...eyes][0]]);
	const parts = groups.map((g) => {
		const rowKey = ROW_LABEL_KEY[g.row];
		const def = FIELD_BY_ID.get(g.ids[0])!;
		if (rowKey && SECTION_DEF.has(def.section) && def.row !== 'HERTEL' && def.eye !== 'OU') return { name: t(rowKey), eyes: g.eyes };
		// Section-module fields carry the eye in their own label ("Applanation OD"); a pair that differs
		// only by OD/OS is said once with "both eyes".
		if (g.ids.length === 2) {
			const [a, b] = g.ids.map((id) => fieldLabel(id, t));
			const strip = (s: string, eye: string) => s.replace(new RegExp(`\\s*\\b${eye}\\b\\s*`), ' ').trim();
			if (a !== b && strip(a, 'OD') === strip(b, 'OS')) return { name: strip(a, 'OD'), eyes: new Set(['OD', 'OS']) };
		}
		return { name: g.ids.map((id) => fieldLabel(id, t)).join(' + '), eyes: null };
	});
	// Several rows writing the same eyes (4XL: upper and lower lids) share one eye word.
	const eyes = parts.every((p) => p.eyes) ? parts.map((p) => eyeWord(p.eyes!)) : null;
	if (eyes && eyes.every((e) => e === eyes[0]))
		return t('keys.fieldEye', { field: parts.map((p) => p.name).join(' + '), eye: eyes[0] });
	return parts.map((p) => (p.eyes ? t('keys.fieldEye', { field: p.name, eye: eyeWord(p.eyes) }) : p.name)).join(' + ');
}

/** Plain words for any code: fields it writes, the command it runs, or the history list it adds to. */
export function describeCode(e: CodeEntry, t: T): string {
	if (e.kind === 'command' && e.command) {
		const { kind, sections } = e.command;
		const names = sections === 'all' ? '' : sections.map((s) => sectionLabel(s, t)).join(', ');
		if (kind === 'defaults') return sections === 'all' ? t('exam.shNormalAll') : t('exam.shNormal', { sections: names });
		return sections === 'all' ? t('exam.shClearAll') : t('exam.shClear', { sections: names });
	}
	if (e.kind === 'issue' && e.issue) return t('keys.addsToList', { list: t(ISSUE_TYPE_KEYS[e.issue].label) });
	if (e.kind === 'special') return t('keys.hertelCode');
	return describeFields(e.fields, t);
}

/**
 * describeCode plus the plain name of an abbreviated field from the glossary, so "MRD" also says what
 * MRD is (and typing "margin" finds it): "MRD, both eyes (margin reflex distance)".
 */
export function describeCodePlain(e: CodeEntry, t: T): string {
	const d = describeCode(e, t);
	if (e.kind === 'command' || e.kind === 'issue') return d;
	const head = d.split(/[,،，]/)[0].trim();
	const plain = glossary(head, t);
	return plain && plain.toLocaleLowerCase() !== head.toLocaleLowerCase() ? `${d} (${plain})` : d;
}
