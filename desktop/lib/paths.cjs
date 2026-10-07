'use strict';
// Where the desktop app keeps its data (D42 layout, D51).
//
//   C:\ProgramData\OpenVision\            created by the installer, ACL: SYSTEM + Administrators full,
//     data\openvision.sqlite               "OpenVision Users" modify, nobody else
//     data\codes\                          diagnosis code files (D49: <database folder>\codes)
//     data\tmp\                            downloads in progress (inside the protected folder, never %TEMP%);
//                                          leftovers older than 24 h are deleted at start
//     logs\openvision.log
//     backups\                             pre-update copies of the database
//
// OPENVISION_DATA_DIR overrides the root (tests, portable runs). Running from a git checkout
// (`npm run desktop:dev`) defaults to <repo>\data\desktop so development never touches ProgramData.
const fs = require('node:fs');
const path = require('node:path');

/** The data root for this run. Pure: everything it depends on is passed in. */
function resolveDataDir({ env = {}, packaged = false, appDir = __dirname } = {}) {
	const override = env.OPENVISION_DATA_DIR;
	if (override && String(override).trim()) return path.resolve(String(override).trim());
	if (!packaged) return path.resolve(appDir, '..', 'data', 'desktop');
	const programData = env.ProgramData || env.PROGRAMDATA || env.ALLUSERSPROFILE || 'C:\\ProgramData';
	return path.join(programData, 'OpenVision');
}

/** The folders and files under a data root. */
function dataLayout(root) {
	const data = path.join(root, 'data');
	return {
		root,
		data,
		db: path.join(data, 'openvision.sqlite'),
		codes: path.join(data, 'codes'),
		tmp: path.join(data, 'tmp'),
		logs: path.join(root, 'logs'),
		logFile: path.join(root, 'logs', 'openvision.log'),
		backups: path.join(root, 'backups')
	};
}

/**
 * Makes sure the folders exist and this Windows user can write to them. In the installed app the root
 * must already exist (the installer creates it with the right permissions); creating it here would give
 * it ProgramData's default, wider permissions.
 * Returns { ok: true } or { ok: false, reason: 'missing' | 'not-writable', path }.
 */
function prepareDataDir(layout, { mustExist = false } = {}) {
	if (mustExist && !fs.existsSync(layout.root)) return { ok: false, reason: 'missing', path: layout.root };
	try {
		for (const dir of [layout.data, layout.codes, layout.tmp, layout.logs, layout.backups]) fs.mkdirSync(dir, { recursive: true });
		const probe = path.join(layout.data, `.write-test-${process.pid}`);
		fs.writeFileSync(probe, 'ok');
		fs.rmSync(probe, { force: true });
		return { ok: true };
	} catch (e) {
		return { ok: false, reason: 'not-writable', path: layout.root, code: e && e.code };
	}
}

const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes leftovers in data\tmp (a download interrupted by a crash may hold patient data). data\tmp is
 * shared by every Windows user's copy of the app (fast user switching), so only entries untouched for
 * `maxAgeMs` (24 h) go: another user's download in progress, or waiting in their Save dialog, stays.
 * One locked or vanished file never stops the rest. Returns the names deleted.
 */
function clearTmp(layout, { now = Date.now(), maxAgeMs = TMP_MAX_AGE_MS } = {}) {
	let names;
	try {
		names = fs.readdirSync(layout.tmp);
	} catch {
		return []; // nothing to clear
	}
	const removed = [];
	for (const name of names) {
		const file = path.join(layout.tmp, name);
		try {
			if (now - fs.statSync(file).mtimeMs < maxAgeMs) continue;
			fs.rmSync(file, { force: true, recursive: true });
			removed.push(name);
		} catch {
			// in use by another user's app, or already gone: tried again at the next start
		}
	}
	return removed;
}

module.exports = { resolveDataDir, dataLayout, prepareDataDir, clearTmp, TMP_MAX_AGE_MS };
