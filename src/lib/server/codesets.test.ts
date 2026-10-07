// Code-set choice (D44) and the US code suggestions switch (D45) across settings, the plan, history and signing.
import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate, openDatabase, seedDemo, type DB } from './db.ts';
import { loadIcd10 } from './icd10.ts';
import { loadIcd11 } from './icd11.ts';
import { getCodeSettings, SettingsError, updateCodeSettings } from './settings.ts';
import { searchAudit } from './security_audit.ts';
import { addItem, addNewDx, getCandidates, getPlanData, listItems, PlanValidationError, updateItem } from './plan.ts';
import { listIssues, quickPickTitles, saveIssue } from './history.ts';
import { examContentHash } from './signing.ts';
import { setupFirstAdmin } from './users.ts';
import { ICD10_FIXTURE } from '#lib/plan/icd10.fixture.ts';
import { ICD11_FIXTURE } from '#lib/codesets/icd11.fixture.ts';

const TODAY = '2026-10-06';
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
	loadIcd10(db, ICD10_FIXTURE, 'fixture-test');
	loadIcd11(db, ICD11_FIXTURE, 'fixture-test');
});
const toIcd11 = () => updateCodeSettings(db, { codeSet: 'icd11' }, 3);
const planError = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof PlanValidationError) return e.message;
		throw e;
	}
	return null;
};

describe('settings', () => {
	it('existing installs and the demo stay ICD-10-CM with US code suggestions', () => {
		expect(getCodeSettings(db)).toEqual({ codeSet: 'icd10cm', usBilling: true });
	});

	it('changes are validated and audited with before and after', () => {
		expect(updateCodeSettings(db, { codeSet: 'icd11', usBilling: false }, 3)).toEqual({ codeSet: 'icd11', usBilling: false });
		const row = searchAudit(db, { action: 'settings.coding' }).rows[0];
		expect(row.userId).toBe(3);
		expect(JSON.parse(row.detail)).toEqual({ before: { codeSet: 'icd10cm', usBilling: true }, after: { codeSet: 'icd11', usBilling: false } });
		expect(() => updateCodeSettings(db, { codeSet: 'icd9' }, 3)).toThrow(SettingsError);
		expect(() => updateCodeSettings(db, { usBilling: 'yes' }, 3)).toThrow(SettingsError);
		// The two are independent after setup.
		updateCodeSettings(db, { usBilling: true }, 3);
		expect(getCodeSettings(db)).toEqual({ codeSet: 'icd11', usBilling: true });
	});

	it('first-run setup: the chosen set, with US code suggestions on for ICD-10-CM and off for ICD-11', async () => {
		const PW = 'a sentence that is long';
		const a = openDatabase(':memory:');
		await setupFirstAdmin(a, { username: 'boss', displayName: 'Boss', password: PW, confirm: PW, codeSet: 'icd11' });
		expect(getCodeSettings(a)).toEqual({ codeSet: 'icd11', usBilling: false });
		const b = openDatabase(':memory:');
		await setupFirstAdmin(b, { username: 'boss', displayName: 'Boss', password: PW, confirm: PW });
		expect(getCodeSettings(b)).toEqual({ codeSet: 'icd10cm', usBilling: true });
		const c = openDatabase(':memory:');
		await expect(setupFirstAdmin(c, { username: 'boss', displayName: 'Boss', password: PW, confirm: PW, codeSet: 'snomed' })).rejects.toThrow();
	});
});

describe('impression items with ICD-11', () => {
	it('stores code, WHO title and URI; the title defaults to the WHO title', () => {
		toIcd11();
		const it = addItem(db, 1, 1, 1, { codes: '9c61.0z&xk9j' })!;
		expect(it).toMatchObject({
			title: 'Primary open-angle glaucoma, unspecified',
			codes: '9C61.0Z&XK9J',
			codeText: 'ICD11:9C61.0Z&XK9J (Primary open-angle glaucoma, unspecified; Bilateral)',
			codeSystem: 'icd11',
			codeType: 'ICD11',
			codeUris: 'http://id.who.int/icd/release/11/mms/1849071057/unspecified&http://id.who.int/icd/release/11/mms/627678743'
		});
		expect(getPlanData(db, 1, 1, 1)?.codeSet).toBe('icd11');
	});

	it('refuses categories, stray extensions and ICD-10-CM codes', () => {
		toIcd11();
		expect(planError(() => addItem(db, 1, 1, 1, { title: 'G', codes: '9C61.0' }))).toBe('9C61.0 is a category; choose one of the more specific codes under it.');
		expect(planError(() => addItem(db, 1, 1, 1, { title: 'G', codes: 'XK9J' }))).toMatch(/extension code/);
		expect(planError(() => addItem(db, 1, 1, 1, { title: 'G', codes: 'H25.13' }))).toMatch(/ICD-10-CM code; this practice now codes with ICD-11/);
	});

	it('New Dx with an ICD-11 code', () => {
		toIcd11();
		const r = addNewDx(db, 1, 1, 1, 'POAG OU 9C61.0Z&XK9J\nRTC 3 months')!;
		expect(r.item).toMatchObject({ title: 'POAG OU', codes: '9C61.0Z&XK9J', codeSystem: 'icd11', plan: 'RTC 3 months' });
	});

	it('an item keeps its code set after the practice switches', () => {
		const old = addItem(db, 1, 1, 1, { title: 'Cataract', codes: 'H25.13, H40.1111' })!;
		expect(old.codeSystem).toBe('icd10cm');
		toIcd11();
		expect(listItems(db, 1, 1)![0]).toMatchObject({ codes: 'H25.13, H40.1111', codeSystem: 'icd10cm', codeType: 'ICD10' });
		// Editing the title or removing one of its codes keeps ICD-10-CM.
		updateItem(db, 1, 1, 1, old.id, { title: 'Cataract OU' });
		const removed = updateItem(db, 1, 1, 1, old.id, { codes: 'H25.13' })!;
		expect(removed).toMatchObject({ codes: 'H25.13', codeSystem: 'icd10cm', codeText: 'ICD10:H25.13 (Age-related nuclear cataract, bilateral)' });
		// Replacing the codes uses the practice's set now.
		const replaced = updateItem(db, 1, 1, 1, old.id, { codes: '9B10.Z&XK9J' })!;
		expect(replaced).toMatchObject({ codes: '9B10.Z&XK9J', codeSystem: 'icd11' });
	});

	it('the builder uses WHO titles for ICD-11 and leaves ICD-10-CM issue codes out', () => {
		toIcd11();
		const c = getCandidates(db, 1, 1, { ODLENS: 'cataract', OSLENS: 'cataract' })!;
		expect(c.findings).toMatchObject([{ codes: '9B10.Z&XK9J' }]);
		// The demo patient's PMH codes are ICD-10-CM (I10, E11.9): titles only.
		expect(c.pmh.map((p) => p.codes)).toEqual(['', '']);
	});
});

describe('history issues', () => {
	it('ICD-11 codes are stored with set, WHO titles and URIs; unchanged codes keep their set', () => {
		toIcd11();
		const r = saveIssue(db, 1, 1, { type: 'POH', title: 'POAG', codes: '9c61.0z & xk9j' })!;
		const row = db.prepare('SELECT codes, code_system, code_uris, code_text FROM issues WHERE id = ?').get(r.id);
		expect(row).toEqual({
			codes: '9C61.0Z&XK9J',
			code_system: 'icd11',
			code_uris: 'http://id.who.int/icd/release/11/mms/1849071057/unspecified&http://id.who.int/icd/release/11/mms/627678743',
			code_text: 'ICD11:9C61.0Z&XK9J (Primary open-angle glaucoma, unspecified; Bilateral)'
		});
		// Lenient like before: text that is not a code is kept, with no URI.
		const loose = saveIssue(db, 1, 1, { type: 'PMH', title: 'Other thing', codes: 'see letter' })!;
		expect(db.prepare('SELECT codes, code_uris FROM issues WHERE id = ?').get(loose.id)).toEqual({ codes: 'see letter', code_uris: '' });
		// The demo's ICD-10-CM issue keeps its set when saved with the same codes.
		const htn = listIssues(db, 1, TODAY).find((i) => i.title === 'Hypertension')!;
		expect(htn.codeSystem).toBe('icd10cm');
		saveIssue(db, 1, 1, { id: htn.id, type: 'PMH', title: 'Hypertension', codes: 'I10', comments: 'stable' });
		expect(listIssues(db, 1, TODAY).find((i) => i.id === htn.id)?.codeSystem).toBe('icd10cm');
	});

	it('quick-pick titles carry no ICD-10-CM codes for an ICD-11 practice', () => {
		expect(quickPickTitles(db, 1, TODAY).PMH.find((t) => t.title === 'Hypertension')?.codes).toBe('I10');
		toIcd11();
		expect(quickPickTitles(db, 1, TODAY).PMH.every((t) => t.codes === '')).toBe(true);
	});
});

describe('signing hash', () => {
	it('an exam hashed before the code-set migration hashes the same after it', () => {
		const probe = new DatabaseSync(':memory:');
		migrate(probe);
		const latest = (probe.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }).v;
		const raw = new DatabaseSync(':memory:');
		migrate(raw, latest - 2); // the translations migration (D48) follows billing-aid
		seedDemo(raw, TODAY);
		const at = `${TODAY}T10:00:00.000Z`;
		raw
			.prepare(
				`INSERT INTO imp_items (encounter_id, seq, kind, title, codes, code_text, plan, link, created_at, created_by, updated_at, updated_by)
				 VALUES (1, 1, 'free', 'Cataract', 'H25.13', 'ICD10:H25.13 (x)', 'RTC', '', ?, 1, ?, 1)`
			)
			.run(at, at);
		const before = examContentHash(raw, 1);
		migrate(raw);
		expect(examContentHash(raw, 1)).toBe(before);
		// An ICD-11 item hashes its set and URIs.
		raw.prepare("UPDATE imp_items SET code_system = 'icd11', codes = '9B10.Z', code_uris = 'http://x' WHERE encounter_id = 1").run();
		expect(examContentHash(raw, 1)).not.toBe(before);
	});
});
