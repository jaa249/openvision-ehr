// Text size (D53). Type, row heights and targets are in rem (tokens.css), so they follow the browser /
// Windows default font size. The per-user "Text size" pref multiplies that default: it sets the root
// font size as a percentage (130% of a 16px default = 20.8px; of a 20px default = 26px). The desktop
// app's View zoom works on top of both, like browser zoom.

export const TEXT_SIZES = ['100', '115', '130', '150', '175', '200'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export function isTextSize(v: unknown): v is TextSize {
	return typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v);
}

/** The inline style for <html>: '' at 100% (the browser default stays in charge). */
export function rootFontStyle(size: string | null | undefined): string {
	return isTextSize(size) && size !== '100' ? `font-size: ${size}%` : '';
}

/** The root font size for a text size and the browser's default font size, in CSS px. */
export function rootFontPx(size: TextSize, browserDefaultPx = 16): number {
	return (browserDefaultPx * Number(size)) / 100;
}

/**
 * Below this many root ems of viewport height the exam's chrome stops being sticky (WCAG 1.4.10):
 * 720x450 at 200% zoom = 28rem; 1440x900 at text size 200% = 28rem; 1366x768 at 100% = 48rem.
 */
export const SHORT_VIEWPORT_REM = 32;

/** True when the viewport is short in lines of text (zoom, large text or a small window). */
export function isShortViewport(heightPx: number, rootPx: number, limitRem = SHORT_VIEWPORT_REM): boolean {
	if (!(heightPx > 0) || !(rootPx > 0)) return false;
	return heightPx / rootPx < limitRem;
}

/** Applies a text size to the page and marks a short viewport (`data-short` on <html>). Browser only. */
export function applyTextSize(size: string | null | undefined, root: HTMLElement = document.documentElement): void {
	root.style.fontSize = isTextSize(size) && size !== '100' ? `${size}%` : '';
	markShortViewport(root);
}

export function markShortViewport(root: HTMLElement = document.documentElement): void {
	const rootPx = parseFloat(getComputedStyle(root).fontSize) || 16;
	root.toggleAttribute('data-short', isShortViewport(window.innerHeight, rootPx));
}
