import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { getPrefs, PrefError, setPrefs } from './prefs.ts';
import { COVER_ZONE_KEYS, defaultPrefs, sanitizePrefs } from '#lib/prefs/keys.ts';
import { COVER_ZONES } from '#lib/exam/sections/neuro.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

describe('prefs', () => {
	it('new users get the §1.7 FIX defaults', () => {
		expect(getPrefs(db, 1)).toMatchObject({
			'exam.mode': 'qp',
			'refraction.W': true,
			'pmsfh.open': true,
			tooltips: true,
			'cover.zone': 'CCDIST',
			'retina.wide': true
		});
	});

	it('stores booleans as 1/0 and enums as their value, per user', () => {
		setPrefs(db, 1, { tooltips: false, cylinder: '-', 'cover.zone': 'SCNEAR' });
		expect(db.prepare('SELECT key, value FROM user_prefs WHERE user_id = 1 ORDER BY key').all()).toEqual([
			{ key: 'cover.zone', value: 'SCNEAR' },
			{ key: 'cylinder', value: '-' },
			{ key: 'tooltips', value: '0' }
		]);
		expect(getPrefs(db, 1)).toMatchObject({ tooltips: false, cylinder: '-', 'cover.zone': 'SCNEAR' });
		expect(getPrefs(db, 2)).toEqual(defaultPrefs());
	});

	it('refuses unknown keys and wrong types, all-or-nothing', () => {
		expect(() => setPrefs(db, 1, { nope: true })).toThrow(PrefError);
		expect(() => setPrefs(db, 1, { tooltips: 'Yes' })).toThrow(PrefError); // never translated words
		expect(() => setPrefs(db, 1, { tooltips: 1 })).toThrow(PrefError);
		expect(() => setPrefs(db, 1, { 'exam.mode': 'TEXT' })).toThrow(PrefError);
		expect(() => setPrefs(db, 1, { tooltips: false, cylinder: 'x' })).toThrow(PrefError);
		expect(() => setPrefs(db, 1, null)).toThrow(PrefError);
		expect(() => setPrefs(db, 1, {})).toThrow(PrefError);
		expect(getPrefs(db, 1).tooltips).toBe(true);
	});

	it('ignores stored rows outside the whitelist and corrupt values', () => {
		db.prepare("INSERT INTO user_prefs (user_id, key, value) VALUES (1, 'old.key', '1'), (1, 'tooltips', 'Yes')").run();
		expect(getPrefs(db, 1)).toEqual(defaultPrefs());
	});

	it('the browser fallback copy is sanitized the same way', () => {
		expect(sanitizePrefs({ tooltips: false, evil: 1, cylinder: 'x' })).toEqual({ tooltips: false });
		expect(sanitizePrefs(JSON.parse('{"__proto__": {"tooltips": false}}'))).toEqual({});
	});

	it('cover-test keys match the neuro section', () => {
		expect([...COVER_ZONE_KEYS]).toEqual(COVER_ZONES.map((z) => z.key));
	});
});
