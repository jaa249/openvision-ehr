// Pure parts of the desktop shell (D51). Run from the repo root: npx vitest run desktop
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveDataDir, dataLayout, prepareDataDir, clearTmp, TMP_MAX_AGE_MS } = require('./paths.cjs');
const { KEPT_OPEN, closeAll, shutdownDecision, restartAction } = require('./shutdown.cjs');
const { classifyNavigation, classifyWindowOpen, permissionAllowed } = require('./navigation.cjs');
const { backupName, backupsToPrune, takePreUpdateBackup, KEEP } = require('./backups.cjs');
const { makeToken, tokenMatches } = require('./shelltoken.cjs');
const { followsPrereleases } = require('./updates.cjs');
const { rotationPlan, safePath, createLogger } = require('./log.cjs');
const { pdfPageSize, pdfFileName, validIds } = require('./pdf.cjs');
const { parseBitLockerProtection, systemDrive } = require('./bitlocker.cjs');
const { restoreBounds } = require('./windowstate.cjs');

const tmp = () => mkdtempSync(join(tmpdir(), 'ov-desktop-'));

describe('data folder', () => {
	it('OPENVISION_DATA_DIR wins (trimmed, made absolute)', () => {
		expect(resolveDataDir({ env: { OPENVISION_DATA_DIR: '  D:\\Portable\\OV ' }, packaged: true })).toBe(resolve('D:\\Portable\\OV'));
	});
	it('installed: ProgramData\\OpenVision (any spelling of the variable, C:\\ProgramData last)', () => {
		expect(resolveDataDir({ env: { ProgramData: 'E:\\PD' }, packaged: true })).toBe(join('E:\\PD', 'OpenVision'));
		expect(resolveDataDir({ env: { PROGRAMDATA: 'E:\\PD2' }, packaged: true })).toBe(join('E:\\PD2', 'OpenVision'));
		expect(resolveDataDir({ env: {}, packaged: true })).toBe(join('C:\\ProgramData', 'OpenVision'));
	});
	it('development: <repo>\\data\\desktop, never ProgramData', () => {
		expect(resolveDataDir({ env: { ProgramData: 'C:\\ProgramData' }, packaged: false, appDir: 'C:\\src\\ov\\desktop' })).toBe(resolve('C:\\src\\ov\\data\\desktop'));
	});
	it('layout (D42): data\\openvision.sqlite, data\\codes, logs, backups', () => {
		const l = dataLayout('C:\\ProgramData\\OpenVision');
		expect(l.db).toBe(join('C:\\ProgramData\\OpenVision', 'data', 'openvision.sqlite'));
		expect(l.codes).toBe(join('C:\\ProgramData\\OpenVision', 'data', 'codes'));
		expect(l.logFile).toBe(join('C:\\ProgramData\\OpenVision', 'logs', 'openvision.log'));
		expect(l.backups).toBe(join('C:\\ProgramData\\OpenVision', 'backups'));
	});
	it('prepares the folders; a missing root is an error only when it must exist; old tmp leftovers are cleared', () => {
		const base = tmp();
		const root = join(base, 'OV');
		expect(prepareDataDir(dataLayout(root), { mustExist: true })).toMatchObject({ ok: false, reason: 'missing' });
		const l = dataLayout(root);
		expect(prepareDataDir(l)).toEqual({ ok: true });
		for (const d of [l.data, l.codes, l.tmp, l.logs, l.backups]) expect(existsSync(d)).toBe(true);
		writeFileSync(join(l.tmp, 'x.part'), 'fictional');
		const old = (Date.now() - TMP_MAX_AGE_MS - 60_000) / 1000;
		utimesSync(join(l.tmp, 'x.part'), old, old);
		expect(clearTmp(l)).toEqual(['x.part']);
		expect(readdirSync(l.tmp)).toEqual([]);
		rmSync(base, { recursive: true, force: true });
	});
	it("tmp is shared by every Windows user's app: only entries older than 24 h go, one failure never stops the rest", () => {
		const base = tmp();
		const l = dataLayout(join(base, 'OV'));
		prepareDataDir(l);
		const now = Date.now();
		const age = (name: string, ms: number) => utimesSync(join(l.tmp, name), (now - ms) / 1000, (now - ms) / 1000);
		writeFileSync(join(l.tmp, 'other-user-in-progress.part'), 'fictional'); // just written by another user's app
		writeFileSync(join(l.tmp, 'other-user-save-dialog.part'), 'fictional');
		age('other-user-save-dialog.part', TMP_MAX_AGE_MS - 60 * 60_000); // 23 h: still waiting in a Save dialog
		writeFileSync(join(l.tmp, 'a-crash-leftover.part'), 'fictional');
		age('a-crash-leftover.part', TMP_MAX_AGE_MS + 60_000);
		mkdirSync(join(l.tmp, 'b-old-folder'));
		writeFileSync(join(l.tmp, 'b-old-folder', 'x'), 'fictional');
		age('b-old-folder', 3 * TMP_MAX_AGE_MS);
		writeFileSync(join(l.tmp, 'z-crash-leftover.part'), 'fictional');
		age('z-crash-leftover.part', 2 * TMP_MAX_AGE_MS);
		expect(clearTmp(l, { now }).sort()).toEqual(['a-crash-leftover.part', 'b-old-folder', 'z-crash-leftover.part']);
		expect(readdirSync(l.tmp).sort()).toEqual(['other-user-in-progress.part', 'other-user-save-dialog.part']);
		// An entry that cannot be checked or removed (locked, vanished) is skipped, the rest still go.
		for (const name of ['c-locked.part', 'd-leftover.part']) {
			writeFileSync(join(l.tmp, name), 'fictional');
			age(name, 2 * TMP_MAX_AGE_MS);
		}
		const fs = require('node:fs');
		const realRm = fs.rmSync;
		fs.rmSync = (p: string, ...rest: unknown[]) => {
			if (String(p).endsWith('c-locked.part')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
			return realRm(p, ...rest);
		};
		try {
			expect(clearTmp(l, { now })).toEqual(['d-leftover.part']);
		} finally {
			fs.rmSync = realRm;
		}
		expect(readdirSync(l.tmp)).toContain('c-locked.part');
		expect(clearTmp({ tmp: join(base, 'missing') })).toEqual([]);
		rmSync(base, { recursive: true, force: true });
	});
});

describe('navigation rules', () => {
	const app = 'http://127.0.0.1:51234';
	it('same origin stays in the app; https elsewhere goes to the browser; the rest is denied', () => {
		expect(classifyNavigation(`${app}/patients/1`, app)).toBe('app');
		expect(classifyNavigation('https://www.who.int/x', app)).toBe('external');
		for (const u of ['http://example.com/', 'http://127.0.0.1:51235/', 'file:///C:/Windows/', 'javascript:alert(1)', 'data:text/html,x', 'ms-settings:', 'not a url', 'https://'])
			expect(classifyNavigation(u, app)).toBe('deny');
	});
	it('window.open: the app and about:blank become child windows', () => {
		expect(classifyWindowOpen('about:blank', app)).toBe('child');
		expect(classifyWindowOpen(`${app}/print?ids=1`, app)).toBe('child');
		expect(classifyWindowOpen('https://github.com/jaa249/openvision-ehr', app)).toBe('external');
		expect(classifyWindowOpen('http://evil.example/', app)).toBe('deny');
	});
	it('permissions: only clipboard writes, only for the app', () => {
		expect(permissionAllowed('clipboard-sanitized-write', `${app}/x`, app)).toBe(true);
		expect(permissionAllowed('clipboard-sanitized-write', app, app)).toBe(true);
		expect(permissionAllowed('clipboard-sanitized-write', 'https://x.example', app)).toBe(false);
		for (const p of ['media', 'geolocation', 'notifications', 'clipboard-read', 'openExternal']) expect(permissionAllowed(p, app, app)).toBe(false);
	});
});

describe('pre-update backups', () => {
	it('names carry the version and a UTC timestamp', () => {
		expect(backupName('0.1.0', new Date('2026-10-07T15:04:05.678Z'))).toBe('openvision-0.1.0-20261007T150405Z.sqlite');
		expect(backupName('1.0.0-beta/2', new Date('2026-10-07T15:04:05Z'))).toBe('openvision-1.0.0_beta_2-20261007T150405Z.sqlite');
	});
	it('keeps the newest 5 by time (whatever the version), never touches other files', () => {
		const names = [
			'openvision-0.1.0-20261001T000000Z.sqlite',
			'openvision-0.2.0-20261002T000000Z.sqlite',
			'openvision-0.1.0-20261003T000000Z.sqlite',
			'openvision-0.3.0-20261004T000000Z.sqlite',
			'openvision-0.10.0-20261005T000000Z.sqlite',
			'openvision-0.11.0-20261006T000000Z.sqlite',
			'openvision-0.12.0-20261007T000000Z.sqlite',
			'my-own-copy.sqlite',
			'openvision-notes.txt'
		];
		expect(KEEP).toBe(5);
		expect(backupsToPrune(names).sort()).toEqual(['openvision-0.1.0-20261001T000000Z.sqlite', 'openvision-0.2.0-20261002T000000Z.sqlite']);
		expect(backupsToPrune(names.slice(0, 3))).toEqual([]);
	});
	it('takes the backup through the given function and prunes; a failed copy throws', () => {
		const dir = tmp();
		for (let i = 1; i <= 6; i++) writeFileSync(join(dir, `openvision-0.0.${i}-2026100${i}T000000Z.sqlite`), 'x');
		const file = takePreUpdateBackup({ dir, version: '0.1.0', now: new Date('2026-10-09T00:00:00Z'), backup: (p: string) => writeFileSync(p, 'db') });
		expect(readFileSync(file, 'utf8')).toBe('db');
		expect(readdirSync(dir).sort()).toEqual([
			'openvision-0.0.3-20261003T000000Z.sqlite',
			'openvision-0.0.4-20261004T000000Z.sqlite',
			'openvision-0.0.5-20261005T000000Z.sqlite',
			'openvision-0.0.6-20261006T000000Z.sqlite',
			'openvision-0.1.0-20261009T000000Z.sqlite'
		]);
		expect(() => takePreUpdateBackup({ dir, version: '0.1.0', backup: () => {} })).toThrow(/not written/);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe('shell token', () => {
	it('is 32 random bytes, different per launch', () => {
		const a = makeToken();
		expect(Buffer.from(a, 'base64url')).toHaveLength(32);
		expect(makeToken()).not.toBe(a);
	});
	it('matches only the exact token; headers as arrays or missing are refused', () => {
		const t = makeToken();
		expect(tokenMatches(t, t)).toBe(true);
		expect(tokenMatches([t], t)).toBe(true);
		expect(tokenMatches([t, t], t)).toBe(false);
		expect(tokenMatches(undefined, t)).toBe(false);
		expect(tokenMatches('', t)).toBe(false);
		expect(tokenMatches(t.slice(1), t)).toBe(false);
		expect(tokenMatches('anything', '')).toBe(true); // no token configured
	});
});

describe('log', () => {
	it('never logs query strings or fragments', () => {
		expect(safePath('/patients?q=Jordan%20Demo')).toBe('/patients');
		expect(safePath('/export/fhir?ids=1,2#x')).toBe('/export/fhir');
		expect(safePath('/a\r\nINJECTED')).toBe('/aINJECTED');
	});
	it('rotation keeps 3 old files', () => {
		expect(rotationPlan('L')).toEqual([
			['L.2', 'L.3'],
			['L.1', 'L.2'],
			['L', 'L.1']
		]);
	});
	it('rotates at the size limit', () => {
		const dir = tmp();
		const file = join(dir, 'openvision.log');
		const log = createLogger(file, { maxBytes: 200 });
		for (let i = 0; i < 20; i++) log.request('GET', `/patients/${i}?q=secret`, 200, 3);
		const all = readdirSync(dir).sort();
		expect(all).toEqual(['openvision.log', 'openvision.log.1', 'openvision.log.2', 'openvision.log.3']);
		const text = all.map((f) => readFileSync(join(dir, f), 'utf8')).join('');
		expect(text).not.toContain('secret');
		expect(text).toContain('REQ GET /patients/19 200 3ms');
		rmSync(dir, { recursive: true, force: true });
	});
});

describe('PDF', () => {
	it('Letter in the Americas that use it, A4 elsewhere', () => {
		expect(pdfPageSize('US')).toBe('Letter');
		expect(pdfPageSize('ca')).toBe('Letter');
		expect(pdfPageSize('MX')).toBe('Letter');
		expect(pdfPageSize('GB')).toBe('A4');
		expect(pdfPageSize('IN')).toBe('A4');
		expect(pdfPageSize('ES')).toBe('A4');
		expect(pdfPageSize('')).toBe('Letter');
	});
	it('file names are sanitized', () => {
		expect(pdfFileName('openvision-000123-2026-10-07')).toBe('openvision-000123-2026-10-07.pdf');
		expect(pdfFileName('..\\..\\Windows\\evil<>:"|?*.pdf')).toBe('Windows-evil.pdf');
		expect(pdfFileName(undefined, new Date('2026-10-07T12:00:00Z'))).toBe('openvision-report-2026-10-07.pdf');
		expect(pdfFileName('x'.repeat(300))).toHaveLength(104);
	});
	it('visit ids: 1-200 positive integers, duplicates dropped', () => {
		expect(validIds([3, 3, 4])).toEqual([3, 4]);
		for (const bad of [[], [0], [-1], [1.5], ['1'], 'x', null, Array.from({ length: 201 }, (_, i) => i + 1)]) expect(validIds(bad)).toBeNull();
	});
});

describe('BitLocker status (no admin rights)', () => {
	it('parses the Shell property', () => {
		expect(parseBitLockerProtection('1\r\n')).toBe('on');
		expect(parseBitLockerProtection('3')).toBe('on');
		expect(parseBitLockerProtection('6')).toBe('on');
		expect(parseBitLockerProtection('2\r\n')).toBe('off');
		expect(parseBitLockerProtection('4')).toBe('off');
		expect(parseBitLockerProtection('5')).toBe('off');
		for (const v of ['', '0', '\r\n', 'error', '7', undefined, null]) expect(parseBitLockerProtection(v)).toBe('unknown');
	});
	it('system drive from SystemDrive, C: otherwise (never anything that could change the command)', () => {
		expect(systemDrive({ SystemDrive: 'd:' })).toBe('D:');
		expect(systemDrive({})).toBe('C:');
		expect(systemDrive({ SystemDrive: "C:'; Remove-Item x" })).toBe('C:');
	});
});

describe('window state', () => {
	const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }];
	it('defaults, minimum size, and a position only when still on a screen', () => {
		expect(restoreBounds(null, screens)).toEqual({ width: 1366, height: 860, maximized: false });
		expect(restoreBounds({ width: 500, height: 300, x: 10, y: 10 }, screens)).toEqual({ width: 1024, height: 700, x: 10, y: 10, maximized: false });
		expect(restoreBounds({ width: 1200, height: 800, x: 4000, y: 10, maximized: true }, screens)).toEqual({ width: 1200, height: 800, maximized: true });
	});
});

describe('versions', () => {
	it('the desktop package carries the root version (the build also forces it)', () => {
		const rootPkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'));
		const desk = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
		expect(desk.version).toBe(rootPkg.version);
		expect(require('../builder.config.cjs').extraMetadata.version).toBe(rootPkg.version);
	});
});

describe('shutdown: "Wait" calls a quit or "Restart now" off (lib/shutdown.cjs)', () => {
	/** A stand-in for BrowserWindow: close() either closes (async, like Electron) or the page keeps it open. */
	class FakeWin extends EventEmitter {
		destroyed = false;
		closeCalls = 0;
		constructor(private behaviour: 'closes' | 'waits' | 'hangs') {
			super();
		}
		isDestroyed() {
			return this.destroyed;
		}
		close() {
			this.closeCalls++;
			setTimeout(() => {
				if (this.behaviour === 'closes') {
					this.destroyed = true;
					this.emit('closed');
				} else if (this.behaviour === 'waits') this.emit(KEPT_OPEN);
			}, 5);
		}
	}

	it('all windows close: the shutdown goes on', async () => {
		const r = await closeAll([new FakeWin('closes'), new FakeWin('closes')], 1000);
		expect(r).toEqual({ refused: false, open: 0 });
		expect(shutdownDecision(r)).toBe('proceed');
	});

	it('a window kept open with "Wait" cancels it at once (no waiting for the grace time)', async () => {
		const kept = new FakeWin('waits');
		const started = Date.now();
		const r = await closeAll([new FakeWin('closes'), kept], 5000);
		expect(Date.now() - started).toBeLessThan(1000);
		expect(r.refused).toBe(true);
		expect(r.open).toBeGreaterThanOrEqual(1);
		expect(shutdownDecision(r)).toBe('cancel');
		expect(kept.isDestroyed()).toBe(false);
		expect(kept.listenerCount(KEPT_OPEN) + kept.listenerCount('closed')).toBe(0); // no listeners left behind
	});

	it('a hung window (no answer) does not block the exit forever: it is closed with the app', async () => {
		const r = await closeAll([new FakeWin('hangs')], 30);
		expect(r).toEqual({ refused: false, open: 1 });
		expect(shutdownDecision(r)).toBe('proceed');
	});

	it('no windows: proceed; already destroyed windows are skipped', async () => {
		const gone = new FakeWin('closes');
		gone.destroyed = true;
		expect(await closeAll([gone], 30)).toEqual({ refused: false, open: 0 });
		expect(gone.closeCalls).toBe(0);
	});

	it('"Restart now": stay when cancelled (update waits for the next close), install only after a backup', () => {
		expect(restartAction({ cancelled: true, backedUp: false })).toBe('stay');
		expect(restartAction({ cancelled: false, backedUp: false })).toBe('backup-failed');
		expect(restartAction({ cancelled: false, backedUp: true })).toBe('install');
	});
});

describe('updates follow pre-releases only before 1.0', () => {
	it('0.x follows pre-releases, 1.0 and later do not', () => {
		expect(followsPrereleases('0.1.0')).toBe(true);
		expect(followsPrereleases('0.12.3')).toBe(true);
		expect(followsPrereleases('1.0.0')).toBe(false);
		expect(followsPrereleases('10.0.0')).toBe(false);
	});
});
