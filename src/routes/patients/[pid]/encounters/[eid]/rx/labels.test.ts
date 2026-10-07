// Every Rx label constant has a translation key (D48), so a new lens type or method cannot ship untranslated.
import { describe, expect, it } from 'vitest';
import { METHOD_LABEL, RX_TYPES, rxTable } from '#lib/exam/sections/refraction.ts';
import { EN } from '#lib/i18n/catalog.ts';
import { METHOD_KEY, RX_TABLE_HEAD_KEY, RX_TYPE_KEY, rxTypeKey } from './labels.ts';

describe('Rx label keys', () => {
	it('every lens type and method has an English message equal to the constant', () => {
		for (const label of RX_TYPES) expect(EN[RX_TYPE_KEY[label]], label).toBe(label);
		for (const [kind, label] of Object.entries(METHOD_LABEL)) expect(EN[METHOD_KEY[kind as keyof typeof METHOD_KEY]], kind).toBe(label);
	});

	it('every rxTable() heading has a key', () => {
		const full = { ODADD: '+2.00', ODMIDADD: '+1.00' };
		for (const kind of ['MR', 'CTL'] as const) {
			for (const h of rxTable(kind, full).head) expect(EN[RX_TABLE_HEAD_KEY[h] ?? ''], `${kind} ${h}`).toBe(h);
		}
	});

	it('rxTypeKey reads the stored index', () => {
		expect(rxTypeKey('0')).toBe('rx.typeSingleVision');
		expect(rxTypeKey('3')).toBe('rx.typeProgressive');
		expect(rxTypeKey('')).toBeNull();
		expect(rxTypeKey('7')).toBeNull();
	});
});
