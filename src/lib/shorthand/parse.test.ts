import { describe, expect, it } from 'vitest';
import { applyOps, parseShorthand, type Findings } from './parse.ts';
import { expandVocab } from './vocab.ts';

const run = (input: string, start: Findings = {}) => {
	const { ops, errors } = parseShorthand(input);
	return { ...applyOps(start, ops), errors };
};
const v = (f: Findings, id: string) => f[id]?.value;

describe('grammar', () => {
	it('sets a single-eye field by alias, case-insensitive', () => {
		const { findings, errors } = run('rc:1+ injection');
		expect(errors).toEqual([]);
		expect(v(findings, 'ODCONJ')).toBe('1+ injection');
		expect(v(findings, 'OSCONJ')).toBeUndefined();
	});

	it('handles several entries separated by semicolons and skips empties', () => {
		const { findings } = run('rc:quiet;; lk:clear ;');
		expect(v(findings, 'ODCONJ')).toBe('quiet');
		expect(v(findings, 'OSCORNEA')).toBe('clear');
	});

	it('writes both eyes with B-prefixed and bare multi-field codes', () => {
		const { findings } = run('bk:clear; L:1+ NS');
		expect(v(findings, 'ODCORNEA')).toBe('clear');
		expect(v(findings, 'OSCORNEA')).toBe('clear');
		expect(v(findings, 'ODLENS')).toBe('1+ NS');
		expect(v(findings, 'OSLENS')).toBe('1+ NS');
	});

	it('accepts exact field ids as codes', () => {
		expect(v(run('odkthickness:545').findings, 'ODKTHICKNESS')).toBe('545');
	});

	it('accepts a space instead of a colon when the code is known', () => {
		expect(v(run('rc 2+ injection').findings, 'ODCONJ')).toBe('2+ injection');
	});

	it('replaces by default and appends with .a (no leading comma on an empty field)', () => {
		const start: Findings = { ODCONJ: { value: 'quiet', isDefault: true } };
		expect(v(run('rc:pinguecula', start).findings, 'ODCONJ')).toBe('pinguecula');
		expect(v(run('rc:pinguecula.a', start).findings, 'ODCONJ')).toBe('quiet, pinguecula');
		expect(v(run('lc:pinguecula.a').findings, 'OSCONJ')).toBe('pinguecula');
	});

	it('clears the default marker when a field is edited', () => {
		const start: Findings = { ODCONJ: { value: 'quiet', isDefault: true } };
		expect(run('rc:quiet.a', start).findings.ODCONJ.isDefault).toBe(false);
	});

	it('treats a newline as a space instead of dropping text', () => {
		expect(v(run('rc:1+ injection\nnasal').findings, 'ODCONJ')).toBe('1+ injection nasal');
	});

	it('appends a code-less entry to the previous field in the same batch', () => {
		expect(v(run('rc:pinguecula; also small nevus').findings, 'ODCONJ')).toBe('pinguecula, also small nevus');
	});
});

describe('commands', () => {
	it('D and DAS fill defaults and mark them as defaults', () => {
		for (const cmd of ['D', 'das', 'DANTSEG']) {
			const { findings } = run(cmd);
			expect(findings.ODAC).toEqual({ value: 'deep and quiet', isDefault: true });
			expect(findings.OSLENS).toEqual({ value: 'clear', isDefault: true });
		}
	});

	it('defaults replace existing text (parity)', () => {
		const start: Findings = { ODLENS: { value: '2+ NS', isDefault: false } };
		expect(v(run('d', start).findings, 'ODLENS')).toBe('clear');
	});

	it('clear commands empty the section', () => {
		const start: Findings = { ODLENS: { value: '2+ NS', isDefault: false }, OSTBUT: { value: '8', isDefault: false } };
		const { findings, changed } = run('cas', start);
		expect(v(findings, 'ODLENS')).toBe('');
		expect(v(findings, 'OSTBUT')).toBe('');
		expect(changed.sort()).toEqual(['ODLENS', 'OSTBUT']);
	});

	it('commands followed by entries run in order', () => {
		expect(v(run('d; rl:2+ NS').findings, 'ODLENS')).toBe('2+ NS');
	});
});

describe('unknown codes (FIX: never silently appended)', () => {
	it('reports unknown codes with suggestions and still applies the good entries', () => {
		const { findings, errors } = run('rc:quiet; rcc:oops');
		expect(v(findings, 'ODCONJ')).toBe('quiet');
		expect(errors).toHaveLength(1);
		expect(errors[0].code).toBe('RCC');
		expect(errors[0].suggestions).toContain('RC');
	});

	it('a code-less first entry is an error, not a write', () => {
		const { findings, errors } = run('hello there');
		expect(findings).toEqual({});
		expect(errors[0].code).toBe('HELLO');
	});

	it('a bare code without a value asks for one', () => {
		expect(run('rc').errors[0].message).toMatch(/needs a value/);
	});

	it('does not accept non-clinical ids', () => {
		expect(run('pid:5').errors[0].code).toBe('PID');
	});
});

describe('spec §2.6 code fixes in this section', () => {
	it('LL is left lens', () => {
		expect(Object.keys(run('ll:1+ NS').findings)).toEqual(['OSLENS']);
	});
	it('SCH1/SCH2 write both eyes', () => {
		const { findings } = run('sch1:15; sch2:10');
		expect([v(findings, 'ODSCHIRMER1'), v(findings, 'OSSCHIRMER1')]).toEqual(['15', '15']);
		expect([v(findings, 'ODSCHIRMER2'), v(findings, 'OSSCHIRMER2')]).toEqual(['10', '10']);
	});
	it('LH writes the left Hertel field', () => {
		expect(Object.keys(run('lh:17').findings)).toEqual(['OSHERTEL']);
	});
	it('CN7 writes CN VII, not CN V', () => {
		expect(Object.keys(run('cn7:intact').findings).sort()).toEqual(['LCNVII', 'RCNVII']);
	});
	it('BAD and VF write both eyes', () => {
		expect(Object.keys(run('bad:normal').findings).sort()).toEqual(['LADNEXA', 'RADNEXA']);
		expect(Object.keys(run('vf:9').findings).sort()).toEqual(['LVFISSURE', 'RVFISSURE']);
	});
	it('CUP is the cup; BC stays conjunctiva', () => {
		expect(Object.keys(run('cup:0.4').findings).sort()).toEqual(['ODCUP', 'OSCUP']);
		expect(Object.keys(run('bc:quiet').findings).sort()).toEqual(['ODCONJ', 'OSCONJ']);
	});
	it('BLL means both lower lids', () => {
		expect(Object.keys(run('bll:ectropion').findings).sort()).toEqual(['LLL', 'RLL']);
	});
});

describe('Hertel', () => {
	it('HERT:OD-base-OS fills three fields', () => {
		const { findings, errors } = run('hert:15-100-16.5');
		expect(errors).toEqual([]);
		expect([v(findings, 'ODHERTEL'), v(findings, 'HERTELBASE'), v(findings, 'OSHERTEL')]).toEqual(['15', '100', '16.5']);
	});
	it('malformed HERT is an error, not a crash', () => {
		const { findings, errors } = run('hert:fifteen');
		expect(findings).toEqual({});
		expect(errors[0].message).toMatch(/OD-base-OS/);
	});
});

describe('section commands', () => {
	it('D fills every section; DEXT and DRET only their own', () => {
		const all = run('d').findings;
		expect([v(all, 'RUL'), v(all, 'ODCONJ'), v(all, 'ODDISC')]).toEqual(['normal lids and lashes', 'quiet', 'pink']);
		const ext = run('dext').findings;
		expect(v(ext, 'RBROW')).toBe('no brow ptosis');
		expect(v(ext, 'ODCONJ')).toBeUndefined();
		const ret = run('dret').findings;
		expect(v(ret, 'OSCUP')).toBe('0.3');
		expect(v(ret, 'RUL')).toBeUndefined();
	});
	it('CEXT and CRET clear only their section', () => {
		const start: Findings = {
			RUL: { value: 'ptosis', isDefault: false },
			ODDISC: { value: 'pallor', isDefault: false },
			ODLENS: { value: '2+ NS', isDefault: false }
		};
		expect(run('cext', start).changed).toEqual(['RUL']);
		expect(run('cret', start).changed).toEqual(['ODDISC']);
	});
});

describe('vocabulary expansion', () => {
	it('expands whole words', () => {
		expect(expandVocab('tr spk inf')).toBe('trace SPK inferior');
		expect(expandVocab('2+ inj nas')).toBe('2+ injection nasal');
	});
	it('does not swallow the following space (FIX)', () => {
		expect(expandVocab('nas pterygium')).toBe('nasal pterygium');
		expect(expandVocab('temp lac noted')).toBe('temporal laceration noted');
	});
	it('expands clock hours once', () => {
		expect(expandVocab('nevus at 3 o')).toBe("nevus at 3 o'clock");
		expect(expandVocab("at 3 o'clock")).toBe("at 3 o'clock");
	});
	it('uses the corrected Krukenberg spelling', () => {
		expect(expandVocab('ks')).toBe('Krukenberg spindle');
	});
	it('does not expand measurement fields', () => {
		expect(v(run('rtbut:8 tr').findings, 'ODTBUT')).toBe('8 tr');
	});
});
