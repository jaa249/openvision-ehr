import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Saver } from './saver.svelte.ts';
import { ExamLock } from './lock.svelte.ts';

const ok = () => new Response(JSON.stringify({ savedAt: '2026-10-06T10:00:00.000Z' }), { status: 200 });
const locked = (reason: 'signed' | 'locked') =>
	new Response(JSON.stringify({ message: reason === 'signed' ? 'This exam is signed.' : 'Dr. Other is editing this exam.', reason }), { status: 423 });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
	vi.useFakeTimers();
	fetchMock = vi.fn(async () => ok());
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const sentHeaders = (i = 0) => (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;

describe('exam autosave', () => {
	it('batches changes and saves after the debounce', async () => {
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 300);
		s.queue('OSCONJ', 'quiet', true, 300);
		await vi.advanceTimersByTimeAsync(310);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.changes).toHaveLength(2);
		expect(s.status).toBe('saved');
		expect(s.hasUnsaved).toBe(false);
	});

	it('retries with backoff after a network error', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 0);
		await vi.advanceTimersByTimeAsync(10);
		expect(s.status).toBe('error');
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(s.status).toBe('saved');
	});

	it('sends the page lock token', async () => {
		const lock = new ExamLock('/api/patients/1/encounters/1', { signature: null, lock: null }, () => {}, vi.fn(async () => new Response('{}')) as unknown as typeof fetch, 'tok-0123456789abcdef');
		await lock.start();
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 0);
		await vi.advanceTimersByTimeAsync(10);
		expect(sentHeaders()['x-lock-token']).toBe('tok-0123456789abcdef');
		lock.stop();
	});

	it('423: stops for good, keeps the message, never retries or posts again', async () => {
		fetchMock.mockResolvedValueOnce(locked('locked'));
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 0);
		await vi.advanceTimersByTimeAsync(10);
		expect(s.status).toBe('locked');
		expect(s.locked).toMatchObject({ reason: 'locked', message: 'Dr. Other is editing this exam.' });
		expect(s.lostFields).toEqual(['ODCONJ']);
		expect(s.hasUnsaved).toBe(false);
		await vi.advanceTimersByTimeAsync(60_000);
		s.queue('OSCONJ', 'x', false, 0);
		await s.flush();
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(await s.settle(100)).toBe(true); // nothing left to send
	});

	it('423 signed is reported as signed; resume() accepts edits again', async () => {
		fetchMock.mockResolvedValueOnce(locked('signed'));
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 0);
		await vi.advanceTimersByTimeAsync(10);
		expect(s.locked?.reason).toBe('signed');
		s.resume();
		s.queue('ODCONJ', 'quiet', false, 0);
		await vi.advanceTimersByTimeAsync(10);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(s.status).toBe('saved');
	});

	it('stop() drops pending changes without sending them', async () => {
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 500);
		s.stop({ message: 'read-only', reason: 'locked' });
		await vi.advanceTimersByTimeAsync(1000);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(s.lostFields).toEqual(['ODCONJ']);
	});

	it('401: says signed out, keeps the changes queued, no retry loop', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{"error":"Sign in first"}', { status: 401 }));
		const s = new Saver('/f');
		s.queue('ODCONJ', 'quiet', false, 0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(s.signedOut).toBe(true);
		expect(s.lastError).toBe('Signed out. Your last changes may not be saved; sign in again.');
		expect(s.hasUnsaved).toBe(true);
	});
});
