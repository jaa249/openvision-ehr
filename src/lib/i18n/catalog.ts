// Message catalogs (D48). English is imported statically: it is the fallback for every other language
// and the source of the MessageKey type. Other languages load lazily, one chunk per file.
// Files: messages/<namespace>/<locale>.json, flat { key: text }; the full key is "<namespace>.<key>".
// A new namespace needs a line in each of the three lists below (all 17 from the spec exist already).
import { DEFAULT_LOCALE, type LocaleCode } from './locales.ts';
import auth from './messages/auth/en.json';
import catalog from './messages/catalog/en.json';
import codes from './messages/codes/en.json';
import common from './messages/common/en.json';
import documents from './messages/documents/en.json';
import drawing from './messages/drawing/en.json';
import exam from './messages/exam/en.json';
import flowsheet from './messages/flowsheet/en.json';
import glossary from './messages/glossary/en.json';
import keys from './messages/keys/en.json';
import patients from './messages/patients/en.json';
import plan from './messages/plan/en.json';
import report from './messages/report/en.json';
import rx from './messages/rx/en.json';
import sections from './messages/sections/en.json';
import settings from './messages/settings/en.json';
import shell from './messages/shell/en.json';
import tips from './messages/tips/en.json';
import visits from './messages/visits/en.json';

const NAMESPACES = { auth, catalog, codes, common, documents, drawing, exam, flowsheet, glossary, keys, patients, plan, report, rx, sections, settings, shell, tips, visits };
// The "server" namespace (form-action and API messages) sits in a folder SvelteKit never lets into
// browser code, so only the server build reads it; its keys are still part of MessageKey.
type Namespaces = typeof NAMESPACES & { server: typeof import('./messages/server/en.json') };
const SERVER_FILES: Record<string, Record<string, string>> = import.meta.env.SSR
	? Object.fromEntries(
			await Promise.all(
				Object.entries(import.meta.glob<Record<string, string>>('./messages/server/*.json', { import: 'default' })).map(
					async ([path, load]) => [path, await load()] as const
				)
			)
		)
	: {};

/** "count_one" / "count_other" -> "count": code names the plural base and passes { count }. */
type PluralBase<K extends string> = K extends `${infer B}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? B : K;

/** Every English message key, "<namespace>.<key>", plural suffixes stripped. t() rejects anything else. */
export type MessageKey = { [NS in keyof Namespaces]: `${NS}.${PluralBase<keyof Namespaces[NS] & string>}` }[keyof Namespaces];

/** Prefixes each key of one namespace file with the namespace. */
export function withNamespace(ns: string, file: Record<string, string>, into: Record<string, string> = {}): Record<string, string> {
	for (const [k, v] of Object.entries(file)) into[`${ns}.${k}`] = v;
	return into;
}

/** The English catalog with full keys (in the browser without the server-only namespace). */
export const EN: Record<string, string> = Object.entries(NAMESPACES).reduce<Record<string, string>>(
	(all, [ns, file]) => withNamespace(ns, file as Record<string, string>, all),
	mergeLocaleFiles(SERVER_FILES, DEFAULT_LOCALE)
);

/** Merges glob results (path -> file) for one locale: ".../messages/<ns>/<locale>.json". */
export function mergeLocaleFiles(files: Record<string, Record<string, string>>, locale: LocaleCode): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [path, file] of Object.entries(files)) {
		const m = /\/messages\/([^/]+)\/([^/]+)\.json$/.exec(path);
		if (m && m[2] === locale) withNamespace(m[1], file, out);
	}
	return out;
}

// English is already in the bundle, so it is left out of the lazy chunks (and so is the server namespace).
const LAZY = import.meta.glob<Record<string, string>>(['./messages/*/*.json', '!./messages/*/en.json', '!./messages/server/*.json'], {
	import: 'default'
});
const cache = new Map<LocaleCode, Promise<Record<string, string>>>();

/** The catalog for a language (full keys). English returns EN; others are loaded once and cached. */
export function loadCatalog(locale: LocaleCode): Promise<Record<string, string>> {
	if (locale === DEFAULT_LOCALE) return Promise.resolve(EN);
	let p = cache.get(locale);
	if (!p) {
		const wanted = Object.entries(LAZY).filter(([path]) => path.endsWith(`/${locale}.json`));
		p = Promise.all(wanted.map(async ([path, load]) => [path, await load()] as const)).then((files) =>
			mergeLocaleFiles({ ...SERVER_FILES, ...Object.fromEntries(files) }, locale)
		);
		// A failed load (e.g. a chunk missing after an update) is retried next time instead of cached.
		p.catch(() => cache.delete(locale));
		cache.set(locale, p);
	}
	return p;
}
