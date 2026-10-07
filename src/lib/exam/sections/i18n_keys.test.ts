// Translations (D48) for the exam sections: every label constant shown on screen has a message key,
// so a new row, column or list entry cannot ship untranslated.
import { describe, expect, it } from 'vitest';
import { EN } from '#lib/i18n/catalog.ts';
import { HPI_ELEMENTS, HPI_ELEMENT_KEYS, ROS_SYSTEMS, ROS_SYSTEM_LABEL_KEY } from './history.ts';
import { IOP_METHODS, IOP_METHOD_LABEL_KEY, MENTAL_STATUS, MENTAL_STATUS_LABEL_KEY, VA_ROWS, VA_ROW_LABEL_KEY, VF_QUADRANTS, VF_QUADRANT_LABEL_KEY } from './workup.ts';
import { DILATION_DROPS, DROP_NAME_KEY } from './dilation.ts';
import { TARGET_SOURCE_LABEL, TARGET_SOURCE_LABEL_KEY } from './glaucoma.ts';
import { COL_LABEL, COL_LABEL_KEY, RX_TYPES, RX_TYPE_LABEL_KEY } from './refraction.ts';
import {
	COVER_POSITIONS,
	COVER_POSITION_KEY,
	COVER_ZONES,
	COVER_ZONE_KEY,
	LATERALITIES,
	LATERALITY_LABEL_KEY,
	MOTILITY_CELLS,
	NEURO_EYE_ROWS,
	NEURO_PAIRS,
	NEURO_ROW_LABEL_KEY,
	coverPositionName,
	gazeKey,
	gazeName
} from './neuro.ts';
import { VA_GROUPS, VA_GROUP_LONG_KEY } from '../va_history.ts';
import {
	FH_ROWS,
	FH_ROW_LABEL_KEY,
	ISSUE_TYPE_DEFS,
	ISSUE_TYPE_KEYS,
	OCCURRENCES,
	OCCURRENCE_LABEL_KEY,
	OUTCOMES,
	OUTCOME_LABEL_KEY,
	SOCIAL_HABITS,
	SOCIAL_LABEL_KEY,
	SOCIAL_STATUSES,
	SOCIAL_STATUS_LABEL_KEY,
	SOCIAL_TEXT
} from '#lib/history/lists.ts';

/** Every id has a key, and the key has an English message. */
function covered(name: string, ids: readonly (string | number)[], map: Record<string | number, string | null | undefined>) {
	for (const id of ids) {
		const key = map[id];
		expect(key, `${name}: ${id}`).toBeTruthy();
		expect(EN[key!], `${name}: ${id} -> ${key}`).toBeDefined();
	}
}

/** The English message is the constant's own text, so English screens did not change. */
function sameEnglish(name: string, pairs: [english: string, key: string | null | undefined][]) {
	for (const [english, key] of pairs) expect(EN[key!], `${name}: ${english}`).toBe(english);
}

describe('section label keys', () => {
	it('history: HPI elements and ROS systems', () => {
		covered('HPI label', HPI_ELEMENTS.map((e) => e.key), Object.fromEntries(HPI_ELEMENTS.map((e) => [e.key, HPI_ELEMENT_KEYS[e.key]?.label])));
		covered('HPI prompt', HPI_ELEMENTS.map((e) => e.key), Object.fromEntries(HPI_ELEMENTS.map((e) => [e.key, HPI_ELEMENT_KEYS[e.key]?.prompt])));
		covered('ROS', ROS_SYSTEMS.map((s) => s.id), ROS_SYSTEM_LABEL_KEY);
	});

	it('workup, dilation and IOP targets', () => {
		covered('VA rows', VA_ROWS.map((r) => r.key), VA_ROW_LABEL_KEY);
		covered('IOP methods', IOP_METHODS.map((m) => m.key), IOP_METHOD_LABEL_KEY);
		covered('VF quadrants', VF_QUADRANTS.map((q) => q.n), VF_QUADRANT_LABEL_KEY);
		covered('mental status', MENTAL_STATUS.map((m) => m.id), MENTAL_STATUS_LABEL_KEY);
		covered('drops', DILATION_DROPS.map((d) => d.id), DROP_NAME_KEY);
		covered('target sources', Object.keys(TARGET_SOURCE_LABEL), TARGET_SOURCE_LABEL_KEY);
		covered('VA history groups', VA_GROUPS.map((g) => g.key), VA_GROUP_LONG_KEY);
	});

	it('refraction columns and Rx types', () => {
		covered('columns', Object.keys(COL_LABEL), COL_LABEL_KEY);
		expect(RX_TYPE_LABEL_KEY).toHaveLength(RX_TYPES.length);
		covered('Rx types', RX_TYPES.map((_, i) => i), Object.fromEntries(RX_TYPE_LABEL_KEY.map((k, i) => [i, k])));
	});

	it('neuro: cover test, gazes, laterality, measures', () => {
		expect(COVER_POSITION_KEY).toHaveLength(COVER_POSITIONS.length);
		covered('cover positions', COVER_POSITIONS, Object.fromEntries(COVER_POSITIONS.map((n) => [n, COVER_POSITION_KEY[n - 1]])));
		// The key order follows coverPositionName: same English text.
		for (const n of COVER_POSITIONS) expect(EN[COVER_POSITION_KEY[n - 1]]).toBe(coverPositionName(n));
		covered('cover zones', COVER_ZONES.map((z) => z.key), Object.fromEntries(COVER_ZONES.map((z) => [z.key, COVER_ZONE_KEY[z.key]?.label])));
		covered('cover zones short', COVER_ZONES.map((z) => z.key), Object.fromEntries(COVER_ZONES.map((z) => [z.key, COVER_ZONE_KEY[z.key]?.short])));
		for (const c of MOTILITY_CELLS) expect(EN[gazeKey(c)], c.id).toBe(gazeName(c));
		covered('laterality', LATERALITIES.map((l) => l.key), LATERALITY_LABEL_KEY);
		covered('neuro rows', [...NEURO_EYE_ROWS, ...NEURO_PAIRS].map((r) => r.key), NEURO_ROW_LABEL_KEY);
	});

	it('English messages equal the English constants', () => {
		sameEnglish('HPI', HPI_ELEMENTS.flatMap((e) => [[e.label, HPI_ELEMENT_KEYS[e.key].label], [e.prompt, HPI_ELEMENT_KEYS[e.key].prompt]] as [string, string][]));
		sameEnglish('ROS', ROS_SYSTEMS.map((s) => [s.label, ROS_SYSTEM_LABEL_KEY[s.id]]));
		sameEnglish('VA rows', VA_ROWS.map((r) => [r.label, VA_ROW_LABEL_KEY[r.key]]));
		sameEnglish('IOP', IOP_METHODS.map((m) => [m.label, IOP_METHOD_LABEL_KEY[m.key]]));
		sameEnglish('VF', VF_QUADRANTS.map((q) => [q.label, VF_QUADRANT_LABEL_KEY[q.n]]));
		sameEnglish('mental', MENTAL_STATUS.map((m) => [m.label, MENTAL_STATUS_LABEL_KEY[m.id]]));
		sameEnglish('drops', DILATION_DROPS.map((d) => [d.name, DROP_NAME_KEY[d.id]]));
		sameEnglish('targets', Object.entries(TARGET_SOURCE_LABEL).map(([k, v]) => [v, TARGET_SOURCE_LABEL_KEY[k as keyof typeof TARGET_SOURCE_LABEL]]));
		sameEnglish('VA groups', VA_GROUPS.map((g) => [g.long, VA_GROUP_LONG_KEY[g.key]]));
		sameEnglish('columns', Object.entries(COL_LABEL).map(([k, v]) => [v, COL_LABEL_KEY[k as keyof typeof COL_LABEL]]));
		sameEnglish('Rx types', RX_TYPES.map((label, i) => [label, RX_TYPE_LABEL_KEY[i]]));
		sameEnglish('zones', COVER_ZONES.flatMap((z) => [[z.label, COVER_ZONE_KEY[z.key].label], [z.short, COVER_ZONE_KEY[z.key].short]] as [string, string][]));
		sameEnglish('laterality', LATERALITIES.map((l) => [l.label, LATERALITY_LABEL_KEY[l.key]]));
		sameEnglish('neuro', [...NEURO_EYE_ROWS, ...NEURO_PAIRS].map((r) => [r.label, NEURO_ROW_LABEL_KEY[r.key]]));
		sameEnglish('issue types', ISSUE_TYPE_DEFS.flatMap((d) => [[d.short, ISSUE_TYPE_KEYS[d.type].short], [d.label, ISSUE_TYPE_KEYS[d.type].label], [d.titleLabel, ISSUE_TYPE_KEYS[d.type].titleLabel]] as [string, string][]));
		sameEnglish('occurrences', OCCURRENCES.map((o) => [o.label, OCCURRENCE_LABEL_KEY[o.value]]));
		sameEnglish('outcomes', OUTCOMES.map((o) => [o.label, OUTCOME_LABEL_KEY[o.value]]));
		sameEnglish('family', FH_ROWS.map((r) => [r.label, FH_ROW_LABEL_KEY[r.key]]));
		sameEnglish('statuses', SOCIAL_STATUSES.map((s) => [s.label, SOCIAL_STATUS_LABEL_KEY[s.value]]));
		sameEnglish('social', [...SOCIAL_HABITS, ...SOCIAL_TEXT].map((f) => [f.label, SOCIAL_LABEL_KEY[f.key]]));
	});

	it('past history lists', () => {
		for (const d of ISSUE_TYPE_DEFS) {
			const k = ISSUE_TYPE_KEYS[d.type];
			covered(`issue ${d.type}`, ['short', 'label', 'titleLabel'], k);
			// A date or provider box has a key exactly when it shows.
			for (const f of ['begin', 'end', 'provider'] as const) {
				expect(k[f] === null, `${d.type}.${f}`).toBe(d[f] === null);
				if (k[f]) expect(EN[k[f]!]).toBe(d[f]);
			}
		}
		covered('occurrences', OCCURRENCES.map((o) => o.value), OCCURRENCE_LABEL_KEY);
		covered('outcomes', OUTCOMES.map((o) => o.value), OUTCOME_LABEL_KEY);
		covered('family rows', FH_ROWS.map((r) => r.key), FH_ROW_LABEL_KEY);
		covered('social statuses', SOCIAL_STATUSES.map((s) => s.value), SOCIAL_STATUS_LABEL_KEY);
		covered('social fields', [...SOCIAL_HABITS, ...SOCIAL_TEXT].map((f) => f.key), SOCIAL_LABEL_KEY);
	});
});
