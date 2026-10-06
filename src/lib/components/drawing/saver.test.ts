import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSaver } from './saver.svelte.ts';

const ok = () => new Response(JSON.stringify({ id: 1, savedAt: '2026-10-06T10:00:00.000Z' }), { status: 200 });
const png = async () => new Blob(['png']);

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('drawing autosave', () => {
	it('saves only when dirty, once, after the debounce', async () => {
		const f = vi.fn(async () => ok());
		const s = new DrawingSaver('/x', png, f as unknown as typeof fetch);
		await s.flush();
		expect(f).not.toHaveBeenCalled(); // nothing drawn, nothing sent
		s.changed(1500);
		s.changed(1500);
		await vi.advanceTimersByTimeAsync(1400);
		expect(f).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(200);
		expect(f).toHaveBeenCalledTimes(1);
		expect(s.status).toBe('saved');
		expect(s.dirty).toBe(false);
	});

	it('retries with backoff after a network failure', async () => {
		let calls = 0;
		const f = vi.fn(async () => {
			calls++;
			if (calls < 3) throw new TypeError('offline');
			return ok();
		});
		const s = new DrawingSaver('/x', png, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(10);
		expect(s.status).toBe('retrying');
		expect(s.message).toBe('Not saved, retrying');
		await vi.advanceTimersByTimeAsync(2000);
		expect(calls).toBe(2);
		await vi.advanceTimersByTimeAsync(4000);
		expect(calls).toBe(3);
		expect(s.status).toBe('saved');
		expect(s.message).toBeNull();
	});

	it('does not retry an image the server refused', async () => {
		const f = vi.fn(async () => new Response('Drawing must be a PNG image', { status: 400 }));
		const s = new DrawingSaver('/x', png, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(f).toHaveBeenCalledTimes(1);
		expect(s.status).toBe('failed');
		expect(s.message).toMatch(/PNG/);
	});

	it('saves again when the canvas changed during a save', async () => {
		const releases: (() => void)[] = [];
		const f = vi.fn(() => new Promise<Response>((r) => releases.push(() => r(ok()))));
		const s = new DrawingSaver('/x', png, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(1);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(f).toHaveBeenCalledTimes(1); // one request at a time
		releases[0]();
		await vi.advanceTimersByTimeAsync(400);
		expect(f).toHaveBeenCalledTimes(2);
		releases[1]();
		await vi.advanceTimersByTimeAsync(10);
		expect(s.dirty).toBe(false);
		expect(s.status).toBe('saved');
	});

	it('sends the lock token and stops for good on 423', async () => {
		const { ExamLock } = await import('#lib/exam/lock.svelte.ts');
		const lock = new ExamLock('/e', { signature: null, lock: null }, () => {}, (async () => new Response('{}')) as unknown as typeof fetch, 'tok-0123456789abcdef');
		await lock.start();
		const f = vi.fn(async () => new Response(JSON.stringify({ message: 'This exam is signed.', reason: 'signed' }), { status: 423 }));
		const s = new DrawingSaver('/x', png, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(10);
		expect(((f.mock.calls[0] as unknown[])[1] as RequestInit).headers).toMatchObject({ 'x-lock-token': 'tok-0123456789abcdef' });
		expect(s.status).toBe('failed');
		expect(s.message).toBe('Not saved: This exam is signed.');
		s.changed(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(f).toHaveBeenCalledTimes(1);
		expect(s.message).toBe('Not saved: This exam is signed.');
		lock.stop();
	});
});
