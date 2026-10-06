// Autosave for the Coding panel's choices: the latest state wins, sent after a short pause.
// "Saving…" shows only when a save is slow (DESIGN.md §5.7), like the exam's findings saver.
import { lockHeaders } from '#lib/exam/lock.svelte.ts';
import type { CodingState } from '#lib/coding/types.ts';

export type CodingSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export class CodingSaver {
	status = $state<CodingSaveStatus>('idle');
	showSaving = $state(false);
	savedAt = $state<Date | null>(null);
	lastError = $state<string | null>(null);

	#url: string;
	#pending: CodingState | null = null;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#inFlight = false;
	#retryDelay = 1000;

	constructor(url: string) {
		this.#url = url;
	}

	get hasUnsaved(): boolean {
		return this.#pending !== null || this.#inFlight;
	}

	queue(state: CodingState, delay = 500): void {
		this.#pending = $state.snapshot(state) as CodingState;
		if (this.status !== 'error') this.status = 'pending';
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.flush(), delay);
	}

	async flush(): Promise<void> {
		clearTimeout(this.#timer);
		if (this.#inFlight || !this.#pending) return;
		const state = this.#pending;
		this.#pending = null;
		this.#inFlight = true;
		this.status = 'saving';
		const slow = setTimeout(() => (this.showSaving = true), 400);
		// Network failures retry with backoff; 4xx answers (validation, permission, signed/locked) will not fix themselves.
		let retry = true;
		try {
			const res = await fetch(this.#url, {
				method: 'PUT',
				headers: { 'content-type': 'application/json', ...lockHeaders() },
				body: JSON.stringify({ state })
			});
			if (!res.ok) {
				retry = res.status >= 500;
				throw new Error(await errorText(res));
			}
			const body = (await res.json()) as { savedAt: string };
			this.savedAt = new Date(body.savedAt);
			this.lastError = null;
			this.#retryDelay = 1000;
			this.status = this.#pending ? 'pending' : 'saved';
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			this.status = 'error';
			if (retry) {
				if (!this.#pending) this.#pending = state;
				setTimeout(() => this.flush(), this.#retryDelay);
				this.#retryDelay = Math.min(this.#retryDelay * 2, 30000);
			}
		} finally {
			clearTimeout(slow);
			this.showSaving = false;
			this.#inFlight = false;
		}
		if (this.#pending && this.status !== 'error') this.flush();
	}

	/** Saves now and waits (before saving lines or printing). False if it could not save. */
	async settle(timeout = 5000): Promise<boolean> {
		const end = Date.now() + timeout;
		while (this.hasUnsaved && Date.now() < end) {
			await this.flush();
			if (this.status === 'error') return false;
			if (this.hasUnsaved) await new Promise((r) => setTimeout(r, 50));
		}
		return !this.hasUnsaved;
	}
}

/** SvelteKit error bodies are JSON { message }; fall back to the status text. */
export async function errorText(res: Response): Promise<string> {
	try {
		const t = await res.text();
		try {
			const j = JSON.parse(t) as { message?: string };
			if (j.message) return j.message;
		} catch {
			/* plain text */
		}
		return t || `Server answered ${res.status}`;
	} catch {
		return `Server answered ${res.status}`;
	}
}
