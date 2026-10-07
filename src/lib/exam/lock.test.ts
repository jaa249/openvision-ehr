import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamLock, flushAll, HEARTBEAT_MS, lockHeaders, newToken, POLL_MS, registerFlush, type LockHolder } from './lock.svelte.ts';

const HOLDER: LockHolder = {
	holderId: 2,
	holderName: 'Dr. Other',
	acquiredAt: '2026-10-06T14:00:00.000Z',
	heartbeatAt: '2026-10-06T14:00:00.000Z',
	expiresAt: '2026-10-06T14:15:00.000Z'
};
const state = (s: object, status = 200) => new Response(JSON.stringify({ lock: null, mine: false, signature: null, ...s }), { status });
const TOKEN = 'tok-0123456789abcdef';

let calls: { url: string; init?: RequestInit }[];
let answers: (() => Response)[];
const f = vi.fn(async (url: string, init?: RequestInit) => {
	calls.push({ url, init });
	return (answers.shift() ?? (() => state({ mine: true })))();
}) as unknown as typeof fetch;
const actions = () => calls.map((c) => (c.init?.body ? JSON.parse(c.init.body as string).action : 'GET'));

beforeEach(() => {
	vi.useFakeTimers();
	calls = [];
	answers = [];
});
afterEach(() => vi.useRealTimers());

describe('exam lock (client)', () => {
	it('makes URL-safe random tokens', () => {
		expect(newToken()).toMatch(/^[0-9a-f]{36}$/);
		expect(newToken()).not.toBe(newToken());
	});

	it('acquires on start, heartbeats every minute, releases with keepalive on stop', async () => {
		const lock = new ExamLock('/api/patients/1/encounters/1', { signature: null, lock: null }, () => {}, f, TOKEN);
		await lock.start();
		expect(lock.mode).toBe('editing');
		expect(lockHeaders()).toEqual({ 'x-lock-token': TOKEN });
		expect(calls[0].url).toBe('/api/patients/1/encounters/1/lock');
		await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2 + 10);
		expect(actions()).toEqual(['acquire', 'heartbeat', 'heartbeat']);
		// Heartbeats are background traffic for the idle auto-logoff; acquire is a user action.
		const bg = (i: number) => (calls[i].init?.headers as Record<string, string>)['x-background'];
		expect([bg(0), bg(1), bg(2)]).toEqual([undefined, '1', '1']);
		lock.stop();
		expect(actions().at(-1)).toBe('release');
		expect(calls.at(-1)!.init!.keepalive).toBe(true);
		expect(lockHeaders()).toEqual({});
	});

	it('another holder: read-only, polls every 15 s, never heartbeats; takeover makes it editable', async () => {
		const seen: object[] = [];
		answers.push(() => state({ lock: HOLDER, findings: { ODCONJ: { value: 'quiet', isDefault: false } } }));
		const lock = new ExamLock('/x', { signature: null, lock: null }, (fs) => seen.push(fs), f, TOKEN);
		await lock.start();
		expect(lock.mode).toBe('readonly');
		expect(lock.holder?.holderName).toBe('Dr. Other');
		expect(lock.message).toBeNull(); // never had it: no "taken over" alarm
		expect(seen).toHaveLength(1);
		answers.push(() => state({ lock: HOLDER, findings: {} }));
		await vi.advanceTimersByTimeAsync(POLL_MS + 10);
		expect(actions()).toEqual(['acquire', 'GET']);
		expect((calls[1].init?.headers as Record<string, string>)['x-background']).toBe('1');
		lock.release(); // read-only pages never post a release
		expect(actions()).toEqual(['acquire', 'GET']);
		await lock.takeOver();
		expect(lock.mode).toBe('editing');
		expect(actions().at(-1)).toBe('takeover');
		lock.stop();
	});

	it('heartbeat 423 (taken over): read-only with a clear message and polling', async () => {
		const lock = new ExamLock('/x', { signature: null, lock: null }, () => {}, f, TOKEN);
		await lock.start();
		answers.push(() => new Response(JSON.stringify({ message: 'Dr. Other is editing this exam.', reason: 'locked', lock: HOLDER }), { status: 423 }));
		await vi.advanceTimersByTimeAsync(HEARTBEAT_MS + 10);
		expect(lock.mode).toBe('readonly');
		expect(lock.message).toMatch(/Dr. Other has taken over this exam/);
		answers.push(() => state({ lock: HOLDER }));
		await vi.advanceTimersByTimeAsync(POLL_MS + 10);
		expect(actions().at(-1)).toBe('GET');
		lock.stop();
	});

	it('a signed exam starts read-only and never asks for the lock', async () => {
		const lock = new ExamLock('/x', { signature: { signedBy: 'Dr. Example', signedAt: '2026-10-06T15:00:00.000Z', addenda: [] }, lock: null }, () => {}, f, TOKEN);
		await lock.start();
		expect(lock.mode).toBe('signed');
		expect(lock.readonly).toBe(true);
		await vi.advanceTimersByTimeAsync(POLL_MS * 4);
		expect(calls).toHaveLength(0);
		lock.stop();
		expect(calls).toHaveLength(0);
	});

	it('runs registered flushes before signing', async () => {
		const flush = vi.fn(async () => true);
		const off = registerFlush(flush);
		expect(await flushAll()).toBe(true);
		off();
		expect(await flushAll()).toBe(true);
		expect(flush).toHaveBeenCalledTimes(1);
	});

	it('flushAll is false when any flush failed, threw or left something unsaved', async () => {
		const ok = registerFlush(async () => true);
		const failed = registerFlush(async () => false);
		expect(await flushAll()).toBe(false);
		failed();
		const threw = registerFlush(async () => {
			throw new Error('offline');
		});
		expect(await flushAll()).toBe(false);
		threw();
		expect(await flushAll()).toBe(true);
		ok();
	});
});
