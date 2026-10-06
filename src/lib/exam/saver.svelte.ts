// Optimistic autosave: edits apply on screen immediately; changes are batched and sent
// in the background. "Saving…" only appears when a save is slow (DESIGN.md §5.7).

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface Pending {
	value: string;
	isDefault: boolean;
}

export class Saver {
	status = $state<SaveStatus>('idle');
	showSaving = $state(false);
	savedAt = $state<Date | null>(null);
	lastError = $state<string | null>(null);

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
		this.#pending.set(field, { value, isDefault });
		if (this.status !== 'error') this.status = 'pending';
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.flush(), delay);
	}

	async flush(): Promise<void> {
		clearTimeout(this.#timer);
		if (this.#inFlight || this.#pending.size === 0) return;
		const batch = new Map(this.#pending);
		this.#pending.clear();
		this.#inFlight = true;
		this.status = 'saving';
		this.#slowTimer = setTimeout(() => (this.showSaving = true), 400);
		try {
			const res = await fetch(this.#url, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					changes: [...batch].map(([field, p]) => ({ field, value: p.value, isDefault: p.isDefault }))
				})
			});
			if (!res.ok) throw new Error(res.status === 400 ? await res.text() : `Server answered ${res.status}`);
			const body = (await res.json()) as { savedAt: string };
			this.savedAt = new Date(body.savedAt);
			this.lastError = null;
			this.#retryDelay = 1000;
			this.status = this.#pending.size ? 'pending' : 'saved';
		} catch (e) {
			// Put the batch back underneath anything typed since, then retry with backoff.
			for (const [field, p] of batch) if (!this.#pending.has(field)) this.#pending.set(field, p);
			this.lastError = e instanceof Error ? e.message : String(e);
			this.status = 'error';
			setTimeout(() => this.flush(), this.#retryDelay);
			this.#retryDelay = Math.min(this.#retryDelay * 2, 30000);
		} finally {
			clearTimeout(this.#slowTimer);
			this.showSaving = false;
			this.#inFlight = false;
		}
		if (this.#pending.size && this.status !== 'error') this.flush();
	}

	/** Saves everything now and waits for it (e.g. before printing). False if it could not save in time. */
	async settle(timeout = 5000): Promise<boolean> {
		const end = Date.now() + timeout;
		while (this.hasUnsaved && Date.now() < end) {
			if (this.status === 'error') return false;
			await this.flush();
			if (this.hasUnsaved) await new Promise((r) => setTimeout(r, 50));
		}
		return !this.hasUnsaved;
	}
}
