// The languages OpenVision can show (D48). English is the source; others are drafts until a native
// eye-care professional reviews them. Shared by the server and the browser (no I/O here).

/** 'draft': written without a native reviewer and labelled so in the language menus; 'reviewed' after review. */
export type LocaleStatus = 'source' | 'draft' | 'reviewed';

const LIST = [
	{ code: 'en', name: 'English', dir: 'ltr', status: 'source' },
	{ code: 'es', name: 'Español', dir: 'ltr', status: 'draft' }
] as const satisfies readonly { code: string; name: string; dir: 'ltr' | 'rtl'; status: LocaleStatus }[];

/** Each language by its own name. `dir` and `status` keep their full types so 'rtl' and 'reviewed' type-check. */
export type LocaleInfo = { code: (typeof LIST)[number]['code']; name: string; dir: 'ltr' | 'rtl'; status: LocaleStatus };
export const LOCALES: readonly LocaleInfo[] = LIST;
export type LocaleCode = (typeof LIST)[number]['code'];
export const LOCALE_CODES: readonly LocaleCode[] = LOCALES.map((l) => l.code);
export const DEFAULT_LOCALE: LocaleCode = 'en';

export function isLocale(v: unknown): v is LocaleCode {
	return typeof v === 'string' && LOCALES.some((l) => l.code === v);
}

export function localeInfo(code: LocaleCode): LocaleInfo {
	return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/** Text direction for the html `dir` attribute (no right-to-left language ships yet; the wiring is in place). */
export const localeDir = (code: LocaleCode): 'ltr' | 'rtl' => localeInfo(code).dir;

/**
 * Best match for an Accept-Language header: exact tag, then primary subtag ("es-MX" -> "es"),
 * highest q-value first (q=0 means "not this one"); null if none.
 */
export function matchAcceptLanguage(header: string | null | undefined): LocaleCode | null {
	if (!header) return null;
	const ranges = header
		.slice(0, 1000)
		.split(',')
		.map((part, i) => {
			const [tag, ...params] = part.trim().split(';');
			const q = params.map((p) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p)).find(Boolean);
			const weight = q ? Number(q[1]) : 1;
			return { tag: tag.trim().toLowerCase(), q: Number.isFinite(weight) ? weight : 0, i };
		})
		.filter((r) => r.tag && r.tag !== '*' && r.q > 0)
		.sort((a, b) => b.q - a.q || a.i - b.i);
	for (const r of ranges) {
		if (isLocale(r.tag)) return r.tag;
		const primary = r.tag.split('-')[0];
		if (isLocale(primary)) return primary;
	}
	return null;
}
