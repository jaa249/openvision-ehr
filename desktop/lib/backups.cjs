'use strict';
// Pre-update backups (D41, D51): before an update is installed the database is copied with
// VACUUM INTO (a consistent copy, taken through the app's open database) to
//   backups\openvision-<version>-<UTC timestamp>.sqlite
// and only the newest KEEP of these are kept. Documents and drawings are stored in the database, so
// the one file is the whole record. Other files in backups\ are never touched.
const fs = require('node:fs');
const path = require('node:path');

const KEEP = 5;
const NAME = /^openvision-(.+)-(\d{8}T\d{6}Z)\.sqlite$/;

/** File name for a backup of `version` taken at `date` (UTC, so names sort and never depend on the time zone). */
function backupName(version, date) {
	const safe = String(version || 'unknown').replace(/[^0-9A-Za-z.+_]/g, '_') || 'unknown';
	const ts = date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
	return `openvision-${safe}-${ts}.sqlite`;
}

/** The pre-update backups among `names` that should be deleted so only the newest `keep` remain. */
function backupsToPrune(names, keep = KEEP) {
	const ours = names
		.map((name) => ({ name, m: NAME.exec(name) }))
		.filter((x) => x.m)
		.sort((a, b) => (a.m[2] < b.m[2] ? 1 : a.m[2] > b.m[2] ? -1 : a.name < b.name ? 1 : -1));
	return ours.slice(Math.max(0, keep)).map((x) => x.name);
}

/**
 * Takes a pre-update backup into `dir` and prunes old ones. `backup(path)` writes the copy (the app's
 * VACUUM INTO). Returns the new file's path; throws if the copy failed (then the update must wait).
 */
function takePreUpdateBackup({ dir, version, backup, now = new Date(), keep = KEEP }) {
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, backupName(version, now));
	backup(file);
	if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error('backup file was not written');
	for (const old of backupsToPrune(fs.readdirSync(dir), keep)) fs.rmSync(path.join(dir, old), { force: true });
	return file;
}

module.exports = { KEEP, backupName, backupsToPrune, takePreUpdateBackup };
