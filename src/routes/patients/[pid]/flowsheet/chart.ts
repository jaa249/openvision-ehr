// Pure geometry for the flow sheet's own SVG charts (no charting library).

/** Splits a series at missing values: each run of present values becomes one line (§8.3 FIX: gaps). */
export function segments<T>(values: (T | null | undefined)[]): T[][] {
	const out: T[][] = [];
	let run: T[] = [];
	for (const v of values) {
		if (v === null || v === undefined) {
			if (run.length) out.push(run);
			run = [];
		} else run.push(v);
	}
	if (run.length) out.push(run);
	return out;
}

const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/** Maps a YYYY-MM-DD date to x, proportional to real time between the first and last date. */
export function dateScale(dates: string[], x0: number, x1: number): (date: string) => number {
	if (!dates.length) return () => (x0 + x1) / 2;
	const lo = dayNumber(dates.reduce((a, b) => (a < b ? a : b)));
	const hi = dayNumber(dates.reduce((a, b) => (a > b ? a : b)));
	if (hi === lo) return () => (x0 + x1) / 2;
	return (d) => x0 + ((dayNumber(d) - lo) / (hi - lo)) * (x1 - x0);
}

/** Up to `max` labels, first and last always kept, the rest dropped where they would collide. */
export function dateTicks(dates: string[], scale: (d: string) => number, minGap = 70): string[] {
	const sorted = [...new Set(dates)].sort();
	if (sorted.length <= 1) return sorted;
	const out: string[] = [sorted[0]];
	const last = sorted[sorted.length - 1];
	for (const d of sorted.slice(1, -1)) {
		if (scale(d) - scale(out[out.length - 1]) >= minGap && scale(last) - scale(d) >= minGap) out.push(d);
	}
	if (scale(last) - scale(out[out.length - 1]) >= minGap || out.length === 1) out.push(last);
	else out[out.length - 1] = last;
	return out;
}

/** The y range in mmHg: from 0, at least 35 (§8.3 "suggested maximum 35"), more if a reading is higher. */
export function iopMax(values: number[]): number {
	const top = Math.max(35, ...values.map((v) => v + 3));
	return Math.ceil(top / 5) * 5;
}

/** "HH:MM" for minutes after midnight (§8.3 FIX: two-digit hours, "08" not "008"). */
export function fmtHour(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Time-of-day range for the "by hour" chart: the clinic day 07:00-19:00, widened to whole hours. */
export function hourDomain(minutes: number[]): [number, number] {
	const lo = Math.min(7 * 60, ...minutes.map((m) => Math.floor(m / 60) * 60));
	const hi = Math.max(19 * 60, ...minutes.map((m) => Math.ceil((m + 1) / 60) * 60));
	return [Math.max(0, lo), Math.min(24 * 60, hi)];
}

/** Tick minutes every 1, 2 or 3 hours so there are at most ~13 labels. */
export function hourTicks([lo, hi]: [number, number]): number[] {
	const span = (hi - lo) / 60;
	const step = (span <= 12 ? 1 : span <= 18 ? 2 : 3) * 60;
	const out: number[] = [];
	for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
	return out;
}
