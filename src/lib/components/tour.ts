// The first-run exam tour's steps, in order. Pure data so the order and the targets are tested
// without a browser; ExamTour.svelte skips any step whose control is not on the page.
import type { TipPlacement } from './ui/tooltip.ts';

export interface TourStep {
	id: 'shorthand' | 'keys' | 'qp' | 'normal' | 'sign';
	/** The control the step points at (the first match on the page). */
	selector: string;
	placement: TipPlacement;
}

const STEPS: readonly TourStep[] = [
	{ id: 'shorthand', selector: '.bar input', placement: 'top' },
	{ id: 'keys', selector: 'nav.rail', placement: 'end' },
	{ id: 'qp', selector: 'main#exam aside.aside', placement: 'start' },
	{ id: 'normal', selector: 'main#exam section .head button', placement: 'bottom' },
	{ id: 'sign', selector: 'header.banner button.sign', placement: 'bottom' }
];

export function tourSteps(): readonly TourStep[] {
	return STEPS;
}

/**
 * Whether the tour may start at all in this browser. Never in automated runs (WebDriver / Playwright set
 * navigator.webdriver), nor when the page or the browser opts out: `?notour` in the URL, or
 * localStorage "openvision.noTour" = "1" (for screenshots and demos).
 */
export function tourAllowed(env: { webdriver?: boolean; search?: string; noTour?: string | null }): boolean {
	if (env.webdriver) return false;
	if (env.search && new URLSearchParams(env.search).has('notour')) return false;
	if (env.noTour === '1') return false;
	return true;
}
