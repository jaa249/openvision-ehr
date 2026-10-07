// The Terms of Use, Privacy Policy and data safety notice as the app shows them (/legal/<doc>, D51).
// The texts are the repo's own files, built into the server unchanged: docs/TERMS.md, docs/PRIVACY.md
// and desktop/NOTICE-INSTALL.txt (the same notice the Windows installer shows). English only for now.
import terms from '../../../docs/TERMS.md?raw';
import privacy from '../../../docs/PRIVACY.md?raw';
import notice from '../../../desktop/NOTICE-INSTALL.txt?raw';
import { renderLegalMarkdown } from '#lib/legal/markdown.ts';

export const LEGAL_DOCS = ['terms', 'privacy', 'notice'] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export const isLegalDoc = (v: unknown): v is LegalDoc => typeof v === 'string' && (LEGAL_DOCS as readonly string[]).includes(v);

// Links between the documents point at the app's pages instead of the repo files.
const LINKS = {
	'TERMS.md': '/legal/terms',
	'PRIVACY.md': '/legal/privacy',
	'../LICENSE': 'https://www.apache.org/licenses/LICENSE-2.0'
};

/** The notice is plain text: its first line is the title. */
function noticeMarkdown(text: string): string {
	const [first, ...rest] = text.replace(/\r\n?/g, '\n').trim().split('\n');
	return `# ${first}\n${rest.join('\n')}`;
}

const SOURCES: Record<LegalDoc, string> = { terms, privacy, notice: noticeMarkdown(notice) };
const cache = new Map<LegalDoc, string>();

/** The document as safe HTML (rendered once). */
export function legalHtml(doc: LegalDoc): string {
	let html = cache.get(doc);
	if (!html) cache.set(doc, (html = renderLegalMarkdown(SOURCES[doc], LINKS)));
	return html;
}

/** The notice body without its title line, for the first-run setup page. */
export function noticeBodyHtml(): string {
	return renderLegalMarkdown(noticeMarkdown(notice).replace(/^# .*\n/, ''), LINKS);
}
