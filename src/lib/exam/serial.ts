// One autosave target (a plan item, the orders panel): at most one request in flight. A change made
// while a request is out is sent when it returns, so the server sees the values in the order they
// were typed and the last one typed wins. save() is also the flush before signing: it waits for the
// request in flight, sends whatever is still unsaved and says whether everything was saved.

export class SerialSave {
	#send: () => Promise<boolean>;
	#version = 0;
	#saved = 0;
	#running: Promise<boolean> | null = null;
	/** Other requests for the same target (delete, a code change), queued behind any save. */
	#tail: Promise<unknown> = Promise.resolve();

	/** `send` posts the target's CURRENT values and resolves true when the server accepted them. */
	constructor(send: () => Promise<boolean>) {
		this.#send = send;
	}

	/** The values changed and are not saved yet. */
	changed(): void {
		this.#version++;
	}

	/** Forget unsaved changes (the target was deleted). */
	discard(): void {
		this.#saved = this.#version;
	}

	get dirty(): boolean {
		return this.#version !== this.#saved;
	}

	/** A request for this target is on its way. */
	get busy(): boolean {
		return this.#running !== null;
	}

	/**
	 * Saves now: waits for a request in flight, then sends again while anything is unsaved.
	 * Resolves true when everything is saved, false when a request failed (the change stays unsaved,
	 * so the next save() sends it again).
	 */
	save(): Promise<boolean> {
		if (!this.#running) {
			const run: Promise<boolean> = this.#tail
				.then(() => this.#loop())
				.finally(() => {
					if (this.#running === run) this.#running = null;
				});
			this.#running = run;
			this.#tail = run.catch(() => undefined);
		}
		// A change made just as the running loop finished is sent by a fresh save().
		return this.#running.then((ok) => (ok && this.dirty ? this.save() : ok));
	}

	/** Runs another request for this target after any save in flight, and before later saves. */
	run<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.#tail.then(fn);
		this.#tail = next.catch(() => undefined);
		return next;
	}

	async #loop(): Promise<boolean> {
		while (this.dirty) {
			const version = this.#version;
			let ok = false;
			try {
				ok = await this.#send();
			} catch {
				ok = false;
			}
			if (!ok) return false;
			if (version > this.#saved) this.#saved = version;
		}
		return true;
	}
}
