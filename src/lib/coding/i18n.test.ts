// Every coding label constant has a message key (D48), so a new code, level, family or modifier
// cannot ship untranslated; and the English translation of each equals the English constant.
import { describe, expect, it } from 'vitest';
import { EN } from '#lib/i18n/catalog.ts';
import {
	FAMILIES,
	FAMILY_HELP_KEY,
	FAMILY_LABEL_KEY,
	LEVEL_LABEL,
	LEVEL_LABEL_KEY,
	MODIFIER_59_HINT,
	MODIFIER_59_HINT_KEY,
	MODIFIER_HELP_KEY,
	MODIFIER_LABEL_KEY,
	SENSORIMOTOR,
	SENSORIMOTOR_LABEL_KEY,
	VISIT_CODES,
	VISIT_CODE_LABEL_KEY,
	VISIT_MODIFIERS,
	type VisitLevel
} from './codes.ts';
import { CORE_SECTIONS, OTHER_SECTIONS, SECTION_LABEL_KEY, patientStatus, patientReason } from './visit.ts';
import { english } from './english.ts';

describe('coding label keys', () => {
	it('every visit code, family, level and modifier has a key whose English is the constant', () => {
		for (const c of VISIT_CODES) expect(EN[VISIT_CODE_LABEL_KEY[c.code]], c.code).toBe(c.label);
		for (const f of FAMILIES) {
			expect(EN[FAMILY_LABEL_KEY[f.id]], f.id).toBe(f.label);
			expect(EN[FAMILY_HELP_KEY[f.id]], f.id).toBe(f.help);
		}
		for (const [level, label] of Object.entries(LEVEL_LABEL)) expect(EN[LEVEL_LABEL_KEY[level as VisitLevel]], level).toBe(label);
		for (const m of VISIT_MODIFIERS) {
			expect(EN[MODIFIER_LABEL_KEY[m.code]], m.code).toBe(m.label);
			expect(EN[MODIFIER_HELP_KEY[m.code]], m.code).toBe(m.help);
		}
		expect(EN[SENSORIMOTOR_LABEL_KEY]).toBe(SENSORIMOTOR.label);
		expect(EN[MODIFIER_59_HINT_KEY]).toBe(MODIFIER_59_HINT);
	});

	it('every core and other exam section has a key whose English is the constant', () => {
		for (const s of [...CORE_SECTIONS, ...OTHER_SECTIONS]) {
			const key = SECTION_LABEL_KEY[s.id];
			expect(key, s.id).toBeDefined();
			expect(EN[key!], s.id).toBe(s.label);
		}
	});

	it('the patient-status reason carries its key, and the English text matches it', () => {
		const r = patientStatus({ date: '2026-10-06', providerId: 1 }, [{ date: '2025-09-14', providerId: 1 }]);
		expect(r.reason).toBe('Seen by this provider on 2025-09-14, within the past 3 years.');
		expect(r.reasonKey).toBe('codes.reasonEstablished');
		expect(patientReason(r)).toBe(r.reason);
		expect(patientReason(r, (k) => `[${k}]`)).toBe('[codes.reasonEstablished]');
		expect(patientReason({ status: 'new', reason: 'Plain.', lastVisit: null })).toBe('Plain.');
		expect(english('codes.finderFound', { count: 1 })).toBe('1 code found.');
	});
});
