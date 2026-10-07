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
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
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
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
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
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(f).toHaveBeenCalledTimes(1);
		expect(s.status).toBe('failed');
		expect(s.message).toMatch(/PNG/);
	});

	it('saves again when the canvas changed during a save', async () => {
		const releases: (() => void)[] = [];
		const f = vi.fn(() => new Promise<Response>((r) => releases.push(() => r(ok()))));
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
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

	it('flush before signing: false when the save fails or is refused, true once saved', async () => {
		let answer: () => Response | Promise<Response> = () => {
			throw new TypeError('offline');
		};
		const f = vi.fn(async () => answer());
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
		expect(await s.flush()).toBe(true); // nothing drawn: nothing to save
		s.changed(5000);
		expect(await s.flush()).toBe(false); // network failure: still unsaved
		expect(s.dirty).toBe(true);
		answer = () => new Response('Drawing must be a PNG image', { status: 400 });
		expect(await s.flush()).toBe(false); // refused: the drawing on screen is not the saved one
		answer = ok;
		s.changed(5000);
		expect(await s.flush()).toBe(true);
		expect(s.status).toBe('saved');
	});

	it('flush waits for the save in flight, then saves what changed meanwhile', async () => {
		const releases: (() => void)[] = [];
		const f = vi.fn(() => new Promise<Response>((r) => releases.push(() => r(ok()))));
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(f).toHaveBeenCalledTimes(1);
		s.changed(5000); // drawn on while the first image is on its way
		const flushed = s.flush();
		await vi.advanceTimersByTimeAsync(1);
		expect(f).toHaveBeenCalledTimes(1); // no overlapping request
		releases[0]();
		await vi.advanceTimersByTimeAsync(1);
		expect(f).toHaveBeenCalledTimes(2);
		releases[1]();
		expect(await flushed).toBe(true);
		expect(s.dirty).toBe(false);
	});

	it('flush is false after a 423 (signed or locked)', async () => {
		const f = vi.fn(async () => new Response(JSON.stringify({ message: 'This exam is signed.', reason: 'signed' }), { status: 423 }));
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
		s.changed(5000);
		expect(await s.flush()).toBe(false);
	});

	it('sends the lock token and stops for good on 423', async () => {
		const { ExamLock } = await import('#lib/exam/lock.svelte.ts');
		const lock = new ExamLock('/e', { signature: null, lock: null }, () => {}, (async () => new Response('{}')) as unknown as typeof fetch, 'tok-0123456789abcdef');
		await lock.start();
		const f = vi.fn(async () => new Response(JSON.stringify({ message: 'This exam is signed.', reason: 'signed' }), { status: 423 }));
		const s = new DrawingSaver('/x', png, undefined, f as unknown as typeof fetch);
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
it('words its messages with the translator it was given (D48)', async () => {
		const t = ((key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`) as never;
		const f = vi.fn(async () => new Response('', { status: 413 }));
		const s = new DrawingSaver('/x', png, t, f as unknown as typeof fetch);
		s.changed(0);
		await vi.advanceTimersByTimeAsync(10);
		expect(s.message).toBe('drawing.notSavedTooLarge');
		const g = vi.fn(async () => new Response('', { status: 401 }));
		const s2 = new DrawingSaver('/x', png, t, g as unknown as typeof fetch);
		s2.changed(0);
		await vi.advanceTimersByTimeAsync(10);
		expect(s2.message).toBe('drawing.signedOut');
	});
});
