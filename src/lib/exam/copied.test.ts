import { describe, expect, it } from 'vitest';
import { stateLabel } from './copied.ts';
import { EN } from '#lib/i18n/catalog.ts';
import { createTranslator } from '#lib/i18n/translate.ts';

const { t } = createTranslator('en', EN, EN);

describe('field state in the accessible name', () => {
	it('keeps the visible label first and adds the state', () => {
		expect(stateLabel(t, 'Conjunctiva OD', {})).toBe('Conjunctiva OD');
		expect(stateLabel(t, 'Conjunctiva OD', { isDefault: true })).toBe('Conjunctiva OD (default)');
		expect(stateLabel(t, 'Conjunctiva OD', { copied: true, date: 'Sep 14, 2025' })).toBe('Conjunctiva OD (copied from Sep 14, 2025)');
		expect(stateLabel(t, 'Conjunctiva OD', { copied: true })).toBe('Conjunctiva OD (copied)');
	});
});
