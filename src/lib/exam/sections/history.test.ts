import { describe, expect, it } from 'vitest';
import { FIELDS, FIELD_BY_ID, SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { buildReport } from '#lib/exam/report.ts';
import { ALIASES, COMMANDS } from '#lib/shorthand/codes.ts';
import { applyOps, parseShorthand, type Findings } from '#lib/shorthand/parse.ts';
import {
	CHRONIC_IDS,
	ELEMENT_IDS,
	HISTORY_ALIASES,
	HISTORY_DEFAULTS,
	HISTORY_FIELDS,
	ROS_IDS,
	ROS_SYSTEMS,
	chronicFill,
	complaintIds,
	historyReport,
	hpiLevel,
	isRosNegative,
	rosAllNegative,
	rosClear
} from './history.ts';

const f = (o: Record<string, string>): Findings =>
	Object.fromEntries(Object.entries(o).map(([k, value]) => [k, { value, isDefault: false }]));
const sec = (x: Findings, t: string) => historyReport(x).find((s) => s.title === t);
const titles = (x: Findings) => historyReport(x).map((s) => s.title);

describe('history catalog', () => {
	it('field ids are unique and do not collide with any other catalog field', () => {
		const ids = FIELDS.map((x) => x.id);
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
		for (const d of HISTORY_FIELDS) expect(FIELD_BY_ID.get(d.id), d.id).toBe(d);
	});

	it('uses the form_eye_hpi / form_eye_ros column names', () => {
		// 3 complaints x (CC + HPI + 8 elements) + 3 chronic + 12 ROS + ROS comments
		expect(HISTORY_FIELDS).toHaveLength(30 + 3 + 12 + 1);
		for (const id of ['CC1', 'HPI1', 'TIMING1', 'MODIFY2', 'ASSOCIATED3', 'LOCATION3', 'CHRONIC3', 'ROSGENERAL', 'ROSMUSCULO', 'ROSENDOCRINE', 'ROSCOMMENTS'])
			expect(FIELD_BY_ID.has(id), id).toBe(true);
		expect(ELEMENT_IDS).toHaveLength(24);
		expect(complaintIds(2).elements).toContain('SEVERITY2');
	});

	it('every field is section HPI, OU, not expanded, with the column length', () => {
		for (const d of HISTORY_FIELDS) {
			expect(d.section).toBe('HPI');
			expect(d.eye).toBe('OU');
			expect(d.expand).toBe(false);
		}
		// varchar(255) on complaint 1 and chronic; text elsewhere
		expect(FIELD_BY_ID.get('CC1')?.maxLength).toBe(255);
		expect(FIELD_BY_ID.get('TIMING1')?.maxLength).toBe(255);
		expect(FIELD_BY_ID.get('CHRONIC2')?.maxLength).toBe(255);
		expect(FIELD_BY_ID.get('HPI1')?.maxLength).toBe(4000);
		expect(FIELD_BY_ID.get('CC2')?.maxLength).toBe(4000);
		expect(FIELD_BY_ID.get('ROSCV')?.maxLength).toBe(4000);
	});

	it('has no defaults, so the D command never writes HPI or ROS text', () => {
		expect(HISTORY_DEFAULTS).toEqual({});
		for (const d of HISTORY_FIELDS) expect(SEED_DEFAULTS[d.id], d.id).toBeUndefined();
		const { findings } = applyOps({}, parseShorthand('d').ops);
		for (const d of HISTORY_FIELDS) expect(findings[d.id], d.id).toBeUndefined();
	});

	it('aliases point at real fields and do not shadow other codes', () => {
		for (const [code, ids] of Object.entries(HISTORY_ALIASES)) {
			expect(code).toBe(code.toUpperCase());
			for (const id of ids) expect(FIELD_BY_ID.has(id), `${code} -> ${id}`).toBe(true);
			expect(FIELD_BY_ID.has(code), `${code} is also a field id`).toBe(false);
			expect(COMMANDS[code], `${code} is also a command`).toBeUndefined();
			expect(ALIASES[code]).toEqual(ids);
		}
	});
});

describe('history shorthand', () => {
	it('CC and HPI write complaint 1 verbatim (no abbreviation expansion)', () => {
		const { ops, errors } = parseShorthand('cc:blurry va ou; hpi worse at night x 2 wks; severity:6/10');
		expect(errors).toEqual([]);
		const { findings } = applyOps({}, ops);
		expect(findings.CC1.value).toBe('blurry va ou');
		expect(findings.HPI1.value).toBe('worse at night x 2 wks');
		expect(findings.SEVERITY1.value).toBe('6/10');
	});

	it('column names reach complaints 2 and 3 and the ROS', () => {
		const { findings } = applyOps({}, parseShorthand('CC2:itchy eyes; TIMING3:mornings; ROSCV:HTN; roscom:reviewed').ops);
		expect(findings.CC2.value).toBe('itchy eyes');
		expect(findings.TIMING3.value).toBe('mornings');
		expect(findings.ROSCV.value).toBe('HTN');
		expect(findings.ROSCOMMENTS.value).toBe('reviewed');
	});

	it('clips complaint 1 to its varchar(255) column', () => {
		const { findings } = applyOps({}, parseShorthand(`CC:${'x'.repeat(300)}`).ops);
		expect(findings.CC1.value).toHaveLength(255);
	});
});

describe('hpiLevel (§7.1)', () => {
	it('counts element boxes across all three tabs and chronic boxes separately', () => {
		expect(hpiLevel({})).toEqual({ elements: 0, chronic: 0, detailed: false });
		const x = f({ TIMING1: 'a', QUALITY1: 'b', LOCATION3: 'c', CC1: 'not an element', HPI1: 'nor this', CHRONIC1: 'x' });
		expect(hpiLevel(x)).toEqual({ elements: 3, chronic: 1, detailed: false });
	});

	it('FIX: Severity on tab 2 counts', () => {
		const x = f({ TIMING1: 'a', QUALITY1: 'b', LOCATION3: 'c', SEVERITY2: 'mild' });
		expect(hpiLevel(x)).toEqual({ elements: 4, chronic: 0, detailed: true });
	});

	it('is detailed with four elements or three chronic problems, and ignores blanks', () => {
		expect(hpiLevel(f({ TIMING1: 'a', CONTEXT1: 'b', SEVERITY1: 'c', DURATION1: 'd' })).detailed).toBe(true);
		expect(hpiLevel(f({ CHRONIC1: 'a', CHRONIC2: 'b', CHRONIC3: 'c' })).detailed).toBe(true);
		expect(hpiLevel(f({ CHRONIC1: 'a', CHRONIC2: 'b', TIMING1: '  ' })).detailed).toBe(false);
	});
});

describe('chronicFill (§7.4)', () => {
	it('fills the first empty box and never overwrites a filled one', () => {
		const { next, changed } = chronicFill(f({ CHRONIC1: 'Glaucoma H40.11' }), ['Diabetes E11.9\nwell controlled']);
		expect(changed).toEqual(['CHRONIC2']);
		expect(next.CHRONIC1.value).toBe('Glaucoma H40.11');
		expect(next.CHRONIC2.value).toBe('Diabetes E11.9\nwell controlled');
	});

	it('skips text already in any box and is idempotent', () => {
		const start = f({ CHRONIC1: '', CHRONIC2: 'Dry eye H04.123' });
		const a = chronicFill(start, ['Dry eye H04.123', 'Migraine G43.909']);
		expect(a.changed).toEqual(['CHRONIC1']);
		expect(a.next.CHRONIC1.value).toBe('Migraine G43.909');
		const b = chronicFill(a.next, ['Dry eye H04.123', 'Migraine G43.909']);
		expect(b.changed).toEqual([]);
	});

	it('drops what does not fit and ignores empty texts', () => {
		const { next, changed } = chronicFill({}, ['', 'a', 'b', 'c', 'd']);
		expect(changed).toEqual([...CHRONIC_IDS]);
		expect(CHRONIC_IDS.map((id) => next[id].value)).toEqual(['a', 'b', 'c']);
	});

	it('does not mutate the input', () => {
		const start = f({ CHRONIC1: '' });
		chronicFill(start, ['x']);
		expect(start.CHRONIC1.value).toBe('');
	});
});

describe('ROS buttons', () => {
	it('"All negative" fills only empty systems', () => {
		const { next, changed } = rosAllNegative(f({ ROSCV: 'HTN', ROSGI: '' }));
		expect(changed).toHaveLength(11);
		expect(changed).not.toContain('ROSCV');
		expect(next.ROSCV.value).toBe('HTN');
		expect(next.ROSGI.value).toBe('negative');
		expect(rosAllNegative(next).changed).toEqual([]);
	});

	it('"Clear ROS" empties systems and comments, reporting only real changes', () => {
		const { next, changed } = rosClear(f({ ROSCV: 'HTN', ROSCOMMENTS: 'x', CC1: 'keep' }));
		expect(changed).toEqual(['ROSCV', 'ROSCOMMENTS']);
		expect(next.ROSCV.value).toBe('');
		expect(next.CC1.value).toBe('keep');
	});

	it('recognises the Negative toggle value', () => {
		expect(isRosNegative(' Negative ')).toBe(true);
		expect(isRosNegative('negative for chest pain')).toBe(false);
		expect(isRosNegative(undefined)).toBe(false);
	});
});

describe('historyReport (§13.2 item 1)', () => {
	it('prints nothing for an empty HPI and ROS', () => {
		expect(historyReport({})).toEqual([]);
		expect(historyReport(f({ CC1: '  ', ROSCV: '' }))).toEqual([]);
	});

	it('always prints chief complaint and HPI for complaint 1, elements only when filled', () => {
		const s = sec(f({ CC1: 'blurry vision', TIMING1: 'since Monday', SEVERITY2: 'x' }), 'History of present illness')!;
		expect(s.table?.head).toEqual(['Chief complaint', 'blurry vision']);
		expect(s.table?.body).toEqual([
			['HPI', ''],
			['Timing', 'since Monday']
		]);
	});

	it('prints complaints 2 and 3 only when their CC is filled', () => {
		const x = f({ CC1: 'a', HPI2: 'text but no complaint', TIMING2: 'x', CC3: 'flashes', QUALITY3: 'brief' });
		expect(titles(x)).toEqual(['History of present illness', 'History of present illness, complaint 3']);
		const s = sec(x, 'History of present illness, complaint 3')!;
		expect(s.table?.head).toEqual(['Chief complaint 3', 'flashes']);
		expect(s.table?.body).toEqual([['Quality', 'brief']]);
	});

	it('prints chronic problems when any box is filled, on one line each', () => {
		const s = sec(f({ CHRONIC2: 'Glaucoma H40.11\nstable on drops' }), 'Chronic or inactive problems')!;
		expect(s.table?.body).toEqual([['1', 'Glaucoma H40.11 - stable on drops']]);
		expect(titles(f({ CHRONIC2: 'x' }))[0]).toBe('History of present illness');
	});

	it('FIX: prints ROS only when recorded, never an implied "Negative"', () => {
		expect(titles(f({ CC1: 'a' }))).not.toContain('Review of systems');
		const s = sec(f({ ROSGENERAL: 'negative', ROSMUSCULO: 'low back pain' }), 'Review of systems')!;
		expect(s.summary).toBe('Negative: GEN');
		expect(s.table?.body).toEqual([['ORTHO/MSK', 'low back pain']]);
		expect(titles(f({ ROSGENERAL: 'negative' }))).toEqual(['Review of systems']);
		const c = sec(f({ ROSCOMMENTS: 'patient declined' }), 'Review of systems')!;
		expect(c.table).toBeUndefined();
		expect(c.comments).toBe('patient declined');
	});

	it('every ROS system has a short label and the report leads with HPI', () => {
		expect(ROS_SYSTEMS.map((s) => s.short)).toEqual(['GEN', 'HEENT', 'CV', 'PULM', 'GI', 'GU', 'DERM', 'NEURO', 'PSYCH', 'ORTHO/MSK', 'IMMUNO', 'ENDO']);
		expect(ROS_IDS).toHaveLength(12);
		const all = buildReport(f({ CC1: 'a', SCODVA: '20/20', ROSCV: 'HTN' }));
		expect(all[0].title).toBe('History of present illness');
		expect(all[1].title).toBe('Review of systems');
	});
});
