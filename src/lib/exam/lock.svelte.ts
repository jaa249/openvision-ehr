// Client side of the exam edit lock (spec §15.1). Every request that changes an exam
// sends lockHeaders() so the server can check this page still holds the lock.
//
// One ExamLock per exam page. It makes a random token for this page load, acquires the lock on
// start, heartbeats every minute, and releases on page hide (fetch keepalive: it carries the token
// header and the Origin header the server's cross-site check needs, unlike some sendBeacon builds).
// When someone else holds the lock, or takes it over, the page is read-only and polls every 15 s.
import type { Signature } from '#lib/plan/types.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import { english, type Translate } from '#lib/coding/english.ts';

/** The token of the exam page open in this tab (null before the page starts its lock). */
let currentToken: string | null = null;

/** Headers to add to every exam write (findings, drawings, plan, coding). */
export function lockHeaders(): Record<string, string> {
	return currentToken ? { 'x-lock-token': currentToken } : {};
}

// ---------- pending-save registry ----------
// Savers that live inside panels (drawings, plan items, orders) register a flush so the page can
// save everything before signing. A flush waits for any request in flight, sends whatever is still
// unsaved and resolves true only when everything is saved.
const flushers = new Set<() => Promise<boolean>>();

/** Registers a flush to run before signing; returns the unregister function. */
export function registerFlush(fn: () => Promise<boolean>): () => void {
	flushers.add(fn);
	return () => flushers.delete(fn);
}

/**
 * Runs every registered flush. True only when every one saved everything; false when any failed or
 * threw (the saver itself shows why). Signing refuses to go ahead on false, so nothing unsaved is
 * left out of the signed record.
 */
export async function flushAll(): Promise<boolean> {
	const results = await Promise.allSettled([...flushers].map((f) => f()));
	return results.every((r) => r.status === 'fulfilled' && r.value === true);
}

// ---------- lock state ----------

export interface LockHolder {
	holderId: number;
	holderName: string;
	acquiredAt: string;
	heartbeatAt: string;
	expiresAt: string;
}

export interface LockStateResponse {
	lock: LockHolder | null;
	mine: boolean;
	signature: Signature | null;
	findings?: Findings;
}

/**
 * starting: asking for the lock (editable until told otherwise) · editing: this page holds it ·
 * readonly: someone else holds it (or took it) · signed: finalized, read-only for everyone.
 */
export type LockMode = 'starting' | 'editing' | 'readonly' | 'signed';

/** A random URL-safe token. crypto.randomUUID needs a secure context; getRandomValues does not. */
export function newToken(): string {
	const bytes = new Uint8Array(18);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Marks automatic requests (heartbeat, read-only poll) so they do not count as user activity for
 * the idle auto-logoff. Acquire, takeover and release are user actions and go without it.
 */
const BACKGROUND = { 'x-background': '1' };

export const HEARTBEAT_MS = 60_000;
export const POLL_MS = 15_000;

export class ExamLock {
	mode = $state<LockMode>('starting');
	/** The other holder while read-only (null = nobody holds it now). */
	holder = $state<LockHolder | null>(null);
	signature = $state<Signature | null>(null);
	/** Why the page became read-only, when it was editing before (takeover, lost lock). */
	message = $state<string | null>(null);
	busy = $state(false);

	readonly token: string;
	#url: string;
	#fetch: typeof fetch;
	#heartbeat: ReturnType<typeof setInterval> | undefined;
	#poll: ReturnType<typeof setInterval> | undefined;
	#onFindings: (f: Findings) => void;
	/** Messages made here are in the page language (D48); English when left out. */
	#t: Translate;
	#stopped = false;

	constructor(
		/** e.g. /api/patients/1/encounters/2 */
		examApi: string,
		initial: { signature: Signature | null; lock: LockHolder | null },
		onFindings: (f: Findings) => void,
		fetchImpl: typeof fetch = (...a) => fetch(...a),
		token = newToken(),
		t: Translate = english
	) {
		this.#url = `${examApi}/lock`;
		this.#t = t;
		this.#fetch = fetchImpl;
		this.#onFindings = onFindings;
		this.token = token;
		this.signature = initial.signature;
		if (initial.signature) this.mode = 'signed';
		else if (initial.lock) {
			this.mode = 'readonly';
			this.holder = initial.lock;
		}
	}

	get readonly(): boolean {
		return this.mode === 'readonly' || this.mode === 'signed';
	}

	/** Page mounted: claim the token for lockHeaders() and try to take the lock. */
	async start(): Promise<void> {
		currentToken = this.token;
		this.#stopped = false;
		if (this.mode === 'signed') return;
		await this.#post('acquire');
	}

	/** Page unmounted: stop timers and release. */
	stop(): void {
		this.#stopped = true;
		this.#clearTimers();
		this.release(true);
		if (currentToken === this.token) currentToken = null;
	}

	/** Explicit takeover (the page asks for confirmation first). */
	takeOver(): Promise<void> {
		return this.#post('takeover');
	}

	/** Read-only page with a free lock: start editing. */
	acquire(): Promise<void> {
		return this.#post('acquire');
	}

	/** Gives the lock back (page hide/unload uses keepalive so it survives the page going away). */
	release(keepalive = false): void {
		if (this.mode !== 'editing') return;
		void this.#fetch(this.#url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...this.#headers() },
			body: JSON.stringify({ action: 'release' }),
			keepalive
		}).catch(() => {});
	}

	/** Back from a hidden tab / bfcache: make sure the lock is still ours (or take it again if free). */
	resume(): Promise<void> {
		if (this.#stopped || this.mode === 'signed') return Promise.resolve();
		return this.mode === 'editing' ? this.heartbeat() : this.#post('acquire');
	}

	/** A save or heartbeat got 423: switch to read-only and tell the user why. */
	lost(body: { message?: string; reason?: string; lock?: LockHolder | null }): void {
		const wasEditing = this.mode === 'editing' || this.mode === 'starting';
		if (body.reason === 'signed') {
			this.mode = 'signed';
			this.message = body.message ?? this.#t('exam.lockSigned');
			void this.poll();
		} else {
			this.holder = body.lock ?? null;
			this.mode = 'readonly';
			if (wasEditing) {
				this.message = body.lock
					? this.#t('exam.lockTakenOver', { name: body.lock.holderName })
					: (body.message ?? this.#t('exam.lockLost'));
			}
		}
		this.#schedule();
	}

	/** The exam was signed from this page, or an addendum was added: read-only for good. */
	markSigned(signature: Signature): void {
		this.signature = signature;
		this.mode = 'signed';
		this.holder = null;
		this.message = null;
		this.#schedule();
	}

	async heartbeat(): Promise<void> {
		if (this.mode !== 'editing') return;
		await this.#post('heartbeat');
	}

	/** Fresh lock state and findings (read-only pages, every 15 s). */
	async poll(): Promise<void> {
		try {
			const res = await this.#fetch(this.#url, { headers: { ...this.#headers(), ...BACKGROUND }, cache: 'no-store' });
			if (!res.ok) return;
			this.#apply((await res.json()) as LockStateResponse, false);
		} catch {
			// Offline: try again on the next tick.
		}
	}

	#headers(): Record<string, string> {
		return { 'x-lock-token': this.token };
	}

	async #post(action: 'acquire' | 'heartbeat' | 'takeover'): Promise<void> {
		this.busy = action !== 'heartbeat';
		try {
			const res = await this.#fetch(this.#url, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...this.#headers(), ...(action === 'heartbeat' ? BACKGROUND : {}) },
				body: JSON.stringify({ action })
			});
			if (res.status === 423) {
				this.lost(await res.json().catch(() => ({})));
				return;
			}
			if (!res.ok) {
				// Unexpected answer: never claim the lock; a read-only page must not post.
				if (action !== 'heartbeat') {
					this.mode = 'readonly';
					this.message = (await res.text().catch(() => '')) || this.#t('exam.lockCheckFailed', { status: res.status });
					this.#schedule();
				}
				return;
			}
			this.#apply((await res.json()) as LockStateResponse, action !== 'heartbeat');
		} catch {
			// Network trouble: keep the current mode; the next heartbeat/poll tries again.
		} finally {
			this.busy = false;
		}
	}

	#apply(s: LockStateResponse, explicit: boolean): void {
		if (this.#stopped) return;
		if (s.findings) this.#onFindings(s.findings);
		this.signature = s.signature;
		if (s.signature) {
			this.mode = 'signed';
			this.holder = null;
		} else if (s.mine) {
			this.mode = 'editing';
			this.holder = null;
			if (explicit) this.message = null;
		} else {
			// Was editing and the server no longer says so: someone took over.
			if (this.mode === 'editing' && s.lock) this.message = this.#t('exam.lockTakenOver', { name: s.lock.holderName });
			this.mode = 'readonly';
			this.holder = s.lock;
		}
		this.#schedule();
	}

	/** Heartbeat while editing, poll while read-only, nothing once signed. */
	#schedule(): void {
		this.#clearTimers();
		if (this.#stopped) return;
		if (this.mode === 'editing') this.#heartbeat = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
		else if (this.mode === 'readonly') this.#poll = setInterval(() => void this.poll(), POLL_MS);
	}

	#clearTimers(): void {
		clearInterval(this.#heartbeat);
		clearInterval(this.#poll);
		this.#heartbeat = this.#poll = undefined;
	}
}
