// The translator (D48): message lookup with English fallback, {placeholders}, i18next-style plurals
// (`<key>_one` / `_other` ...) and locale-aware date and number helpers. Pure: no Svelte, no I/O.
import { intlLocale, localeDir, type LocaleCode } from './locales.ts';
import type { MessageKey } from './catalog.ts';

export type Params = Record<string, string | number>;
export type Part = { text: string } | { slot: string };

export interface Translator {
	locale: LocaleCode;
	dir: 'ltr' | 'rtl';
	t(key: MessageKey, params?: Params): string;
	/** Same, split into text and placeholder pieces (for Msg.svelte). */
	parts(key: MessageKey, params?: Params): Part[];
	/** "Oct 7, 2026" style. */
	date(isoOrDate: string | Date): string;
	/** "October 7, 2026" style. */
	longDate(isoOrDate: string | Date): string;
	dateTime(isoOrDate: string | Date): string;
	time(isoOrDate: string | Date): string;
	number(n: number, opts?: Intl.NumberFormatOptions): string;
	/** "A and B", "A, B, and C" in the page language (Intl.ListFormat conjunction). */
	list(items: string[]): string;
}

const PLACEHOLDER = /\{([A-Za-z0-9]+)\}/g;
/** Keys already reported missing (once per key per page load, so a busy page does not flood the console). */
const warned = new Set<string>();
const EN_PLURALS = new Intl.PluralRules('en');

/** A date-only string is read as local noon, so no time zone can move it to the day before or after. */
function toDate(v: string | Date): Date {
	if (v instanceof Date) return v;
	return new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
}

export function createTranslator(locale: LocaleCode, catalog: Record<string, string>, fallback: Record<string, string>): Translator {
	const intl = intlLocale(locale);
	const plurals = new Intl.PluralRules(intl);
	const numbers = new Intl.NumberFormat(intl);
	const lists = new Intl.ListFormat(intl, { type: 'conjunction' });
	const fmt = (opts: Intl.DateTimeFormatOptions) => {
		const f = new Intl.DateTimeFormat(intl, opts);
		return (v: string | Date) => f.format(toDate(v));
	};

	function template(key: string, params?: Params): string {
		const count = params?.count;
		if (typeof count === 'number') {
			const form = plurals.select(count);
			const own = catalog[`${key}_${form}`] ?? catalog[`${key}_other`];
			if (own !== undefined) return own;
			const en = fallback[`${key}_${EN_PLURALS.select(count)}`] ?? fallback[`${key}_other`];
			if (en !== undefined) return en;
		}
		const plain = catalog[key] ?? fallback[key];
		if (plain !== undefined) return plain;
		if (!warned.has(key)) {
			warned.add(key);
			console.warn(`i18n: no message for "${key}"`);
		}
		return key;
	}

	const value = (name: string, v: string | number) => (name === 'count' && typeof v === 'number' ? numbers.format(v) : String(v));

	return {
		locale,
		dir: localeDir(locale),
		t(key, params) {
			return template(key, params).replace(PLACEHOLDER, (m, name: string) => (params && name in params ? value(name, params[name]) : m));
		},
		parts(key, params) {
			const out: Part[] = [];
			let text = '';
			let last = 0;
			const s = template(key, params);
			for (const m of s.matchAll(PLACEHOLDER)) {
				text += s.slice(last, m.index);
				last = m.index + m[0].length;
				const name = m[1];
				if (params && name in params) text += value(name, params[name]);
				else {
					if (text) out.push({ text });
					text = '';
					out.push({ slot: name });
				}
			}
			text += s.slice(last);
			if (text) out.push({ text });
			return out;
		},
		date: fmt({ year: 'numeric', month: 'short', day: 'numeric' }),
		longDate: fmt({ dateStyle: 'long' }),
		dateTime: fmt({ dateStyle: 'medium', timeStyle: 'short' }),
		time: fmt({ hour: 'numeric', minute: '2-digit' }),
		number: (n, opts) => (opts ? new Intl.NumberFormat(intl, opts) : numbers).format(n),
		list: (items) => lists.format(items)
	};
}
