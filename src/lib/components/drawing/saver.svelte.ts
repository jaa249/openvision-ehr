// Autosave for one drawing canvas (spec §5.3 FIX): saves only when dirty, debounced after a
// stroke, right away after Undo/Redo/New/Blank/Revert, and on page hide. One request at a
// time; failures retry with backoff. Every save becomes a new version on the server.
// Saves carry the page's edit-lock token; a 423 (exam signed, or another page took the lock) stops
// the saver for good with the server's message (spec §15.1 FIX: read-only pages never post).
import { backoff } from './history.ts';
import { lockHeaders, registerFlush } from '#lib/exam/lock.svelte.ts';

export type DrawingSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying' | 'failed';

/** Bodies above this size can't use fetch keepalive (browsers cap it at 64 KB in flight). */
const KEEPALIVE_MAX = 60_000;

export class DrawingSaver {
	status = $state<DrawingSaveStatus>('idle');
	savedAt = $state<Date | null>(null);
	message = $state<string | null>(null);

	#url: string;
	#getImage: () => Promise<Blob>;
	#fetch: typeof fetch;
	#version = 0;
	#savedVersion = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#inFlight = false;
	#failures = 0;
	#stopped = false;
	#disabled = false;
	#unregister: () => void;

	constructor(url: string, getImage: () => Promise<Blob>, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
		this.#url = url;
		this.#getImage = getImage;
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

	/** Saves now if anything is unsaved (page hide, panel closing). */
	flush(keepalive = false): Promise<void> {
		clearTimeout(this.#timer);
		return this.#save(keepalive);
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
		this.#timer = setTimeout(() => void this.#save(false), delay);
	}

	async #save(keepalive: boolean): Promise<void> {
		if (this.#inFlight || this.#disabled || !this.dirty) return;
		this.#inFlight = true;
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
				this.message = `Not saved: ${body?.message || 'this exam is read-only now'}`;
				this.disable();
				return;
			}
			if (res.status === 401) {
				// Session ended (idle auto-logoff): retrying cannot work until the user signs in again.
				this.status = 'failed';
				this.message = 'Signed out. Your last changes may not be saved; sign in again.';
				return;
			}
			if (!res.ok) {
				// The server refused this image; sending it again would only fail again.
				if (res.status === 400 || res.status === 404 || res.status === 413 || res.status === 415) {
					const text = res.status === 413 ? 'drawing is too large' : (await res.text().catch(() => '')) || `error ${res.status}`;
					this.#savedVersion = version; // the next change tries again
					this.status = 'failed';
					this.message = `Not saved: ${text}`;
					return;
				}
				throw new Error(`Server answered ${res.status}`);
			}
			const saved = (await res.json()) as { savedAt: string };
			this.#savedVersion = version;
			this.#failures = 0;
			this.message = null;
			this.savedAt = new Date(saved.savedAt);
			this.status = this.dirty ? 'pending' : 'saved';
		} catch {
			this.#failures++;
			this.status = 'retrying';
			this.message = 'Not saved, retrying';
			retry = true;
		} finally {
			this.#inFlight = false;
		}
		if (retry) this.#schedule(backoff(this.#failures));
		// Changed while the request was in flight: save the newer image too.
		else if (this.dirty) this.#schedule(300);
	}
}
