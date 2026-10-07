// Autosave for one drawing canvas (spec §5.3 FIX): saves only when dirty, debounced after a
// stroke, right away after Undo/Redo/New/Blank/Revert, and on page hide. One request at a
// time; failures retry with backoff. Every save becomes a new version on the server.
// Saves carry the page's edit-lock token; a 423 (exam signed, or another page took the lock) stops
// the saver for good with the server's message (spec §15.1 FIX: read-only pages never post).
import { backoff } from './history.ts';
import { lockHeaders, registerFlush } from '#lib/exam/lock.svelte.ts';
import { english, type Translate } from '#lib/coding/english.ts';

export type DrawingSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying' | 'failed';

/** Bodies above this size can't use fetch keepalive (browsers cap it at 64 KB in flight). */
const KEEPALIVE_MAX = 60_000;

export class DrawingSaver {
	status = $state<DrawingSaveStatus>('idle');
	savedAt = $state<Date | null>(null);
	/** Why the last save failed, in the page language (the server's own detail text stays as sent). */
	message = $state<string | null>(null);

	#url: string;
	#getImage: () => Promise<Blob>;
	#fetch: typeof fetch;
	#version = 0;
	#savedVersion = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	/** The save on its way, if any (one at a time). */
	#current: Promise<void> | null = null;
	/** The last save went through (false after a failure or a refusal, until a save succeeds). */
	#lastOk = true;
	#failures = 0;
	#stopped = false;
	#disabled = false;
	#unregister: () => void;
	/** Messages made here are in the page language (D48); English when left out. */
	#t: Translate;

	constructor(url: string, getImage: () => Promise<Blob>, t: Translate = english, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
		this.#url = url;
		this.#getImage = getImage;
		this.#t = t;
		this.#fetch = fetchImpl;
		// The exam page saves every canvas before signing.
		this.#unregister = registerFlush(() => this.flush());
	}

	get dirty(): boolean {
		return this.#version !== this.#savedVersion;
	}

	/** The canvas changed; save after `delay` ms unless it changes again first. */
	changed(delay = 1500): void {
		if (this.#disabled) return; // keeps the reason on screen instead of a stuck "Saving…"
		this.#version++;
		if (this.status !== 'retrying') this.status = 'pending';
		this.#schedule(delay);
	}

	/**
	 * Saves now if anything is unsaved (page hide, panel closing, before signing): waits for a save
	 * already on its way, then sends the newest image. Resolves true only when the latest drawing is
	 * saved; false when a save failed or was refused (the status says why).
	 */
	async flush(keepalive = false): Promise<boolean> {
		clearTimeout(this.#timer);
		if (this.#current) await this.#current;
		while (this.dirty && !this.#disabled) {
			clearTimeout(this.#timer);
			await this.#start(keepalive);
			if (!this.#lastOk) break;
		}
		return !this.dirty && this.#lastOk;
	}

	/** Stops timers (component destroyed); call flush first. */
	stop(): void {
		this.#stopped = true;
		clearTimeout(this.#timer);
		this.#unregister();
	}

	/** Never save again (e.g. the saved drawing failed to load, so saving could overwrite it). */
	disable(): void {
		this.#disabled = true;
		this.stop();
	}

	#schedule(delay: number): void {
		clearTimeout(this.#timer);
		if (this.#stopped) return;
		this.#timer = setTimeout(() => void this.#start(false), delay);
	}

	/** Starts a save unless one is already on its way (then that one is returned). */
	#start(keepalive: boolean): Promise<void> {
		if (this.#current) return this.#current;
		if (this.#disabled || !this.dirty) return Promise.resolve();
		const run = this.#save(keepalive).finally(() => {
			if (this.#current === run) this.#current = null;
		});
		this.#current = run;
		return run;
	}

	async #save(keepalive: boolean): Promise<void> {
		this.#lastOk = false;
		const version = this.#version;
		if (this.status !== 'retrying') this.status = 'saving';
		let retry = false;
		try {
			const body = await this.#getImage();
			const res = await this.#fetch(this.#url, {
				method: 'PUT',
				headers: { 'content-type': 'image/png', ...lockHeaders() },
				body,
				keepalive: keepalive && body.size < KEEPALIVE_MAX
			});
			if (res.status === 423) {
				// Signed, or another page holds the edit lock: read-only now, never retry.
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				this.status = 'failed';
				this.message = body?.message ? this.#t('drawing.notSavedBecause', { reason: body.message }) : this.#t('drawing.notSavedReadOnly');
				this.disable();
				return;
			}
			if (res.status === 401) {
				// Session ended (idle auto-logoff): retrying cannot work until the user signs in again.
				this.status = 'failed';
				this.message = this.#t('drawing.signedOut');
				return;
			}
			if (!res.ok) {
				// The server refused this image; sending it again would only fail again.
				if (res.status === 400 || res.status === 404 || res.status === 413 || res.status === 415) {
					const detail = res.status === 413 ? '' : await res.text().catch(() => '');
					this.#savedVersion = version; // the next change tries again
					this.status = 'failed';
					this.message =
						res.status === 413
							? this.#t('drawing.notSavedTooLarge')
							: detail
								? this.#t('drawing.notSavedBecause', { reason: detail })
								: this.#t('drawing.notSavedError', { status: res.status });
					return;
				}
				throw new Error(`Server answered ${res.status}`);
			}
			const saved = (await res.json()) as { savedAt: string };
			this.#savedVersion = version;
			this.#lastOk = true;
			this.#failures = 0;
			this.message = null;
			this.savedAt = new Date(saved.savedAt);
			this.status = this.dirty ? 'pending' : 'saved';
		} catch {
			this.#failures++;
			this.status = 'retrying';
			this.message = this.#t('drawing.notSavedRetrying');
			retry = true;
		}
		if (retry) this.#schedule(backoff(this.#failures));
		// Changed while the request was in flight: save the newer image too.
		else if (this.dirty) this.#schedule(300);
	}
}
