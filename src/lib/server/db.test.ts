// backupDatabase / closeDb: what the desktop app uses before an update and on exit (D51).
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'ov-db-'));
process.env.OPENVISION_DB = join(dir, 'openvision.sqlite');
const { backupDatabase, closeDb, getDb } = await import('./db.ts');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('backup and close', () => {
	it('VACUUM INTO writes a complete, readable copy', () => {
		getDb().prepare("UPDATE practice SET name = 'Backup Test Eye Care' WHERE id = 1").run();
		const copy = join(dir, 'copy.sqlite');
		backupDatabase(copy);
		const c = new DatabaseSync(copy, { readOnly: true });
		expect((c.prepare('SELECT name FROM practice WHERE id = 1').get() as { name: string }).name).toBe('Backup Test Eye Care');
		c.close();
		expect(() => backupDatabase(copy)).toThrow(); // never overwrites an existing backup
	});

	it('the global hook for the desktop shell points at the same functions', () => {
		const hook = (globalThis as Record<symbol, unknown>)[Symbol.for('openvision.db')] as { open: () => void; backup: unknown; close: unknown };
		expect(typeof hook.open).toBe('function');
		expect(hook.backup).toBe(backupDatabase);
		expect(hook.close).toBe(closeDb);
	});

	it('closeDb checkpoints and releases the file; getDb reopens it', () => {
		closeDb();
		closeDb(); // twice is harmless
		renameSync(process.env.OPENVISION_DB!, join(dir, 'moved.sqlite')); // not locked any more
		renameSync(join(dir, 'moved.sqlite'), process.env.OPENVISION_DB!);
		expect((getDb().prepare('SELECT name FROM practice WHERE id = 1').get() as { name: string }).name).toBe('Backup Test Eye Care');
		closeDb();
	});
});
