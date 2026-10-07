'use strict';
// Remembers the main window's size and position in %APPDATA%\OpenVision\window-state.json (per
// Windows user; no patient data).
const fs = require('node:fs');
const path = require('node:path');

const MIN = { width: 1024, height: 700 };
const DEFAULT = { width: 1366, height: 860 };

/** Valid saved bounds, or defaults. A saved position is kept only if it is still on a connected screen. */
function restoreBounds(saved, workAreas) {
	const ok = (n) => Number.isFinite(n);
	if (!saved || !ok(saved.width) || !ok(saved.height)) return { ...DEFAULT, maximized: false };
	const b = {
		width: Math.max(MIN.width, Math.round(saved.width)),
		height: Math.max(MIN.height, Math.round(saved.height)),
		maximized: saved.maximized === true
	};
	if (ok(saved.x) && ok(saved.y)) {
		// At least 100 x 50 px of the title bar must be visible on some screen.
		const visible = (workAreas || []).some(
			(a) => saved.x + 100 > a.x && saved.x < a.x + a.width - 100 && saved.y >= a.y - 10 && saved.y < a.y + a.height - 50
		);
		if (visible) Object.assign(b, { x: Math.round(saved.x), y: Math.round(saved.y) });
	}
	return b;
}

function load(dir) {
	try {
		return JSON.parse(fs.readFileSync(path.join(dir, 'window-state.json'), 'utf8'));
	} catch {
		return null;
	}
}

function save(dir, win) {
	try {
		const b = win.getNormalBounds();
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'window-state.json'), JSON.stringify({ ...b, maximized: win.isMaximized() }));
	} catch {
		// not worth failing over
	}
}

module.exports = { MIN, DEFAULT, restoreBounds, load, save };
