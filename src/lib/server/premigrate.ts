// Backup before a schema upgrade. However a newer version arrives (the desktop updater, a manually
// installed newer setup, a new web build), the first start that would migrate an existing database
// first copies it with VACUUM INTO to
//   <backups>/pre-migrate-v<from>-to-v<to>-<UTC timestamp>.sqlite
// and keeps the newest KEEP of these. <backups> is OPENVISION_BACKUP_DIR (the desktop app sets it to
// C:\ProgramData\OpenVision\backups, next to its pre-update backups), else a `backups` folder beside the
// database. If the copy cannot be written the database is not migrated and start-up fails.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export const PRE_MIGRATE_KEEP = 5;
const NAME = /^pre-migrate-v\d+-to-v\d+-(\d{8}T\d{6}Z)(?:-(\d+))?\.sqlite$/;

/** Where pre-migration backups of the database file `dbFile` go. */
export function preMigrateBackupDir(dbFile: string, env: Record<string, string | undefined> = process.env): string {
	const override = env.OPENVISION_BACKUP_DIR?.trim();
	return override ? resolve(override) : join(dirname(resolve(dbFile)), 'backups');
}

/** File name for a backup from schema `from` to `to` at `date` (UTC; `n` > 1 only when that second is taken). */
export function preMigrateName(from: number, to: number, date: Date, n = 1): string {
	const ts = date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
	return `pre-migrate-v${from}-to-v${to}-${ts}${n > 1 ? `-${n}` : ''}.sqlite`;
}

/** The pre-migration backups among `names` to delete so that only the newest `keep` remain. Other files are never listed. */
export function preMigrateToPrune(names: string[], keep = PRE_MIGRATE_KEEP): string[] {
	const ours = names
		.map((name) => ({ name, m: NAME.exec(name) }))
		.filter((x): x is { name: string; m: RegExpExecArray } => !!x.m)
		.sort((a, b) => (a.m[1] !== b.m[1] ? (a.m[1] < b.m[1] ? 1 : -1) : Number(b.m[2] ?? 1) - Number(a.m[2] ?? 1)));
	return ours.slice(Math.max(0, keep)).map((x) => x.name);
}

/** The schema version recorded in an open database, without creating anything (0: new or empty). */
export function storedSchemaVersion(db: DatabaseSync): number {
	const t = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get();
	if (!t) return 0;
	const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
	return row.v ?? 0;
}

/**
 * Before migrating the existing database `db` (file `dbFile`) to version `target`: when it holds an older
 * schema, writes the backup and prunes old ones. Returns the backup's path, or null when none was needed
 * (new or empty database, or already up to date). Throws a clear error if the backup failed; the caller
 * must then not migrate.
 */
export function backupBeforeMigrate(
	db: DatabaseSync,
	dbFile: string,
	target: number,
	{ dir = preMigrateBackupDir(dbFile), now = new Date(), keep = PRE_MIGRATE_KEEP }: { dir?: string; now?: Date; keep?: number } = {}
): string | null {
	const from = storedSchemaVersion(db);
	if (from === 0 || from >= target) return null;
	let file = '';
	try {
		mkdirSync(dir, { recursive: true });
		for (let n = 1; !file || existsSync(file); n++) file = join(dir, preMigrateName(from, target, now, n));
		db.prepare('VACUUM INTO ?').run(file);
		if (!existsSync(file) || statSync(file).size === 0) throw new Error('the backup file was not written');
	} catch (e) {
		const why = e instanceof Error ? e.message : String(e);
		throw new Error(
			`OpenVision did not update its database (version ${from} to ${target}) because the backup taken first failed: ${why}. ` +
				`Nothing was changed. Check the free disk space and that this account can write to ${dir}, then start OpenVision again.`
		);
	}
	for (const old of preMigrateToPrune(readdirSync(dir), keep)) {
		try {
			rmSync(join(dir, old), { force: true });
		} catch {
			// an old copy that cannot be deleted now is pruned next time
		}
	}
	return file;
}
