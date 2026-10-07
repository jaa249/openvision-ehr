// Glossary: every abbreviation the exam shows has a plain name, in every language file.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GLOSSARY, glossary, glossaryKey } from './glossary.ts';
import { EN } from './catalog.ts';
import { createTranslator } from './translate.ts';
import { EXAM_SECTIONS, FIELDS, SECTIONS } from '#lib/exam/catalog.ts';
import { QP_SEED, GRADES } from '#lib/exam/quickpicks.ts';
import { DEVIATIONS } from '#lib/exam/sections/neuro.ts';
import { ISSUE_TYPE_DEFS } from '#lib/history/lists.ts';

/**
 * Words that look like abbreviations but need no explanation: roman numerals (CN V), the cup
 * modifiers that already carry their meaning ("V (vertical)"), and plain English capitals.
 */
const ALLOW = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'H', 'x']);

/** An abbreviation: two or more capitals (NS, PCIOL, C/D, X(T)), or a known lowercase short form. */
const looksAbbreviated = (w: string) => /[A-Z].*[A-Z]/.test(w) || /^[A-Z]$/.test(w);
const words = (s: string) => s.split(/[\s,;·]+/).filter(Boolean);

function missing(texts: string[]): string[] {
	const out = new Set<string>();
	for (const s of texts) {
		if (glossaryKey(s)) continue; // a whole label such as "seb ker" or "CN V"
		for (const w of words(s)) if (looksAbbreviated(w) && !ALLOW.has(w) && !glossaryKey(w)) out.add(w);
	}
	return [...out].sort();
}

describe('glossary coverage', () => {
	it('every abbreviation in the quick-pick starter list has a plain name', () => {
		const labels = Object.values(QP_SEED).flatMap((z) => z.map(([, label]) => label));
		expect(missing(labels)).toEqual([]);
		// The lowercase short forms the list uses.
		for (const w of ['seb ker', 'act ker', 'trace', 'gr']) expect(glossary(w), w).toBeTruthy();
		for (const g of GRADES.filter((g) => /\d/.test(g))) expect(glossary(g), g).toBeTruthy();
	});

	it('every abbreviation in the section definitions and field labels has a plain name', () => {
		const texts = [...SECTIONS.map((s) => s.label), ...EXAM_SECTIONS.flatMap((s) => s.rows.map((r) => r.label)), ...FIELDS.map((f) => f.label)];
		expect(missing(texts)).toEqual([]);
	});

	it('cover-test deviations, history types and eye names are explained', () => {
		for (const d of DEVIATIONS) expect(glossary(d), d).toBeTruthy();
		for (const d of ISSUE_TYPE_DEFS) if (looksAbbreviated(d.short)) expect(glossary(d.short), d.short).toBeTruthy();
		for (const w of ['OD', 'OS', 'OU', 'sc', 'cc', 'PH', 'CF', 'HM', 'LP', 'NLP', 'mmHg', 'µm', 'APD', 'RAPD', 'ST', 'SN', 'IT', 'IN', 'Sph', 'Cyl', 'Axis', 'ADD', 'Prism', 'Base', 'W', '920xx', '992xx', 'logMAR', 'D&V', 'NPA', 'NPC', 'POH', 'POS', 'PMH', 'FH']) {
			expect(glossary(w), w).toBeTruthy();
		}
	});

	it('numbered families: Jaeger, Snellen, grades', () => {
		expect(glossaryKey('J1+')).toBe('glossary.jaeger');
		expect(glossaryKey('J16')).toBe('glossary.jaeger');
		expect(glossaryKey('20/40')).toBe('glossary.snellen');
		expect(glossaryKey('+3')).toBe('glossary.grade');
		expect(glossaryKey('2+')).toBe('glossary.grade');
		expect(glossaryKey('J')).toBeNull();
		expect(glossaryKey('nonsense')).toBeNull();
		expect(glossaryKey('')).toBeNull();
	});
});

describe('glossary lookup', () => {
	it('exact case first; a code in capitals finds a lower-case entry, never the reverse', () => {
		expect(glossaryKey('cc')).toBe('glossary.cc');
		expect(glossaryKey('CC')).toBe('glossary.chiefComplaint');
		expect(glossaryKey('SC')).toBe('glossary.sc');
		expect(glossaryKey('SPH')).toBe('glossary.sph');
		expect(glossaryKey('Cc')).toBeNull();
		expect(glossaryKey('ns')).toBeNull();
		// Ordinary words are not codes.
		expect(glossaryKey('in')).toBeNull();
		expect(glossaryKey('x')).toBeNull();
	});

	it('English without a translator; the page language with one', () => {
		expect(glossary('NS')).toMatch(/nuclear sclerosis/);
		const es = createTranslator('es', { 'glossary.ns': 'esclerosis nuclear' }, EN);
		expect(glossary('NS', es.t)).toBe('esclerosis nuclear');
		expect(glossary('PSC', es.t)).toBe(EN['glossary.psc']);
	});

	it('every mapped key exists in English and every English entry is reachable', () => {
		const keys = new Set(Object.values(GLOSSARY));
		for (const k of keys) expect(EN[k], k).toBeTruthy();
		const file = JSON.parse(readFileSync(fileURLToPath(new URL('./messages/glossary/en.json', import.meta.url)), 'utf8')) as Record<string, string>;
		for (const k of Object.keys(file)) expect(keys.has(`glossary.${k}` as never), k).toBe(true);
	});
});
