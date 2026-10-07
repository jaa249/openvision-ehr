import { describe, expect, it } from 'vitest';
import { createTranslator } from '#lib/i18n/translate.ts';
import { EN } from '#lib/i18n/catalog.ts';
import { seedRows } from '#lib/exam/quickpicks.ts';
import { SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { parseShorthand } from './parse.ts';
import { describeCode, describeFields } from './describe.ts';
import {
	CODE_ENTRIES,
	CODE_ENTRY,
	acceptInto,
	codeInsert,
	codeRows,
	codesOf,
	matchTier,
	rank,
	rememberCodes,
	shorthandContext,
	suggestCodes,
	termsFor
} from './suggest.ts';

const { t } = createTranslator('en', EN, EN);
const describeEn = (code: string) => describeCode(CODE_ENTRY.get(code)!, t);
const codes = (q: string, recent: string[] = []) => suggestCodes(q, (e) => describeCode(e, t), { recent }).map((s) => s.entry.code);

describe('vocabulary', () => {
	it('has every code the parser accepts, each once', () => {
		const seen = new Set(CODE_ENTRIES.map((e) => e.code));
		expect(seen.size).toBe(CODE_ENTRIES.length);
		for (const c of ['RC', 'LK', 'BC', 'D', 'DAS', 'CEXT', 'POH', 'ALL', 'HERT', 'ODCONJ', 'IOP']) expect(seen.has(c), c).toBe(true);
	});

	it('every code typed with what it inserts parses without an unknown-code error', () => {
		for (const e of CODE_ENTRIES) {
			const ins = codeInsert(e);
			const sample = e.kind === 'command' ? ins : e.kind === 'special' ? `${ins}15-100-16` : `${ins}x`;
			const { errors } = parseShorthand(sample);
			expect(errors.filter((x) => x.message.startsWith('Unknown code')), sample).toEqual([]);
		}
	});
});

describe('plain words', () => {
	it('says the row and the eye', () => {
		expect(describeEn('RC')).toBe('Conjunctiva, right eye');
		expect(describeEn('LK')).toBe('Cornea, left eye');
		expect(describeEn('BC')).toBe('Conjunctiva, both eyes');
		expect(describeEn('4XL')).toBe('Upper lid + Lower lid, both eyes');
	});
	it('describes commands, history codes and Hertel', () => {
		expect(describeEn('DAS')).toBe('Normal: Slit lamp');
		expect(describeEn('D')).toBe('Normal: all sections');
		expect(describeEn('POH')).toMatch(/^Adds to /);
		expect(describeEn('HERT')).toMatch(/Hertel/);
	});
	it('says a module pair once with "both eyes"', () => {
		const s = describeFields(['ODIOPAP', 'OSIOPAP'], t);
		expect(s).toMatch(/both eyes$/);
		expect(s).not.toMatch(/\bO[DS]\b/);
	});
});

describe('ranking', () => {
	const items = [
		{ primary: 'xcornea', secondary: 'contains only' },
		{ primary: 'LK', secondary: 'Cornea, left eye' },
		{ primary: 'corn', secondary: 'prefix' }
	];
	it('prefix > word start > contains', () => {
		expect(matchTier(items[2], 'cor')).toBe(0);
		expect(matchTier(items[1], 'cor')).toBe(1);
		expect(matchTier(items[0], 'cor')).toBe(2);
		expect(matchTier(items[0], 'zzz')).toBe(-1);
		expect(rank(items, 'cor').map((i) => i.primary)).toEqual(['corn', 'LK', 'xcornea']);
	});
	it('recently used first within a tier, then exact, then shorter', () => {
		const list = [{ primary: 'RCUP' }, { primary: 'RC' }, { primary: 'RCAR' }];
		expect(rank(list, 'rc').map((i) => i.primary)).toEqual(['RC', 'RCAR', 'RCUP']);
		expect(rank(list, 'rc', { recent: ['rcup'] }).map((i) => i.primary)).toEqual(['RCUP', 'RC', 'RCAR']);
	});
	it('limits to 8 and keeps the original order for an empty query', () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ primary: `t${i}` }));
		expect(rank(many, '')).toHaveLength(8);
		expect(rank(many, '')[0].primary).toBe('t0');
	});
	it('codes: prefix matches first, aliases before field ids', () => {
		const r = codes('rc');
		expect(r[0]).toBe('RC');
		expect(r.indexOf('RCUP')).toBeGreaterThan(0);
		expect(r).not.toContain('ODCONJ');
	});
	it('codes: finds by plain words (cornea -> RK, LK, BK…)', () => {
		const r = codes('cornea');
		expect(r).toEqual(expect.arrayContaining(['RK', 'LK']));
	});
	it('codes: a typo gets "did you mean" suggestions', () => {
		const r = suggestCodes('rcx', (e) => describeCode(e, t));
		expect(r.some((s) => s.fuzzy)).toBe(true);
		expect(r.map((s) => s.entry.code)).toContain('RC');
	});
	it('codes: nothing for an empty query', () => {
		expect(codes('')).toEqual([]);
	});
});

describe('caret context', () => {
	it('a code being typed', () => {
		expect(shorthandContext('rc', 2)).toEqual({ mode: 'code', start: 0, end: 2, query: 'rc' });
		expect(shorthandContext('rc:quiet; lk', 12)).toEqual({ mode: 'code', start: 10, end: 12, query: 'lk' });
	});
	it('a finding after the colon, keeping a grade and earlier findings', () => {
		const s = 'rc:1+ inj';
		expect(shorthandContext(s, s.length)).toMatchObject({ mode: 'term', code: 'RC', query: 'inj', start: 6, end: 9 });
		const s2 = 'rc:papillae, foll';
		expect(shorthandContext(s2, s2.length)).toMatchObject({ mode: 'term', query: 'foll', start: 13 });
	});
	it('nothing to suggest for free text without a colon', () => {
		expect(shorthandContext('rc 2+ injection', 15)).toBeNull();
		expect(shorthandContext('', 0)).toBeNull();
		expect(shorthandContext('rc:x; ', 6)).toBeNull();
	});
	it('accepting a code adds its colon once; accepting a finding keeps the grade and ".a"', () => {
		const c = shorthandContext('r', 1)!;
		expect(acceptInto('r', c, 'rc:')).toEqual({ text: 'rc:', caret: 3 });
		const c2 = shorthandContext('rx:quiet', 2)!;
		expect(acceptInto('rx:quiet', c2, 'rc:')).toEqual({ text: 'rc:quiet', caret: 3 });
		const s = 'rc:1+ inj.a';
		const c3 = shorthandContext(s, 9)!;
		expect(acceptInto(s, c3, 'injection').text).toBe('rc:1+ injection.a');
	});
});

describe('findings after the colon', () => {
	const picks = seedRows();
	it('normal value first, then the row quick picks, no "clear field"', () => {
		const terms = termsFor('rc', picks, SEED_DEFAULTS);
		expect(terms[0]).toMatchObject({ text: 'quiet', normal: true });
		expect(terms.map((x) => x.text)).toContain('injection');
		expect(terms.every((x) => x.text)).toBe(true);
		// "quiet" is both the normal and a pick: listed once
		expect(terms.filter((x) => x.text === 'quiet')).toHaveLength(1);
	});
	it('abbreviated picks insert the full text', () => {
		const terms = termsFor('rbrow', picks, SEED_DEFAULTS);
		expect(terms.find((x) => x.primary === 'seb ker')?.text).toBe('seborrheic keratosis');
	});
	it('unknown codes and history codes have no findings', () => {
		expect(termsFor('zz', picks, SEED_DEFAULTS)).toEqual([]);
		expect(termsFor('poh', picks, SEED_DEFAULTS)).toEqual([]);
	});
});

describe('help sheet table', () => {
	it('groups codes that do the same thing, shortest first, and leaves out field ids', () => {
		const rows = codeRows();
		const conj = rows.find((r) => r.codes.includes('BC'))!;
		expect(conj.codes).toEqual(['C', 'BC']);
		expect(rows.some((r) => r.codes.includes('ODCONJ'))).toBe(false);
		expect(rows.find((r) => r.codes.includes('DAS'))!.codes).toEqual(expect.arrayContaining(['DAS', 'DANTSEG']));
	});
});

describe('recent codes', () => {
	it('keeps known codes, most recent first, no duplicates', () => {
		expect(rememberCodes(['rc', 'zzz', 'lk'], ['LK', 'BC'])).toEqual(['RC', 'LK', 'BC']);
	});
	it('reads the code off committed entries', () => {
		expect(codesOf(['rc:quiet', 'das', ''])).toEqual(['rc', 'das']);
	});
});

describe('glossary in descriptions', () => {
	it('adds the plain name of an abbreviated field', async () => {
		const { describeCodePlain } = await import('./describe.ts');
		const mrd = describeCodePlain(CODE_ENTRY.get('MRD')!, t);
		expect(mrd.startsWith('MRD, both eyes')).toBe(true);
		expect(describeCodePlain(CODE_ENTRY.get('RC')!, t)).toBe('Conjunctiva, right eye');
	});
});
