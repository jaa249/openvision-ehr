import { describe, expect, it } from 'vitest';
import { tourAllowed, tourSteps } from './tour.ts';
import { EN } from '#lib/i18n/catalog.ts';

describe('exam tour', () => {
	it('5 steps in order, each with a title and text in English', () => {
		const steps = tourSteps();
		expect(steps.map((s) => s.id)).toEqual(['shorthand', 'keys', 'qp', 'normal', 'sign']);
		for (const s of steps) {
			const cap = s.id === 'qp' ? 'Qp' : s.id[0].toUpperCase() + s.id.slice(1);
			expect(EN[`tips.tour${cap}Title`], s.id).toBeTruthy();
			expect(EN[`tips.tour${cap}`], s.id).toBeTruthy();
			expect(s.selector).toBeTruthy();
		}
	});
});

describe('tourAllowed', () => {
	it('allows an ordinary browser', () => {
		expect(tourAllowed({ webdriver: false, search: '', noTour: null })).toBe(true);
		expect(tourAllowed({})).toBe(true);
	});
	it('never runs under automation or when opted out', () => {
		expect(tourAllowed({ webdriver: true })).toBe(false);
		expect(tourAllowed({ search: '?notour' })).toBe(false);
		expect(tourAllowed({ search: '?a=1&notour=1' })).toBe(false);
		expect(tourAllowed({ noTour: '1' })).toBe(false);
	});
});
