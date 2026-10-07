// Helpers for the undo message (WCAG 2.2.1 timing adjustable, 2.4.11 focus not obscured):
//   PausableTimer: the time left only runs while nobody is reading or using the message
//   (hovered, focused, window hidden); each reason pauses it on its own.
//   undoMs: the per-user "Keep undo messages visible for" pref in milliseconds (null = until dismissed).
//   pickPlacement: the first spot where the message does not cover the focused control.

export type PauseReason = 'hover' | 'focus' | 'hidden';

export class PausableTimer {
	private left: number;
	private started = 0;
	private handle: ReturnType<typeof setTimeout> | undefined;
	private reasons = new Set<PauseReason>();
	private done = false;

	/** ms = null: never fires (kept until dismissed). */
	constructor(
		ms: number | null,
		private onDone: () => void,
		private now: () => number = () => Date.now()
	) {
		this.left = ms ?? Infinity;
		this.run();
	}

	/** Pauses for one reason (hover, focus, hidden); others may still hold it. */
	pause(reason: PauseReason): void {
		if (this.done) return;
		if (!this.reasons.size) this.stop();
		this.reasons.add(reason);
	}

	/** Lifts one reason; the countdown continues once no reason is left. */
	resume(reason: PauseReason): void {
		if (this.done || !this.reasons.delete(reason) || this.reasons.size) return;
		this.run();
	}

	get paused(): boolean {
		return this.reasons.size > 0;
	}

	/** Time left in ms (Infinity when kept until dismissed). */
	remaining(): number {
		if (this.handle === undefined) return this.left;
		return Math.max(0, this.left - (this.now() - this.started));
	}

	cancel(): void {
		this.done = true;
		clearTimeout(this.handle);
		this.handle = undefined;
	}

	private run() {
		if (this.done || !Number.isFinite(this.left)) return;
		this.started = this.now();
		this.handle = setTimeout(() => {
			this.handle = undefined;
			this.done = true;
			this.onDone();
		}, this.left);
	}

	private stop() {
		if (this.handle === undefined) return;
		this.left = this.remaining();
		clearTimeout(this.handle);
		this.handle = undefined;
	}
}

/** Milliseconds for the pref value; null = until dismissed. Unknown values fall back to 10 s. */
export function undoMs(pref: string | undefined): number | null {
	if (pref === 'never') return null;
	if (pref === '30') return 30_000;
	return 10_000;
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Do two rectangles overlap (touching edges do not count)? */
export function overlaps(a: Rect, b: Rect): boolean {
	return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The first candidate placement whose rectangle does not overlap the focused element; the first
 * one when nothing has focus; when every spot overlaps, the one with the least overlap.
 */
export function pickPlacement<P extends string>(candidates: readonly { place: P; rect: Rect }[], focused: Rect | null): P {
	if (!candidates.length) throw new Error('no placement');
	if (!focused) return candidates[0].place;
	const free = candidates.find((c) => !overlaps(c.rect, focused));
	if (free) return free.place;
	const area = (r: Rect) => {
		const w = Math.min(r.right, focused.right) - Math.max(r.left, focused.left);
		const h = Math.min(r.bottom, focused.bottom) - Math.max(r.top, focused.top);
		return Math.max(0, w) * Math.max(0, h);
	};
	return candidates.reduce((best, c) => (area(c.rect) < area(best.rect) ? c : best)).place;
}
