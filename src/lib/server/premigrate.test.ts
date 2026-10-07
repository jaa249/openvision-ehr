// Backup before a schema upgrade (premigrate.ts, used by openDatabase): manual installs of a newer
// version get the same safety copy as the desktop updater. Temp files only, fictional data.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate, openDatabase } from './db.ts';
import { backupBeforeMigrate, preMigrateBackupDir, preMigrateName, preMigrateToPrune, PRE_MIGRATE_KEEP, storedSchemaVersion } from './premigrate.ts';

const root = mkdtempSync(join(tmpdir(), 'ov-premigrate-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const fresh = () => {
	const d = join(root, `case${++n}`);
	mkdirSync(d, { recursive: true });
	return d;
};

/** The schema version a brand-new database reaches (MIGRATIONS.length). */
function latest(): number {
	const db = new DatabaseSync(':memory:');
	migrate(db);
	const v = storedSchemaVersion(db);
	db.close();
	return v;
}

/** A database file left by an older version: schema `version`, one fictional practice name. */
function olderDb(file: string, version: number): void {
	const db = new DatabaseSync(file);
	migrate(db, version);
	db.prepare("UPDATE practice SET name = 'Old Version Eye Care' WHERE id = 1").run();
	db.close();
}

const backups = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('pre-migrate-')) : []);

describe('pre-migration backup', () => {
	const LATEST = latest();

	it('names and the default folder (beside the database, or OPENVISION_BACKUP_DIR)', () => {
		expect(preMigrateName(14, 16, new Date('2026-10-07T15:04:05.678Z'))).toBe('pre-migrate-v14-to-v16-20261007T150405Z.sqlite');
		expect(preMigrateName(14, 16, new Date('2026-10-07T15:04:05Z'), 2)).toBe('pre-migrate-v14-to-v16-20261007T150405Z-2.sqlite');
		expect(preMigrateBackupDir('x/data/openvision.sqlite', {})).toBe(resolve('x/data/backups'));
		expect(preMigrateBackupDir('x/data/openvision.sqlite', { OPENVISION_BACKUP_DIR: ' y/backups ' })).toBe(resolve('y/backups'));
	});

	it('an older database is copied (with its data) before migrating, into backups beside it', () => {
		const d = fresh();
		const file = join(d, 'openvision.sqlite');
		olderDb(file, LATEST - 2);
		const db = openDatabase(file);
		expect(storedSchemaVersion(db)).toBe(LATEST);
		db.close();
		const made = backups(join(d, 'backups'));
		expect(made).toHaveLength(1);
		expect(made[0]).toMatch(new RegExp(`^pre-migrate-v${LATEST - 2}-to-v${LATEST}-\\d{8}T\\d{6}Z\\.sqlite$`));
		const copy = new DatabaseSync(join(d, 'backups', made[0]), { readOnly: true });
		expect(storedSchemaVersion(copy)).toBe(LATEST - 2); // the copy is the old, unmigrated database
		expect((copy.prepare('SELECT name FROM practice WHERE id = 1').get() as { name: string }).name).toBe('Old Version Eye Care');
		copy.close();
		// Opening again (already up to date) takes no further copy.
		openDatabase(file).close();
		expect(backups(join(d, 'backups'))).toHaveLength(1);
	});

	it('honours the backup folder it is given (the desktop app: C:\\ProgramData\\OpenVision\\backups)', () => {
		const d = fresh();
		const file = join(d, 'data', 'openvision.sqlite');
		mkdirSync(join(d, 'data'));
		olderDb(file, LATEST - 1);
		openDatabase(file, { backupDir: join(d, 'backups') }).close();
		expect(backups(join(d, 'backups'))).toHaveLength(1);
		expect(existsSync(join(d, 'data', 'backups'))).toBe(false);
	});

	it('no copy for a new database, an empty file, or :memory:', () => {
		const d = fresh();
		openDatabase(join(d, 'new.sqlite')).close();
		writeFileSync(join(d, 'empty.sqlite'), '');
		openDatabase(join(d, 'empty.sqlite')).close();
		openDatabase(':memory:').close();
		expect(existsSync(join(d, 'backups'))).toBe(false);
	});

	it('keeps the newest 5 pre-migration copies; other files in the folder are never touched', () => {
		const names = [
			'pre-migrate-v1-to-v2-20261001T000000Z.sqlite',
			'pre-migrate-v2-to-v3-20261002T000000Z.sqlite',
			'pre-migrate-v3-to-v4-20261003T000000Z.sqlite',
			'pre-migrate-v4-to-v5-20261004T000000Z.sqlite',
			'pre-migrate-v5-to-v6-20261005T000000Z.sqlite',
			'pre-migrate-v6-to-v7-20261005T000000Z-2.sqlite',
			'openvision-0.1.0-20261001T000000Z.sqlite',
			'my-own-copy.sqlite'
		];
		expect(PRE_MIGRATE_KEEP).toBe(5);
		expect(preMigrateToPrune(names)).toEqual(['pre-migrate-v1-to-v2-20261001T000000Z.sqlite']);

		const d = fresh();
		const dir = join(d, 'backups');
		mkdirSync(dir);
		for (const name of names) writeFileSync(join(dir, name), 'x');
		const file = join(d, 'openvision.sqlite');
		olderDb(file, LATEST - 1);
		openDatabase(file).close();
		const left = readdirSync(dir);
		expect(backups(dir)).toHaveLength(5);
		expect(left).not.toContain('pre-migrate-v1-to-v2-20261001T000000Z.sqlite');
		expect(left).not.toContain('pre-migrate-v2-to-v3-20261002T000000Z.sqlite');
		expect(left).toContain('openvision-0.1.0-20261001T000000Z.sqlite');
		expect(left).toContain('my-own-copy.sqlite');
	});

	it('two upgrades in the same second get distinct files', () => {
		const d = fresh();
		const file = join(d, 'openvision.sqlite');
		olderDb(file, LATEST - 1);
		const db = new DatabaseSync(file);
		const now = new Date('2026-10-07T12:00:00Z');
		const a = backupBeforeMigrate(db, file, LATEST, { now });
		const b = backupBeforeMigrate(db, file, LATEST, { now });
		db.close();
		expect(a).not.toBe(b);
		expect(b).toMatch(/-2\.sqlite$/);
	});

	it('if the copy fails, nothing is migrated and opening fails with a clear error', () => {
		const d = fresh();
		const file = join(d, 'openvision.sqlite');
		olderDb(file, LATEST - 1);
		const blocker = join(d, 'not-a-folder');
		writeFileSync(blocker, 'a file where the backups folder should be');
		try {
			chmodSync(blocker, 0o444);
		} catch {
			// best effort; the folder cannot be created over a file either way
		}
		expect(() => openDatabase(file, { backupDir: blocker })).toThrow(/did not update its database \(version \d+ to \d+\).*Nothing was changed/);
		const db = new DatabaseSync(file, { readOnly: true });
		expect(storedSchemaVersion(db)).toBe(LATEST - 1);
		db.close();
		chmodSync(blocker, 0o666);
	});
});
