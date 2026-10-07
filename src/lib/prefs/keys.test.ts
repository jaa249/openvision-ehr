// Every pref and exam mode has a translated label (D48), so a new one cannot ship untranslated.
import { describe, expect, it } from 'vitest';
import { EXAM_MODES, EXAM_MODE_LABEL, EXAM_MODE_LABEL_KEY, PREF_KEYS, PREF_LABEL_KEY } from './keys.ts';
import { EN } from '#lib/i18n/catalog.ts';

describe('pref labels', () => {
	it('every exam mode has an English label and a message key that exists', () => {
		for (const m of EXAM_MODES) {
			expect(EXAM_MODE_LABEL[m], m).toBeTruthy();
			expect(EN[EXAM_MODE_LABEL_KEY[m]], m).toBe(EXAM_MODE_LABEL[m]);
		}
	});

	it('every pref key has a message key that exists', () => {
		for (const k of PREF_KEYS) expect(EN[PREF_LABEL_KEY[k]], k).toBeDefined();
		expect(Object.keys(PREF_LABEL_KEY).sort()).toEqual([...PREF_KEYS].sort());
	});
});
