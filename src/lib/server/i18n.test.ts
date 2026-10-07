// Translations on the server (D48): which language a request gets, the practice default, the migration.
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, seedDemo, type DB } from './db.ts';
import { applySignInLanguage, langCookieOptions, loadCatalogSync, resolveLocale, serverT } from './i18n.ts';
import { getPrefs, setPrefs } from './prefs.ts';
import { getDefaultLocale, setDefaultLocale, SettingsError } from './settings.ts';
import { searchAudit } from './security_audit.ts';
import { setupFirstAdmin } from './users.ts';
import { EN } from '#lib/i18n/catalog.ts';

const TODAY = '2026-10-07';
const DR = 1;
const ADMIN = 3;
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
});

describe('resolveLocale', () => {
	it('a signed-in user on "practice" gets the practice default', () => {
		expect(getPrefs(db, DR).locale).toBe('practice');
		expect(resolveLocale(db, DR, 'es-MX,es;q=0.9')).toBe('en');
		setDefaultLocale(db, 'es', ADMIN);
		expect(resolveLocale(db, DR, null)).toBe('es');
	});

	it("a user's own choice wins over the practice default and the browser", () => {
		setPrefs(db, DR, { locale: 'es' });
		expect(resolveLocale(db, DR, 'en-US')).toBe('es');
		setDefaultLocale(db, 'es', ADMIN);
		setPrefs(db, DR, { locale: 'en' });
		expect(resolveLocale(db, DR, 'es')).toBe('en');
	});

	it('signed out: the practice default (the browser language is not used once set up)', () => {
		expect(resolveLocale(db, null, 'es')).toBe('en');
		setDefaultLocale(db, 'es', ADMIN);
		expect(resolveLocale(db, null, 'en-US')).toBe('es');
	});

	it("first-run setup (no users) follows the browser's Accept-Language, else English", () => {
		const fresh = openDatabase(':memory:');
		expect(resolveLocale(fresh, null, 'es-AR,es;q=0.9,en;q=0.5')).toBe('es');
		expect(resolveLocale(fresh, null, 'de-DE')).toBe('en');
		expect(resolveLocale(fresh, null, null)).toBe('en');
	});

	it('an unknown stored value reads as English', () => {
		db.prepare("UPDATE practice SET default_locale = 'xx' WHERE id = 1").run();
		expect(getDefaultLocale(db)).toBe('en');
		expect(resolveLocale(db, null, 'es')).toBe('en');
		db.prepare("INSERT INTO user_prefs (user_id, key, value) VALUES (?, 'locale', 'klingon')").run(DR);
		expect(getPrefs(db, DR).locale).toBe('practice');
		expect(resolveLocale(db, DR, null)).toBe('en');
	});
});

describe('resolveLocale with the ov_lang cookie (sign-in page language menu)', () => {
	it('signed out: a valid cookie wins over the practice default', () => {
		setDefaultLocale(db, 'es', ADMIN);
		expect(resolveLocale(db, null, 'es', 'en')).toBe('en');
		setDefaultLocale(db, 'en', ADMIN);
		expect(resolveLocale(db, null, null, 'es')).toBe('es');
	});

	it('an invalid or missing cookie is ignored', () => {
		setDefaultLocale(db, 'es', ADMIN);
		for (const bad of ['xx', 'ES', 'es-MX', '', ' es', null, undefined]) expect(resolveLocale(db, null, 'en', bad)).toBe('es');
	});

	it('never overrides a signed-in user (own choice or practice default)', () => {
		expect(resolveLocale(db, DR, null, 'es')).toBe('en');
		setPrefs(db, DR, { locale: 'es' });
		expect(resolveLocale(db, DR, null, 'en')).toBe('es');
	});

	it('first-run setup: a valid cookie, else the browser language, else English', () => {
		const fresh = openDatabase(':memory:');
		expect(resolveLocale(fresh, null, 'en-US', 'es')).toBe('es');
		expect(resolveLocale(fresh, null, 'es-MX', 'xx')).toBe('es');
		expect(resolveLocale(fresh, null, null, 'nope')).toBe('en');
	});

	it('cookie options: whole site, Lax, httpOnly, one year', () => {
		expect(langCookieOptions()).toMatchObject({ path: '/', sameSite: 'lax', httpOnly: true, maxAge: 31536000 });
	});
});

describe('applySignInLanguage (the sign-in rule)', () => {
	it('saves the chosen language when the user never chose one and changed the menu', () => {
		expect(applySignInLanguage(db, DR, 'es', true)).toBe('es');
		expect(getPrefs(db, DR).locale).toBe('es');
	});

	it('does not save when the menu was not changed on the sign-in page', () => {
		setDefaultLocale(db, 'es', ADMIN);
		expect(applySignInLanguage(db, DR, 'en', false)).toBe('es'); // the practice default
		expect(getPrefs(db, DR).locale).toBe('practice');
	});

	it('keeps an explicit choice', () => {
		setPrefs(db, DR, { locale: 'en' });
		expect(applySignInLanguage(db, DR, 'es', true)).toBe('en');
		expect(getPrefs(db, DR).locale).toBe('en');
	});

	it('ignores an invalid language', () => {
		for (const bad of ['xx', '', null, undefined, 'practice']) {
			expect(applySignInLanguage(db, DR, bad, true)).toBe('en');
			expect(getPrefs(db, DR).locale).toBe('practice');
		}
	});
});

describe('practice default language', () => {
	it('is validated and audited as a practice setting', () => {
		expect(() => setDefaultLocale(db, 'xx', ADMIN)).toThrow(SettingsError);
		expect(setDefaultLocale(db, 'es', ADMIN)).toBe('es');
		const row = searchAudit(db, { action: 'settings.practice' }).rows[0];
		expect(row.userId).toBe(ADMIN);
		expect(row.detail).toContain('defaultLocale');
	});

	it('first-run setup saves the chosen language with the first admin', async () => {
		const fresh = openDatabase(':memory:');
		const input = { username: 'boss', displayName: 'Office Manager', password: 'a long enough passphrase', confirm: 'a long enough passphrase' };
		await expect(setupFirstAdmin(fresh, { ...input, locale: 'xx' })).rejects.toMatchObject({ errors: { locale: expect.any(String) } });
		await setupFirstAdmin(fresh, { ...input, locale: 'es' });
		expect(getDefaultLocale(fresh)).toBe('es');
	});
});

describe('serverT', () => {
	it('translates with English fallback; an unknown locale is English', () => {
		expect(serverT('es').t('auth.enterUsername')).toBe('Escriba su nombre de usuario.');
		expect(serverT('en').t('auth.enterUsername')).toBe('Enter your username.');
		expect(serverT(undefined).t('auth.enterUsername')).toBe('Enter your username.');
		expect(serverT('es').t('common.appName')).toBe('OpenVision');
		expect(loadCatalogSync('en')).toBe(EN);
		expect(loadCatalogSync('es')['shell.signOut']).toBe('Cerrar sesión');
	});
});

describe('migration (D48)', () => {
	it('adds practice.default_locale, English for existing installs', () => {
		const probe = new DatabaseSync(':memory:');
		migrate(probe);
		const latest = (probe.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }).v;
		const raw = new DatabaseSync(':memory:');
		migrate(raw, latest - 1);
		const cols = (d: DatabaseSync) => (d.prepare('PRAGMA table_info(practice)').all() as { name: string }[]).map((c) => c.name);
		expect(cols(raw)).not.toContain('default_locale');
		raw.prepare("UPDATE practice SET name = 'Old Practice' WHERE id = 1").run();
		migrate(raw);
		expect(raw.prepare('SELECT name, default_locale FROM practice WHERE id = 1').get()).toEqual({ name: 'Old Practice', default_locale: 'en' });
	});
});
