// A very small Markdown renderer for OpenVision's own legal documents (docs/TERMS.md, docs/PRIVACY.md,
// desktop/NOTICE-INSTALL.txt), so the app shows exactly the files in the repo without a library.
// Supported: # headings, paragraphs (hard-wrapped lines are joined), "-" and "1." lists, one-level
// tables, **bold**, `code` and [links](href). Everything is HTML-escaped first; links are kept only for
// https URLs and the app's own /legal pages (repo-relative links are mapped by `links`).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type LinkMap = Record<string, string>;

function inline(text: string, links: LinkMap): string {
	let out = esc(text);
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, rawHref: string) => {
		const href = links[rawHref.replace(/&amp;/g, '&')] ?? rawHref.replace(/&amp;/g, '&');
		if (/^https:\/\/[^\s"<>]+$/.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		if (/^\/legal\/[a-z]+$/.test(href)) return `<a href="${href}">${label}</a>`;
		return label;
	});
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
	// Bare https URLs (e.g. "(https://github.com/...)") become links too, unless already inside one.
	out = out.replace(/(^|[\s(])(https:\/\/[^\s<>()"]+[^\s<>()".,;:])/g, (_m, pre: string, url: string) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
	return out;
}

type Block =
	| { kind: 'h'; level: number; text: string }
	| { kind: 'p'; text: string }
	| { kind: 'ul' | 'ol'; items: string[] }
	| { kind: 'table'; header: string[]; rows: string[][] };

/** Markdown (the subset above) to HTML. `links` maps repo-relative hrefs (e.g. "PRIVACY.md") to app URLs. */
export function renderLegalMarkdown(md: string, links: LinkMap = {}): string {
	const blocks: Block[] = [];
	let para: string[] | null = null;
	let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
	let table: { kind: 'table'; header: string[]; rows: string[][] } | null = null;
	const end = () => {
		if (para) blocks.push({ kind: 'p', text: para.join(' ') });
		if (list) blocks.push(list);
		if (table) blocks.push(table);
		para = null;
		list = null;
		table = null;
	};
	for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
		const line = raw.trimEnd();
		if (!line.trim()) {
			end();
			continue;
		}
		if (/^\s*\|/.test(line)) {
			const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
			if (!table) {
				end();
				table = { kind: 'table', header: cells, rows: [] };
			} else if (!cells.every((c) => /^:?-+:?$/.test(c))) table.rows.push(cells);
			continue;
		}
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			end();
			blocks.push({ kind: 'h', level: h[1].length, text: h[2] });
			continue;
		}
		const li = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
		if (li) {
			const kind = /\d/.test(li[1]) ? 'ol' : 'ul';
			if (para || table || (list && list.kind !== kind)) end();
			if (!list) list = { kind, items: [] };
			list.items.push(li[2]);
			continue;
		}
		if (list) list.items[list.items.length - 1] += ' ' + line.trim(); // a wrapped list item
		else (para ??= []).push(line.trim());
	}
	end();

	return blocks
		.map((b) => {
			switch (b.kind) {
				case 'h': {
					return `<h${b.level}>${inline(b.text, links)}</h${b.level}>`;
				}
				case 'p':
					return `<p>${inline(b.text, links)}</p>`;
				case 'ul':
				case 'ol':
					return `<${b.kind}>${b.items.map((i) => `<li>${inline(i, links)}</li>`).join('')}</${b.kind}>`;
				case 'table':
					return `<div class="table"><table><thead><tr>${b.header.map((c) => `<th scope="col">${inline(c, links)}</th>`).join('')}</tr></thead><tbody>${b.rows
						.map((r) => `<tr>${r.map((c) => `<td>${inline(c, links)}</td>`).join('')}</tr>`)
						.join('')}</tbody></table></div>`;
			}
		})
		.join('\n');
}
