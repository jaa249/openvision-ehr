// Autosave for one drawing canvas (spec §5.3 FIX): saves only when dirty, debounced after a
// stroke, right away after Undo/Redo/New/Blank/Revert, and on page hide. One request at a
// time; failures retry with backoff. Every save becomes a new version on the server.
import { backoff } from './history.ts';

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

	constructor(url: string, getImage: () => Promise<Blob>, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
		this.#url = url;
		this.#getImage = getImage;
		this.#fetch = fetchImpl;
	}

	get dirty(): boolean {
		return this.#version !== this.#savedVersion;
	}

	/** The canvas changed; save after `delay` ms unless it changes again first. */
	changed(delay = 1500): void {
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
				headers: { 'content-type': 'image/png' },
				body,
				keepalive: keepalive && body.size < KEEPALIVE_MAX
			});
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
