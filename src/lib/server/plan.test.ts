import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { loadIcd10 } from './icd10.ts';
import {
	addItem,
	addNewDx,
	addOrderOption,
	deleteItem,
	deleteOrderOption,
	getCandidates,
	getPlanData,
	getPlanForReport,
	listItems,
	listOrderOptions,
	PlanConflictError,
	PlanDuplicateError,
	PlanValidationError,
	reorderItems,
	reorderOrderOptions,
	saveOrders,
	updateItem,
	updateOrderOption
} from './plan.ts';
import { ICD10_FIXTURE } from '#lib/plan/icd10.fixture.ts';
import { parseNewDx } from '#lib/plan/newdx.ts';
import { ORDER_SEED } from '#lib/plan/orders.ts';

const TODAY = '2026-10-06';
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
	loadIcd10(db, ICD10_FIXTURE, 'fixture-test');
});

const titles = (pid = 1, eid = 1) => listItems(db, pid, eid)!.map((i) => `${i.seq}:${i.title}`);
const add = (title: string, extra: Record<string, unknown> = {}, opts: { index?: number; allowDuplicate?: boolean } = {}) =>
	addItem(db, 1, 1, 1, { title, ...extra }, opts)!;

describe('New Dx parsing (§10.4)', () => {
	it('first line = title, trailing code token = code, later lines = plan', () => {
		expect(parseNewDx('Glaucoma suspect ICD10:H40.003\nOCT RNFL next visit\nRTC 6 months')).toEqual({
			title: 'Glaucoma suspect',
			code: 'H40.003',
			plan: 'OCT RNFL next visit\nRTC 6 months'
		});
		expect(parseNewDx('Nuclear cataract OU h2513')).toEqual({ title: 'Nuclear cataract OU', code: 'H25.13', plan: '' });
		expect(parseNewDx('Dry eye - H04.123')).toEqual({ title: 'Dry eye', code: 'H04.123', plan: '' });
	});
	it('ignores text under 2 characters and keeps code-like words in the title', () => {
		expect(parseNewDx(' x ')).toBeNull();
		expect(parseNewDx('')).toBeNull();
		expect(parseNewDx('Diabetes, check A1c')).toEqual({ title: 'Diabetes, check A1c', code: '', plan: '' });
		expect(parseNewDx('Vitamin B12')).toEqual({ title: 'Vitamin B12', code: '', plan: '' });
	});
	it('adds a free item with the code type set (FIX) and the description as code text', () => {
		const r = addNewDx(db, 1, 1, 1, 'Cataract h2513\nDiscuss surgery')!;
		expect(r.item).toMatchObject({
			kind: 'free',
			title: 'Cataract',
			codes: 'H25.13',
			codeType: 'ICD10',
			codeText: 'ICD10:H25.13 (Age-related nuclear cataract, bilateral)',
			plan: 'Discuss surgery'
		});
		expect(addNewDx(db, 1, 1, 1, 'a')!.item).toBeNull();
		// A code alone takes its description as the title.
		expect(addNewDx(db, 1, 1, 1, 'H25.11')!.item!.title).toBe('Age-related nuclear cataract, right eye');
	});
});

describe('items saved by id (§10.5 FIX)', () => {
	it('adds at the end or at an index and numbers from 1', () => {
		add('A');
		add('C');
		add('B', {}, { index: 1 });
		expect(titles()).toEqual(['1:A', '2:B', '3:C']);
	});
	it('updates one item in place, leaving the others (ids, order) untouched', () => {
		const a = add('A', { plan: 'old' });
		const b = add('B');
		const u = updateItem(db, 1, 1, 1, a.id, { plan: 'new plan' })!;
		expect(u).toMatchObject({ id: a.id, title: 'A', plan: 'new plan', seq: 1 });
		expect(listItems(db, 1, 1)!.map((i) => i.id)).toEqual([a.id, b.id]);
	});
	it('editing codes refreshes the code text (FIX: never stale); clearing codes clears it', () => {
		const a = add('Cataract', { codes: 'H25.11' });
		expect(a.codeText).toBe('ICD10:H25.11 (Age-related nuclear cataract, right eye)');
		const u = updateItem(db, 1, 1, 1, a.id, { codes: 'h2513, H11.151' })!;
		expect(u.codes).toBe('H25.13, H11.151');
		expect(u.codeText).toBe('ICD10:H25.13 (Age-related nuclear cataract, bilateral); ICD10:H11.151 (Pinguecula, right eye)');
		expect(updateItem(db, 1, 1, 1, a.id, { codes: '' })).toMatchObject({ codes: '', codeText: '', codeType: '' });
	});
	it('refuses codes that are not billable ICD-10-CM codes', () => {
		const a = add('X');
		expect(() => updateItem(db, 1, 1, 1, a.id, { codes: 'H25.1' })).toThrow(/H25.1 is a category/);
		expect(() => updateItem(db, 1, 1, 1, a.id, { codes: 'Q99.99' })).toThrow(/not in the ICD-10-CM code set/);
		expect(() => updateItem(db, 1, 1, 1, a.id, { codes: 'hello' })).toThrow(/not an ICD-10-CM code/);
	});
	it('issue items keep only usable codes and start with the given plan', () => {
		const i = addItem(db, 1, 1, 1, { kind: 'issue', title: 'Type 2 diabetes', codes: 'E11.9; junk; H25.1', plan: 'Diet controlled', link: 'issue:4' })!;
		expect(i).toMatchObject({ kind: 'issue', codes: 'E11.9', plan: 'Diet controlled', link: 'issue:4' });
	});
	it('reorders by id and refuses a stale list', () => {
		const a = add('A');
		const b = add('B');
		const c = add('C');
		expect(reorderItems(db, 1, 1, [c.id, a.id, b.id])!.map((i) => i.title)).toEqual(['C', 'A', 'B']);
		expect(() => reorderItems(db, 1, 1, [a.id, b.id])).toThrow(PlanConflictError);
		expect(() => reorderItems(db, 1, 1, [a.id, b.id, b.id])).toThrow(PlanConflictError);
	});
	it('deletes one item and renumbers the rest', () => {
		const a = add('A');
		add('B');
		add('C');
		expect(deleteItem(db, 1, 1, a.id)).toBe(true);
		expect(titles()).toEqual(['1:B', '2:C']);
		expect(deleteItem(db, 1, 1, a.id)).toBe(false);
	});
	it('warns about a duplicate (same title + first 20 characters of plan) instead of dropping it', () => {
		const a = add('Dry eye', { plan: 'Artificial tears four times a day' });
		let err: unknown;
		try {
			add('dry eye', { plan: 'Artificial tears four times daily, warm compresses' });
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(PlanDuplicateError);
		expect((err as PlanDuplicateError).existingId).toBe(a.id);
		expect((err as Error).message).toMatch(/already item 1/);
		expect(titles()).toEqual(['1:Dry eye']);
		// Different plan start: fine. Explicit allowDuplicate: kept.
		add('Dry eye', { plan: 'Punctal plugs' });
		add('Dry eye', { plan: 'Artificial tears four times a day' }, { allowDuplicate: true });
		expect(titles()).toHaveLength(3);
		// Editing into a duplicate is also caught.
		const b = add('Blepharitis');
		expect(() => updateItem(db, 1, 1, 1, b.id, { title: 'Dry eye', plan: 'Punctal plugs' })).toThrow(PlanDuplicateError);
	});
	it('validates titles and lengths', () => {
		expect(() => add('')).toThrow(/title/);
		expect(() => add('x'.repeat(201))).toThrow(/200/);
		expect(() => addItem(db, 1, 1, 1, { kind: 'bogus', title: 'A' })).toThrow(PlanValidationError);
	});
});

describe('scoping', () => {
	it('a wrong patient for the visit reaches nothing', () => {
		const a = add('A');
		expect(listItems(db, 2, 1)).toBeNull();
		expect(addItem(db, 2, 1, 1, { title: 'B' })).toBeNull();
		expect(updateItem(db, 2, 1, 1, a.id, { title: 'Hacked' })).toBeNull();
		expect(deleteItem(db, 2, 1, a.id)).toBe(false);
		expect(reorderItems(db, 2, 1, [a.id])).toBeNull();
		expect(saveOrders(db, 2, 1, 1, [], '')).toBeNull();
		expect(getPlanData(db, 2, 1, 1)).toBeNull();
		expect(getCandidates(db, 2, 1, {})).toBeNull();
		expect(titles()).toEqual(['1:A']);
	});
	it('an item id from another visit is not found', () => {
		const other = addItem(db, 2, 2, 1, { title: 'Other patient' })!;
		expect(updateItem(db, 1, 1, 1, other.id, { title: 'Hacked' })).toBeNull();
		expect(deleteItem(db, 1, 1, other.id)).toBe(false);
		expect(listItems(db, 2, 2)!.map((i) => i.title)).toEqual(['Other patient']);
	});
});

describe('orders (§10.6)', () => {
	it('seeds the provider list once from the defaults, then it is the provider\'s own', () => {
		const list = listOrderOptions(db, 1);
		expect(list.map((o) => o.label)).toEqual(ORDER_SEED.map((o) => o.label));
		expect(list.find((o) => o.cpt === '92133')?.label).toMatch(/OCT optic nerve/);
		for (const o of list) deleteOrderOption(db, 1, o.id);
		expect(listOrderOptions(db, 1)).toEqual([]); // an emptied list does not re-seed
	});
	it('edits the list: add, rename, CPT, reorder, remove', () => {
		const added = addOrderOption(db, 1, { label: 'Anterior segment photos', cpt: '92287' });
		expect(() => addOrderOption(db, 1, { label: 'anterior segment photos' })).toThrow(/already/);
		expect(() => addOrderOption(db, 1, { label: 'Bad CPT', cpt: '123' })).toThrow(/CPT/);
		expect(updateOrderOption(db, 1, added.id, { label: 'Anterior photos', cpt: '' })).toEqual({ id: added.id, label: 'Anterior photos', cpt: '' });
		const ids = listOrderOptions(db, 1).map((o) => o.id);
		const reversed = reorderOrderOptions(db, 1, [...ids].reverse());
		expect(reversed[0].label).toBe('Anterior photos');
		expect(() => reorderOrderOptions(db, 1, ids.slice(1))).toThrow(PlanConflictError);
		expect(updateOrderOption(db, 99, added.id, { label: 'x' })).toBeNull();
	});
	it('saves per exam: another same-day exam keeps its orders (FIX)', () => {
		// A second exam for the same patient, provider and date.
		db.prepare("INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (9, 1, 1, ?, 'Post-op')").run(TODAY);
		const [oct, vf] = listOrderOptions(db, 1);
		saveOrders(db, 1, 9, 1, [vf.id], 'Other exam plan');
		const r = saveOrders(db, 1, 1, 1, [vf.id, oct.id], 'RTC 3 months')!;
		expect(r.orders.map((o) => o.label)).toEqual([oct.label, vf.label]); // list order
		expect(r.orders[0]).toEqual({ optionId: oct.id, label: oct.label, cpt: '92133' });
		saveOrders(db, 1, 1, 1, [], 'RTC 3 months'); // no orders checked: fine
		expect(getPlanData(db, 1, 1, 1)!.orders).toEqual([]);
		const other = getPlanData(db, 1, 9, 1)!;
		expect(other.orders).toEqual([vf.label]);
		expect(other.orderPlan).toBe('Other exam plan');
		const row = db.prepare('SELECT status, placed_on, placed_by, priority FROM visit_orders WHERE encounter_id = 9').get();
		expect(row).toEqual({ status: 'pending', placed_on: TODAY, placed_by: 1, priority: 1 });
	});
	it('a removed or renamed list item never rewrites a saved visit', () => {
		const [oct] = listOrderOptions(db, 1);
		saveOrders(db, 1, 1, 1, [oct.id], '');
		updateOrderOption(db, 1, oct.id, { label: 'Renamed' });
		expect(getPlanData(db, 1, 1, 1)!.orders).toEqual([oct.label]);
		deleteOrderOption(db, 1, oct.id);
		// Resaving with the removed id keeps the visit's copy.
		expect(saveOrders(db, 1, 1, 1, [oct.id], '')!.orders.map((o) => o.label)).toEqual([oct.label]);
		expect(() => saveOrders(db, 1, 1, 1, [123456], '')).toThrow(PlanValidationError);
	});
	it('plan data exposes items, orders with CPT and the provider list', () => {
		add('Cataract', { codes: 'H25.13' });
		const [oct] = listOrderOptions(db, 1);
		saveOrders(db, 1, 1, 1, [oct.id], 'RTC 6 months');
		const d = getPlanData(db, 1, 1, 1)!;
		expect(d.items[0]).toMatchObject({ title: 'Cataract', codes: 'H25.13', codeType: 'ICD10' });
		expect(d.orderDetails).toEqual([{ optionId: oct.id, label: oct.label, cpt: '92133' }]);
		expect(d.orderPlan).toBe('RTC 6 months');
		expect(d.orderOptions.length).toBe(ORDER_SEED.length);
		expect(d.canEditOrders).toBe(true);
		expect(getPlanData(db, 1, 1, 2)!.canEditOrders).toBe(false);
	});
});

describe('candidates and report', () => {
	it('runs the engine over the given findings and lists the patient issues', () => {
		const c = getCandidates(db, 1, 1, { ODLENS: '2+ NS', OSLENS: '2+ NS', ODVESSELS: 'BDR' })!;
		expect(c.findings.map((x) => `${x.title}=${x.codes}`)).toEqual(['Nuclear sclerosis OU=H25.13', 'Diabetic retinopathy OD=E11.3391']);
		expect(c.poh.map((x) => x.title)).toEqual(['Glaucoma suspect']);
		expect(c.poh[0].plan).toBe('Watch cup-to-disc ratio OS');
		expect(c.pmh.map((x) => x.title)).toEqual(['Hypertension', 'Type 2 diabetes']);
	});
	it('the report gets items in order, orders and the plan; null when nothing is recorded', () => {
		expect(getPlanForReport(db, 1)).toBeNull();
		add('Cataract', { codes: 'H25.13', plan: 'Discuss surgery\nRTC 3 months' });
		add('Dry eye');
		const [oct] = listOrderOptions(db, 1);
		saveOrders(db, 1, 1, 1, [oct.id], 'RTC 6 months');
		expect(getPlanForReport(db, 1)).toEqual({
			items: [
				{ title: 'Cataract', codes: 'H25.13', codeText: 'ICD10:H25.13 (Age-related nuclear cataract, bilateral)', plan: 'Discuss surgery\nRTC 3 months' },
				{ title: 'Dry eye', codes: '', codeText: '', plan: '' }
			],
			orders: [oct.label],
			orderPlan: 'RTC 6 months'
		});
	});
});
