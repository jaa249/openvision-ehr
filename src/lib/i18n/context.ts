// The translator as Svelte context (D48). The root layout provides a getter; components get an object
// whose members call the getter each time, so text re-renders when the language changes.
import { getContext, setContext } from 'svelte';
import { createTranslator, type Translator } from './translate.ts';
import { EN } from './catalog.ts';
import { DEFAULT_LOCALE } from './locales.ts';

const KEY = Symbol('i18n');

/** Root +layout.svelte, during component init. */
export function setI18n(get: () => Translator): void {
	setContext(KEY, get);
}

let english: Translator | null = null;

/**
 * Any component, during init. Members read the current translator on every call (so `const { t } =
 * useI18n()` stays reactive). Outside the root layout (a component rendered on its own) it is English.
 */
export function useI18n(): Translator {
	const get = getContext<(() => Translator) | undefined>(KEY) ?? (() => (english ??= createTranslator(DEFAULT_LOCALE, EN, EN)));
	return {
		get locale() {
			return get().locale;
		},
		get dir() {
			return get().dir;
		},
		t: (key, params) => get().t(key, params),
		parts: (key, params) => get().parts(key, params),
		date: (v) => get().date(v),
		longDate: (v) => get().longDate(v),
		dateTime: (v) => get().dateTime(v),
		time: (v) => get().time(v),
		number: (n, opts) => get().number(n, opts),
		list: (items) => get().list(items)
	};
}
