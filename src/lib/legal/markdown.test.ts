import { describe, expect, it } from 'vitest';
import { renderLegalMarkdown } from './markdown.ts';
import { legalHtml, noticeBodyHtml } from '#lib/server/legal.ts';

describe('legal Markdown renderer', () => {
	it('headings, paragraphs joined across lines, lists, tables, bold and code', () => {
		const html = renderLegalMarkdown('# T\n\nOne\ntwo **b**.\n\n- a\n  wrapped\n- `c`\n\n1. x\n\n| H |\n|---|\n| v |\n');
		expect(html).toBe(
			'<h1>T</h1>\n<p>One two <strong>b</strong>.</p>\n<ul><li>a wrapped</li><li><code>c</code></li></ul>\n<ol><li>x</li></ol>\n<div class="table"><table><thead><tr><th scope="col">H</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table></div>'
		);
	});
	it('escapes HTML and keeps only https and /legal links', () => {
		const html = renderLegalMarkdown('<script>x</script> [a](javascript:alert(1)) [b](https://ok.example/p) [c](PRIVACY.md) [d](other.md)', { 'PRIVACY.md': '/legal/privacy' });
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('javascript:');
		expect(html).toContain('<a href="https://ok.example/p" target="_blank" rel="noopener noreferrer">b</a>');
		expect(html).toContain('<a href="/legal/privacy">c</a>');
		expect(html).toContain(' d</p>');
	});
	it('bare https URLs become links', () => {
		expect(renderLegalMarkdown('page (https://github.com/jaa249/openvision-ehr).')).toContain('(<a href="https://github.com/jaa249/openvision-ehr" target="_blank" rel="noopener noreferrer">https://github.com/jaa249/openvision-ehr</a>).');
	});
	it('the shipped documents render, with links between them', () => {
		expect(legalHtml('terms')).toContain('<h1>OpenVision Terms of Use</h1>');
		expect(legalHtml('terms')).toContain('<a href="/legal/privacy">Privacy Policy</a>');
		expect(legalHtml('privacy')).toContain('<table>');
		expect(legalHtml('notice')).toContain('<h1>OpenVision - before you install</h1>');
		expect(noticeBodyHtml()).not.toContain('<h1>');
		expect(noticeBodyHtml()).toContain('Terms of Use');
	});
});
