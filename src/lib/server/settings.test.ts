import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { getPractice, normalsSections, resetNormals, saveNormals, SettingsError, updatePractice } from './settings.ts';
import { getUserDefaults } from './exam.ts';
import { searchAudit } from './security_audit.ts';
import { SEED_DEFAULTS } from '#lib/exam/catalog.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});
const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof SettingsError) return e.errors;
		throw e;
	}
	return null;
};

describe('practice', () => {
	it('saves trimmed values and audits before/after', () => {
		updatePractice(db, { name: '  Bright Eyes  ', address: '1 Lane', phone: '(555) 010-0199', fax: '' }, 3);
		expect(getPractice(db)).toEqual({ name: 'Bright Eyes', address: '1 Lane', phone: '(555) 010-0199', fax: '' });
		const row = searchAudit(db, { action: 'settings.practice' }).rows[0];
		expect(row.userId).toBe(3);
		expect(row.detail).toContain('Bright Eyes');
	});
	it('validates', () => {
		const errs = errorsOf(() => updatePractice(db, { name: '', address: 'x'.repeat(201), phone: 'call me', fax: '1' }, 3))!;
		expect(Object.keys(errs).sort()).toEqual(['address', 'name', 'phone']);
		expect(getPractice(db).name).toBe('Example Eye Care (demo)');
	});
});

describe('normal values editor', () => {
	it('groups catalog fields by section, with starter values', () => {
		const secs = normalsSections(db, 1);
		expect(secs.map((s) => s.id)).toEqual(['IOP', 'EXT', 'ANTSEG', 'RETINA', 'NEURO']);
		const antseg = secs.find((s) => s.id === 'ANTSEG')!;
		expect(antseg.fields.find((f) => f.id === 'ODCONJ')).toMatchObject({ value: 'quiet', seed: 'quiet' });
		expect(antseg.fields.find((f) => f.id === 'ODGONIO')).toMatchObject({ value: '', seed: null });
	});

	it('saves only catalog fields of that section; blank removes', () => {
		saveNormals(db, 1, 'ANTSEG', { ODCONJ: 'white and quiet', ODGONIO: 'open to CB', OSCONJ: '' });
		const d = getUserDefaults(db, 1);
		expect(d.ODCONJ).toBe('white and quiet');
		expect(d.ODGONIO).toBe('open to CB');
		expect('OSCONJ' in d).toBe(false);
		expect(errorsOf(() => saveNormals(db, 1, 'ANTSEG', { password_hash: 'x' }))?.form).toBeTruthy();
		expect(errorsOf(() => saveNormals(db, 1, 'ANTSEG', { RUL: 'from another section' }))?.form).toBeTruthy();
		expect(errorsOf(() => saveNormals(db, 1, 'ANTSEG', { ODCONJ: 'x'.repeat(5000) }))?.ODCONJ).toBeTruthy();
		expect(getUserDefaults(db, 2).ODCONJ).toBe('quiet');
	});

	it('resets one section or everything to the starter values', () => {
		saveNormals(db, 1, 'ANTSEG', { ODCONJ: 'mine' });
		saveNormals(db, 1, 'EXT', { RUL: 'mine too' });
		resetNormals(db, 1, 'ANTSEG');
		expect(getUserDefaults(db, 1).ODCONJ).toBe('quiet');
		expect(getUserDefaults(db, 1).RUL).toBe('mine too');
		resetNormals(db, 1);
		expect(getUserDefaults(db, 1)).toEqual(SEED_DEFAULTS);
	});
});
