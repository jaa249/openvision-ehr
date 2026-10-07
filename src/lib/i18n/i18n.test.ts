// Translations (D48): the translator, locale matching, and the integrity of every message file.
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from './translate.ts';
import { DEFAULT_LOCALE, LOCALES, isLocale, matchAcceptLanguage } from './locales.ts';
import { EN, loadCatalog } from './catalog.ts';

const EN_TEST = {
	'auth.signIn': 'Sign in',
	'auth.hello': 'Hello, {name}.',
	'visits.count_one': '{count} visit',
	'visits.count_other': '{count} visits',
	'auth.step': 'Type {command} and press Enter.'
};

describe('createTranslator', () => {
	const en = createTranslator('en', EN_TEST, EN_TEST);
	const es = createTranslator('es', { 'auth.signIn': 'Iniciar sesión', 'visits.count_one': '{count} visita', 'visits.count_other': '{count} visitas' }, EN_TEST);

	it('looks up, falls back to English, interpolates', () => {
		expect(en.t('auth.signIn' as never)).toBe('Sign in');
		expect(es.t('auth.signIn' as never)).toBe('Iniciar sesión');
		expect(es.t('auth.hello' as never, { name: 'Ana' })).toBe('Hello, Ana.');
	});

	it('plurals by the language rules, count formatted for the locale', () => {
		expect(en.t('visits.count' as never, { count: 1 })).toBe('1 visit');
		expect(en.t('visits.count' as never, { count: 0 })).toBe('0 visits');
		expect(en.t('visits.count' as never, { count: 1200 })).toBe('1,200 visits');
		expect(es.t('visits.count' as never, { count: 1 })).toBe('1 visita');
		expect(es.t('visits.count' as never, { count: 3 })).toBe('3 visitas');
	});

	it('a missing plural form uses _other, then English', () => {
		const ar = createTranslator('en', { 'visits.count_other': '{count} X' }, EN_TEST);
		expect(ar.t('visits.count' as never, { count: 1 })).toBe('1 X');
		const none = createTranslator('es', {}, EN_TEST);
		expect(none.t('visits.count' as never, { count: 2 })).toBe('2 visits');
	});

	it('an unknown key renders as the key (never throws) and warns once', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(en.t('nope.missing' as never)).toBe('nope.missing');
		en.t('nope.missing' as never);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it('a placeholder without a param stays visible', () => {
		expect(en.t('auth.hello' as never)).toBe('Hello, {name}.');
	});

	it('parts(): absent params become slots', () => {
		expect(en.parts('auth.step' as never)).toEqual([{ text: 'Type ' }, { slot: 'command' }, { text: ' and press Enter.' }]);
		expect(en.parts('auth.hello' as never, { name: 'Ana' })).toEqual([{ text: 'Hello, Ana.' }]);
	});

	it('list(): joins with the language own "and"', () => {
		expect(en.list(['ICD-10-CM', 'ICD-11'])).toBe('ICD-10-CM and ICD-11');
		expect(en.list(['A', 'B', 'C'])).toBe('A, B, and C');
		expect(en.list(['A'])).toBe('A');
		expect(en.list([])).toBe('');
		expect(es.list(['ICD-10-CM', 'CIE-11'])).toBe('ICD-10-CM y CIE-11');
		// Spanish grammar: "y" becomes "e" before an i sound.
		expect(es.list(['ICD-10-CM', 'ICD-11'])).toBe('ICD-10-CM e ICD-11');
	});

	it('dates use the translator locale; a date-only string never shifts a day', () => {
		expect(en.date('2026-10-07')).toBe('Oct 7, 2026');
		expect(es.date('2026-10-07')).toMatch(/7.*oct.*2026/i);
		expect(en.longDate('2026-01-01')).toBe('January 1, 2026');
		expect(en.number(1234.5)).toBe('1,234.5');
		expect(en.dir).toBe('ltr');
	});
});

describe('locales', () => {
	it('English is the source and the default', () => {
		expect(DEFAULT_LOCALE).toBe('en');
		expect(LOCALES.find((l) => l.code === 'en')?.status).toBe('source');
		expect(LOCALES.every((l) => l.dir === 'ltr' || l.dir === 'rtl')).toBe(true);
		expect(isLocale('es')).toBe(true);
		expect(isLocale('xx')).toBe(false);
		expect(isLocale(undefined)).toBe(false);
	});

	it('matches Accept-Language by tag, primary subtag and q-value', () => {
		expect(matchAcceptLanguage('es-MX,es;q=0.9,en;q=0.8')).toBe('es');
		expect(matchAcceptLanguage('fr-CA, fr;q=0.9, en;q=0.5')).toBe('fr');
		expect(matchAcceptLanguage('de-CH, de;q=0.9, en;q=0.5')).toBe('en');
		expect(matchAcceptLanguage('en;q=0.2, es;q=0.9')).toBe('es');
		expect(matchAcceptLanguage('de, ja')).toBeNull();
		expect(matchAcceptLanguage('')).toBeNull();
		expect(matchAcceptLanguage(undefined)).toBeNull();
		expect(matchAcceptLanguage('*')).toBeNull();
	});
});

// ---------------------------------------------------------------- the real message files

const ROOT = fileURLToPath(new URL('./messages/', import.meta.url));
const NAMESPACES = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory());
const read = (ns: string, locale: string): Record<string, unknown> | null => {
	try {
		return JSON.parse(readFileSync(join(ROOT, ns, `${locale}.json`), 'utf8'));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw e;
	}
};
const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z0-9]+)\}/g)].map((m) => m[1]).sort();
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe('message files', () => {
	it('every namespace from the spec exists with an en.json', () => {
		for (const ns of ['common', 'auth', 'shell', 'settings', 'patients', 'visits', 'exam', 'sections', 'plan', 'codes', 'report', 'rx', 'documents', 'flowsheet', 'drawing', 'catalog', 'server']) {
			expect(read(ns, 'en'), ns).not.toBeNull();
		}
	});

	it('keys are camelCase without dots; values are non-empty strings without HTML', () => {
		for (const ns of NAMESPACES) {
			for (const l of LOCALES) {
				const file = read(ns, l.code);
				if (!file) continue;
				for (const [k, v] of Object.entries(file)) {
					expect(k, `${ns}/${l.code}`).toMatch(/^[a-z][A-Za-z0-9]*(_(zero|one|two|few|many|other))?$/);
					expect(typeof v, `${ns}.${k}`).toBe('string');
					expect((v as string).trim(), `${ns}.${k}`).not.toBe('');
					expect(v as string, `${ns}.${k} (${l.code})`).not.toMatch(/<\/?[a-z][^>]*>/i);
				}
			}
		}
	});

	it('English defines _one and _other for every plural', () => {
		for (const ns of NAMESPACES) {
			const en = read(ns, 'en')!;
			const bases = new Set(Object.keys(en).filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')));
			for (const b of bases) {
				expect(en, `${ns}.${b}_one`).toHaveProperty(`${b}_one`);
				expect(en, `${ns}.${b}_other`).toHaveProperty(`${b}_other`);
			}
		}
	});

	it('translations only use English keys and the same placeholders', () => {
		for (const ns of NAMESPACES) {
			const en = read(ns, 'en')!;
			for (const l of LOCALES.filter((x) => x.code !== 'en')) {
				const file = read(ns, l.code) ?? {};
				for (const [k, v] of Object.entries(file)) {
					const base = k.replace(PLURAL, '');
					const enKey = k in en ? k : `${base}_other`;
					expect(en, `${ns}.${k} (${l.code}) is not an English key`).toHaveProperty(enKey);
					// A plural form may leave out {count} ("one file", Arabic "ملفان" = two files); any other placeholder must match.
					const want = placeholders(en[enKey] as string).filter((p) => p !== 'count' || !PLURAL.test(k));
					expect(placeholders(v as string).filter((p) => p !== 'count' || !PLURAL.test(k)), `${ns}.${k} (${l.code})`).toEqual(want);
				}
			}
		}
	});

	it('EN has every English key with its namespace, and loadCatalog serves each locale', async () => {
		for (const ns of NAMESPACES) for (const k of Object.keys(read(ns, 'en')!)) expect(EN[`${ns}.${k}`], `${ns}.${k}`).toBeDefined();
		expect(await loadCatalog('en')).toBe(EN);
		const es = await loadCatalog('es');
		for (const ns of NAMESPACES) for (const k of Object.keys(read(ns, 'es') ?? {})) expect(es[`${ns}.${k}`]).toBeDefined();
	});
});

// ---------------------------------------------------------------- keys used in the source exist

const SRC = fileURLToPath(new URL('../../', import.meta.url));
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) return f === 'messages' || f === 'node_modules' ? [] : sourceFiles(p);
		return /\.(svelte|ts)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
	});
}

describe('source', () => {
	it('every literal t(...) / Msg key is in English (plural bases count)', () => {
		const missing: string[] = [];
		for (const file of sourceFiles(SRC)) {
			const text = readFileSync(file, 'utf8');
			const used = [
				...text.matchAll(/\bt\(\s*'([a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*)'/g),
				...text.matchAll(/<Msg\s[^>]*key="([a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*)"/g)
			].map((m) => m[1]);
			for (const k of used) if (!(k in EN) && !(`${k}_other` in EN)) missing.push(`${relative(SRC, file)}: ${k}`);
		}
		expect(missing).toEqual([]);
	});
});

describe('the four drafted languages (fr, zh, hi, ar)', () => {
	it('html tag, direction and Intl locale', async () => {
		const { localeTag, localeDir, intlLocale } = await import('./locales.ts');
		expect(localeTag('zh' as never)).toBe('zh-Hans');
		expect(localeDir('ar' as never)).toBe('rtl');
		expect(localeDir('hi' as never)).toBe('ltr');
		expect(intlLocale('ar' as never)).toBe('ar-u-nu-latn');
		expect(matchAcceptLanguage('zh-CN,zh;q=0.9')).toBe('zh');
		expect(matchAcceptLanguage('ar-EG')).toBe('ar');
	});

	it('Arabic numbers and dates use Western digits; plurals follow Arabic rules', () => {
		const ar = createTranslator('ar' as never, { 'visits.count_one': 'زيارة واحدة', 'visits.count_two': 'زيارتان', 'visits.count_few': '{count} زيارات', 'visits.count_other': '{count} زيارة' }, EN_TEST);
		expect(ar.number(1234)).toMatch(/^1.?234$/);
		expect(ar.date('2026-10-07')).toMatch(/2026/);
		expect(ar.t('visits.count' as never, { count: 2 })).toBe('زيارتان');
		expect(ar.t('visits.count' as never, { count: 5 })).toBe('5 زيارات');
		expect(ar.dir).toBe('rtl');
	});
});
