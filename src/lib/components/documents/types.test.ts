// Every document zone has a translated label (D48), equal to the English constant in English.
import { describe, expect, it } from 'vitest';
import { EN } from '#lib/i18n/catalog.ts';
import { DOC_ZONES, DOC_ZONE_LABEL, DOC_ZONE_LABEL_KEY } from './types.ts';

describe('document zone labels', () => {
	it('every zone has a key whose English is DOC_ZONE_LABEL', () => {
		for (const z of DOC_ZONES) expect(EN[DOC_ZONE_LABEL_KEY[z]], z).toBe(DOC_ZONE_LABEL[z]);
	});
});
