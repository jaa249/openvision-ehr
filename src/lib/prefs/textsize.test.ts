import { describe, expect, it } from 'vitest';
import { TEXT_SIZES, isShortViewport, isTextSize, rootFontPx, rootFontStyle } from './textsize.ts';
import { PREF_DEFS, checkPref } from './keys.ts';

describe('text size', () => {
	it('offers 100 to 200 percent, default 100', () => {
		expect(TEXT_SIZES).toEqual(['100', '115', '130', '150', '175', '200']);
		expect(PREF_DEFS.textSize.default).toBe('100');
		expect(checkPref('textSize', '130')).toBe('130');
		expect(checkPref('textSize', '120')).toBeUndefined();
		expect(checkPref('textSize', 130)).toBeUndefined();
	});

	it('multiplies the browser default instead of replacing it', () => {
		expect(rootFontPx('100')).toBe(16);
		expect(rootFontPx('200')).toBe(32);
		expect(rootFontPx('150', 20)).toBe(30);
		expect(rootFontPx('115', 16)).toBeCloseTo(18.4);
	});

	it('styles <html> only when the size is not 100%', () => {
		expect(rootFontStyle('100')).toBe('');
		expect(rootFontStyle('175')).toBe('font-size: 175%');
		expect(rootFontStyle('9999')).toBe('');
		expect(rootFontStyle(undefined)).toBe('');
		expect(isTextSize('200')).toBe(true);
		expect(isTextSize('font-size: 1px')).toBe(false);
	});

	it('calls a viewport short by lines of text, not pixels', () => {
		expect(isShortViewport(450, 16)).toBe(true); // 720x450: 200% browser zoom
		expect(isShortViewport(900, 32)).toBe(true); // 1440x900 with text size 200%
		expect(isShortViewport(900, 16)).toBe(false);
		expect(isShortViewport(768, 16)).toBe(false); // 1366x768 laptop
		expect(isShortViewport(576, 16)).toBe(false); // 1280x720 at 125% Windows scaling
		expect(isShortViewport(900, 24)).toBe(false); // text size 150%
		expect(isShortViewport(0, 16)).toBe(false);
		expect(isShortViewport(500, 0)).toBe(false);
	});
});
