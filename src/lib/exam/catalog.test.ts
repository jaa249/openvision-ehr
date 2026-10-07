// Every catalog id has a screen label (D48), so a new section or row cannot ship untranslated.
import { describe, expect, it } from 'vitest';
import { EN } from '#lib/i18n/catalog.ts';
import { createTranslator } from '#lib/i18n/translate.ts';
import { EXAM_SECTIONS, FIELDS, ROW_LABEL_KEY, SECTIONS, SECTION_LABEL_KEY, SECTION_TITLE_KEY, fieldLabel, rowLabel, sectionLabel, sectionTitle, type RowSectionId } from './catalog.ts';
import { ZONE_LABEL, ZONE_LABEL_KEY } from '#lib/drawings/bases.ts';

const t = createTranslator('en', EN, EN).t;

describe('catalog screen labels', () => {
	it('every section has a rail label that matches the English constant', () => {
		for (const s of SECTIONS) {
			expect(EN[SECTION_LABEL_KEY[s.id]], s.id).toBeDefined();
			expect(sectionLabel(s.id, t)).toBe(s.label);
		}
	});

	it('every row section has title, short title and comments keys; English matches', () => {
		for (const sec of EXAM_SECTIONS) {
			const k = SECTION_TITLE_KEY[sec.id as RowSectionId];
			expect(k, sec.id).toBeDefined();
			for (const key of Object.values(k)) expect(EN[key], key).toBeDefined();
			expect(sectionTitle(sec, t)).toBe(sec.title);
			expect(sectionTitle(sec, t, true)).toBe(sec.title.split(' (')[0]);
		}
	});

	it('every row has a label key; English matches', () => {
		for (const sec of EXAM_SECTIONS) {
			for (const row of sec.rows) {
				expect(ROW_LABEL_KEY[row.id], row.id).toBeDefined();
				expect(EN[ROW_LABEL_KEY[row.id]], row.id).toBeDefined();
				expect(rowLabel(row, t)).toBe(row.label);
			}
		}
	});

	it('screen field labels of the row sections equal the English labels', () => {
		const ids = new Set(EXAM_SECTIONS.map((s) => s.id));
		for (const f of FIELDS.filter((f) => ids.has(f.section))) expect(fieldLabel(f.id, t), f.id).toBe(f.label);
	});

	it('every field of the section modules is translated, and its English equals the label', () => {
		const ids = new Set(EXAM_SECTIONS.map((s) => s.id));
		const seen: string[] = [];
		const spy = ((key: Parameters<typeof t>[0], params?: Parameters<typeof t>[1]) => (seen.push(key), t(key, params))) as typeof t;
		for (const f of FIELDS.filter((f) => !ids.has(f.section))) {
			seen.length = 0;
			expect(fieldLabel(f.id, spy), f.id).toBe(f.label);
			expect(seen.length, `${f.id} has a message`).toBeGreaterThan(0);
		}
	});

	it('every drawing zone has a label key; English matches', () => {
		for (const [zone, label] of Object.entries(ZONE_LABEL)) {
			const key = ZONE_LABEL_KEY[zone as keyof typeof ZONE_LABEL_KEY];
			expect(key, zone).toBeDefined();
			expect(t(key)).toBe(label);
		}
	});
});
