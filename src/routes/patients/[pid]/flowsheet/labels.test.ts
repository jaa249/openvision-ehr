// Every flow sheet label constant has a translation key (D48).
import { describe, expect, it } from 'vitest';
import { TARGET_SOURCE_LABEL } from '#lib/exam/sections/glaucoma.ts';
import { EN } from '#lib/i18n/catalog.ts';
import { MARKER_KIND_KEY, METHOD_LONG_KEY, METHOD_SHORT_KEY, TARGET_SOURCE_KEY } from './labels.ts';

describe('flow sheet label keys', () => {
	it('every target source has a key whose English is TARGET_SOURCE_LABEL', () => {
		for (const [src, label] of Object.entries(TARGET_SOURCE_LABEL)) expect(EN[TARGET_SOURCE_KEY[src as keyof typeof TARGET_SOURCE_KEY]], src).toBe(label);
	});

	it('marker kinds and IOP methods have English messages', () => {
		expect(Object.values(MARKER_KIND_KEY).map((k) => EN[k])).toEqual(['VF', 'OCT', 'Gonio']);
		expect([METHOD_SHORT_KEY.AP, METHOD_SHORT_KEY.TPN, METHOD_LONG_KEY.AP, METHOD_LONG_KEY.TPN].map((k) => EN[k])).toEqual([
			'App',
			'Tpn',
			'applanation',
			'Tono-Pen'
		]);
	});
});
