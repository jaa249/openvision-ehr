// Optimistic autosave: edits apply on screen immediately; changes are batched and sent
// in the background. "Saving…" only appears when a save is slow (DESIGN.md §5.7).
// Every save carries the page's edit-lock token. A 423 answer (exam signed, or another page took
// the lock) stops the saver for good: it never retries and never posts again (spec §15.1 FIX).
import { lockHeaders } from './lock.svelte.ts';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'locked';

/** The server's 423 body. */
export interface LockedInfo {
	message: string;
	reason: 'signed' | 'locked';
	lock?: { holderId: number; holderName: string; acquiredAt: string; heartbeatAt: string; expiresAt: string } | null;
}

/** Shown when a write comes back 401 (idle auto-logoff or an expired session). */
export const SIGNED_OUT_MESSAGE = 'Signed out. Your last changes may not be saved; sign in again.';

class SignedOut extends Error {}

class LockedResponse extends Error {
	constructor(readonly info: LockedInfo) {
		super(info.message);
	}
}

interface Pending {
	value: string;
	isDefault: boolean;
}

export class Saver {
	status = $state<SaveStatus>('idle');
	showSaving = $state(false);
	savedAt = $state<Date | null>(null);
	lastError = $state<string | null>(null);
	/** Set when the server refused with 423: the page is read-only now and nothing more is sent. */
	locked = $state<LockedInfo | null>(null);
	/** Fields that were waiting to save when the lock was lost (they were not saved). */
	lostFields = $state<string[]>([]);
	/** A save came back 401: the session ended. Unsaved changes stay queued; no retry loop. */
	signedOut = $state(false);

	#url: string;
	#pending = new Map<string, Pending>();
	#timer: ReturnType<typeof setTimeout> | undefined;
	#slowTimer: ReturnType<typeof setTimeout> | undefined;
	#inFlight = false;
	#retryDelay = 1000;

	constructor(url: string) {
		this.#url = url;
	}

	get hasUnsaved(): boolean {
		return this.#pending.size > 0 || this.#inFlight;
	}

	queue(field: string, value: string, isDefault: boolean, delay = 300): void {
		if (this.locked) return; // read-only: never post
		this.#pending.set(field, { value, isDefault });
		if (this.status !== 'error') this.status = 'pending';
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.flush(), delay);
	}

	async flush(): Promise<void> {
		clearTimeout(this.#timer);
		if (this.#inFlight || this.#pending.size === 0 || this.locked) return;
		const batch = new Map(this.#pending);
		this.#pending.clear();
		this.#inFlight = true;
		this.status = 'saving';
		this.#slowTimer = setTimeout(() => (this.showSaving = true), 400);
		try {
			const res = await fetch(this.#url, {
				method: 'PUT',
				headers: { 'content-type': 'application/json', ...lockHeaders() },
				body: JSON.stringify({
					changes: [...batch].map(([field, p]) => ({ field, value: p.value, isDefault: p.isDefault }))
				})
			});
			if (res.status === 423) throw new LockedResponse(await lockedInfo(res));
			if (res.status === 401) throw new SignedOut(SIGNED_OUT_MESSAGE);
			if (!res.ok) throw new Error(res.status === 400 ? await res.text() : `Server answered ${res.status}`);
			const body = (await res.json()) as { savedAt: string };
			this.savedAt = new Date(body.savedAt);
			this.lastError = null;
			this.signedOut = false;
			this.#retryDelay = 1000;
			this.status = this.#pending.size ? 'pending' : 'saved';
		} catch (e) {
			if (e instanceof LockedResponse) {
				this.#lock(e.info, batch);
				return;
			}
			// Put the batch back underneath anything typed since, then retry with backoff.
			for (const [field, p] of batch) if (!this.#pending.has(field)) this.#pending.set(field, p);
			this.lastError = e instanceof Error ? e.message : String(e);
			this.status = 'error';
			// Signed out: retrying cannot succeed until the user signs in again.
			if (e instanceof SignedOut) {
				this.signedOut = true;
				return;
			}
			setTimeout(() => this.flush(), this.#retryDelay);
			this.#retryDelay = Math.min(this.#retryDelay * 2, 30000);
		} finally {
			clearTimeout(this.#slowTimer);
			this.showSaving = false;
			this.#inFlight = false;
		}
		if (this.#pending.size && this.status !== 'error') this.flush();
	}

	/** Switches to read-only: drops what was waiting (it can no longer be saved) and stops for good. */
	#lock(info: LockedInfo, batch: Map<string, Pending>): void {
		clearTimeout(this.#timer);
		this.lostFields = [...new Set([...batch.keys(), ...this.#pending.keys()])];
		this.#pending.clear();
		this.locked = info;
		this.lastError = info.message;
		this.status = 'locked';
	}

	/** The page went read-only for another reason (lock lost on heartbeat, signed): stop sending. */
	stop(info: LockedInfo): void {
		if (this.locked) return;
		this.#lock(info, new Map());
	}

	/** This page holds the lock again (takeover): accept edits again, starting clean. */
	resume(): void {
		this.locked = null;
		this.lostFields = [];
		this.lastError = null;
		this.status = 'idle';
	}

	/** Saves everything now and waits for it (e.g. before printing). False if it could not save in time. */
	async settle(timeout = 5000): Promise<boolean> {
		const end = Date.now() + timeout;
		while (this.hasUnsaved && Date.now() < end) {
			if (this.status === 'error' || this.locked) return false;
			await this.flush();
			if (this.hasUnsaved) await new Promise((r) => setTimeout(r, 50));
		}
		return !this.hasUnsaved;
	}
}

async function lockedInfo(res: Response): Promise<LockedInfo> {
	const body = (await res.json().catch(() => null)) as Partial<LockedInfo> | null;
	return {
		message: body?.message || 'This exam is read-only now.',
		reason: body?.reason === 'signed' ? 'signed' : 'locked',
		lock: body?.lock ?? null
	};
}
