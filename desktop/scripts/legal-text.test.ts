import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs build script without type declarations
import { asciiPunctuation, mdToText } from './legal-text.mjs';

describe('installer legal texts', () => {
	it('turns the Markdown subset into plain text the installer wraps itself', () => {
		const md =
			'# Title\n\nLast updated\n\nA paragraph **bold\nacross lines** with a [link](https://x.example/a) and [the policy](PRIVACY.md).\n\n## 1. Part\n\n- item one\n  continued\n- `code`\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
		expect(mdToText(md)).toBe(
			'TITLE\n\nLast updated\n\nA paragraph bold across lines with a link (https://x.example/a) and the policy.\n\n1. Part\n\n- item one continued\n- code\n\nA: 1 / B: 2\n'
		);
	});
	it('ASCII punctuation', () => {
		expect(asciiPunctuation('“a” ‘b’ – — … ›')).toBe('"a" \'b\' - - ... >');
	});
});
