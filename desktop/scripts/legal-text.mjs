// Plain-text copies of the Terms of Use and Privacy Policy (docs/*.md) and the data safety notice
// (NOTICE-INSTALL.txt) for the installer, written to build/legal/ at build time (no dependencies):
//   TERMS.txt, PRIVACY.txt, NOTICE-INSTALL.txt
//   INSTALL-ACCEPT.txt   the installer's acceptance page: the notice, then the Terms of Use
// The NSIS licence page wraps long lines itself, so each paragraph or list item becomes one line.
// Files are written as UTF-8 with a byte-order mark (what NSIS needs to read them as Unicode).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ABSOLUTE = { 'PRIVACY.md': 'the Privacy Policy', 'TERMS.md': 'the Terms of Use', '../LICENSE': 'https://www.apache.org/licenses/LICENSE-2.0' };

/** Inline Markdown → text: links become "text (url)" for web links, emphasis and code marks are dropped. */
function inline(s) {
	return s
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
			if (/^https?:/.test(href)) return text === href ? href : `${text} (${href})`;
			const to = ABSOLUTE[href];
			return to && /^https?:/.test(to) ? `${text} (${to})` : text;
		})
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/`([^`]+)`/g, '$1');
}

/** The small Markdown subset the legal documents use (headings, paragraphs, lists, one table) → plain text. */
export function mdToText(md) {
	const lines = md.replace(/\r\n?/g, '\n').split('\n');
	const blocks = [];
	let cur = null; // the block being joined: { kind, text }
	// Inline marks are resolved after joining, so **bold** may span the source's hard line breaks.
	const flush = () => {
		if (cur) blocks.push({ ...cur, text: inline(cur.text) });
		cur = null;
	};
	let table = null;
	for (const raw of lines) {
		const line = raw.trimEnd();
		if (/^\s*\|/.test(line)) {
			flush();
			const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
			if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // the --- row
			if (!table) table = { kind: 'table', header: cells, rows: [] };
			else table.rows.push(cells);
			continue;
		}
		if (table) {
			blocks.push(table);
			table = null;
		}
		if (!line.trim()) {
			flush();
			continue;
		}
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			flush();
			blocks.push({ kind: h[1].length === 1 ? 'title' : 'heading', text: inline(h[2]) });
			continue;
		}
		const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
		if (li) {
			flush();
			cur = { kind: 'item', marker: li[2] === '*' ? '-' : li[2], text: li[3] };
			continue;
		}
		if (cur) cur.text += ' ' + line.trim();
		else cur = { kind: 'para', text: line.trim() };
	}
	flush();
	if (table) blocks.push(table);

	const out = [];
	let prev = null;
	for (const b of blocks) {
		if (prev && prev.kind === 'item' && b.kind !== 'item' && b.kind !== 'heading') out.push('');
		if (b.kind === 'title') out.push(b.text.toUpperCase(), '');
		else if (b.kind === 'heading') out.push(...(prev ? [''] : []), b.text, '');
		else if (b.kind === 'item') out.push(`${b.marker} ${b.text}`);
		else if (b.kind === 'table') {
			for (const row of b.rows) out.push(row.map((c, i) => `${b.header[i] ?? ''}: ${c}`).join(' / '), '');
		} else {
			out.push(b.text, '');
		}
		prev = b;
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Typographic characters → ASCII, so any installer font shows them. */
export function asciiPunctuation(s) {
	return s
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—]/g, '-')
		.replace(/…/g, '...')
		.replace(/[›»]/g, '>')
		.replace(/ /g, ' ');
}

function main() {
	const here = dirname(fileURLToPath(import.meta.url));
	const repo = join(here, '..', '..');
	const out = join(here, '..', 'build', 'legal');
	mkdirSync(out, { recursive: true });
	const write = (name, text) => writeFileSync(join(out, name), '﻿' + asciiPunctuation(text).replace(/\n/g, '\r\n'));
	const terms = mdToText(readFileSync(join(repo, 'docs', 'TERMS.md'), 'utf8'));
	const privacy = mdToText(readFileSync(join(repo, 'docs', 'PRIVACY.md'), 'utf8'));
	const notice = readFileSync(join(here, '..', 'NOTICE-INSTALL.txt'), 'utf8').replace(/\r\n?/g, '\n').trim() + '\n';
	write('TERMS.txt', terms);
	write('PRIVACY.txt', privacy);
	write('NOTICE-INSTALL.txt', notice);
	write(
		'INSTALL-ACCEPT.txt',
		`${notice}\n${'='.repeat(60)}\n\n${terms}\n${'='.repeat(60)}\n\nThe Privacy Policy is shown in the app (Help > Privacy Policy) and at https://github.com/jaa249/openvision-ehr/blob/main/docs/PRIVACY.md\n`
	);
	console.log(`legal texts: ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
