// Undo/redo stack for one canvas (spec §5.2): unlimited depth for the page session.
// Entries are lossless snapshots (PNG blobs, FIX: the original used JPEG). A new entry
// after an undo discards the redo branch.

export class History<T> {
	#items: T[] = [];
	#index = -1;

	/** Starts over with a single entry (the image just loaded). */
	reset(first: T): void {
		this.#items = [first];
		this.#index = 0;
	}

	push(item: T): void {
		this.#items.length = this.#index + 1;
		this.#items.push(item);
		this.#index = this.#items.length - 1;
	}

	get current(): T | undefined {
		return this.#items[this.#index];
	}

	get canUndo(): boolean {
		return this.#index > 0;
	}

	get canRedo(): boolean {
		return this.#index < this.#items.length - 1;
	}

	undo(): T | undefined {
		if (!this.canUndo) return undefined;
		return this.#items[--this.#index];
	}

	redo(): T | undefined {
		if (!this.canRedo) return undefined;
		return this.#items[++this.#index];
	}

	get size(): number {
		return this.#items.length;
	}
}

/** Retry delay after the nth consecutive failure (1-based): 2 s, 4 s, 8 s … capped at 30 s. */
export function backoff(failures: number): number {
	return Math.min(30_000, 1000 * 2 ** Math.max(1, failures));
}
