'use strict';
// The desktop app's own log: logs\openvision.log, rotated at 5 MB, 3 old files kept
// (openvision.log.1 newest … .3 oldest).
//
// Never patient data: no request bodies, no query strings (/patients?q=<name> is a search), no file
// names of saved PDFs or exports (they carry the MRN). Request lines are method, path, status, time.
const fs = require('node:fs');

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

/** The renames that rotate `file`, oldest first: [[file.2, file.3], [file.1, file.2], [file, file.1]]. */
function rotationPlan(file, keep = KEEP) {
	const plan = [];
	for (let i = keep - 1; i >= 1; i--) plan.push([`${file}.${i}`, `${file}.${i + 1}`]);
	if (keep >= 1) plan.push([file, `${file}.1`]);
	return plan;
}

/** A request path that is safe to log: no query string or fragment, control characters removed, capped. */
function safePath(url) {
	const s = String(url || '');
	const cut = s.search(/[?#]/);
	return (cut === -1 ? s : s.slice(0, cut)).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
}

function createLogger(file, { maxBytes = MAX_BYTES, keep = KEEP, echo = false } = {}) {
	let size = 0;
	try {
		size = fs.statSync(file).size;
	} catch {
		size = 0;
	}
	function rotate() {
		for (const [from, to] of rotationPlan(file, keep)) {
			try {
				fs.renameSync(from, to); // replaces `to`, so the oldest falls off
			} catch {
				// a missing older file is normal
			}
		}
		size = 0;
	}
	function write(level, parts) {
		const text = parts
			.map((p) => (p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : JSON.stringify(p)))
			.join(' ')
			.replace(/[\r\n]+/g, ' ');
		const line = `${new Date().toISOString()} ${level} ${text}\n`;
		if (echo) process.stdout.write(line);
		try {
			if (size + Buffer.byteLength(line) > maxBytes) rotate();
			fs.appendFileSync(file, line);
			size += Buffer.byteLength(line);
		} catch {
			// logging must never take the app down
		}
	}
	return {
		file,
		info: (...p) => write('INFO', p),
		warn: (...p) => write('WARN', p),
		error: (...p) => write('ERROR', p),
		request: (method, url, status, ms) => write('REQ', [`${method} ${safePath(url)} ${status} ${ms}ms`])
	};
}

module.exports = { MAX_BYTES, KEEP, rotationPlan, safePath, createLogger };
