// Tiny shared signal: anything that changes patient history outside PmsfhPanel (e.g. a shorthand
// POH:/ALL: entry) calls bump(), and every mounted panel reloads (spec §2.4 "summary refreshes").
// The panel also publishes the latest allergy status so the banner updates without a page reload.
import type { AllergyStatus } from './types.ts';

export const historyBus = $state<{ version: number; allergy: { patientId: number; status: AllergyStatus } | null }>({
	version: 0,
	allergy: null
});

export function bump(): void {
	historyBus.version++;
}

export function publishAllergyStatus(patientId: number, status: AllergyStatus): void {
	historyBus.allergy = { patientId, status };
}
