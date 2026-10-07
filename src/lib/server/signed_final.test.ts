// Signing is final in the database too (D36): triggers refuse signed content; editTransaction checks
// the lock and signature inside the write and turns a trigger abort into the 'signed' refusal.
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, transaction, type DB } from './db.ts';
import { getFindings, saveFindings } from './exam.ts';
import { saveDrawing } from './drawings.ts';
import { addItem, deleteItem, listItems, listOrderOptions, reorderItems, saveOrders, updateItem } from './plan.ts';
import { saveCodingState, validateCodingState } from './coding.ts';
import { deleteDocument, listDocuments, updateDocument, uploadDocument } from './documents.ts';
import { setVisitStaff } from './patients.ts';
import { acquireLock, addAddendum, editTransaction, EncounterLockedError, getSignature, signExam, signedAbort, type SigningUser } from './signing.ts';
import { EMPTY_CODING_STATE } from '#lib/coding/types.ts';

// Demo: user 1 Dr. Example is the provider of encounter 1 (patient 1); user 2 is a technician.
const DR: SigningUser = { id: 1, displayName: 'Dr. Example', role: 'provider' };
const TECH: SigningUser = { id: 2, displayName: 'Casey Tech (demo)', role: 'tech' };
const TOKEN = 'page-token-aaaaaaaaaaaa';

function png(tag = 0): Uint8Array {
	const b = new Uint8Array(64);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	b[40] = tag;
	return b;
}

const change = (field: string, value: string) => [{ field, value, isDefault: false }];

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

/** Encounter 1 with content in every signed table, then signed. Returns ids to aim writes at. */
function signedExamWithContent() {
	saveFindings(db, 1, 1, 1, change('ODIOP', '17'));
	saveDrawing(db, 1, 1, 'RETINA', png(1), 1);
	const item = addItem(db, 1, 1, 1, { kind: 'free', title: 'Glaucoma suspect', plan: 'Fields in 6 months' })!;
	saveOrders(db, 1, 1, 1, [listOrderOptions(db, 1)[0].id], 'RTC 6 months');
	saveCodingState(db, 1, 1, 1, validateCodingState({ ...EMPTY_CODING_STATE, visitCode: '92014' }));
	const doc = uploadDocument(db, 1, { category: 'FUNDUS_PHOTO', filename: 'f.png', bytes: png(2), encounterId: 1 }, 1)!;
	const paper = uploadDocument(db, 1, { category: 'INSURANCE_CARD', filename: 'card.png', bytes: png(3) }, 1)!;
	acquireLock(db, 1, 1, 1, TOKEN);
	signExam(db, 1, 1, DR, TOKEN);
	return { item, doc, paper };
}

const SIGNED = /signed exam:/;

describe('signed content triggers (D36)', () => {
	it('refuse every direct write to findings, drawings, plan, orders, codes and visit documents', () => {
		const { item, doc } = signedExamWithContent();
		const before = getFindings(db, 1, 1);
		expect(() => saveFindings(db, 1, 1, 1, change('ODIOP', '30'))).toThrow(SIGNED);
		expect(() => saveFindings(db, 1, 1, 1, change('OSIOP', '18'))).toThrow(SIGNED); // a new field too
		expect(getFindings(db, 1, 1)).toEqual(before);
		expect(() => db.prepare("UPDATE findings SET value = 'x' WHERE encounter_id = 1").run()).toThrow(SIGNED);
		expect(() => db.prepare('DELETE FROM findings WHERE encounter_id = 1').run()).toThrow(SIGNED);
		expect(() =>
			db
				.prepare("INSERT INTO finding_history (encounter_id, field, old_value, new_value, changed_at, changed_by) VALUES (1, 'ODIOP', '17', '30', 'x', 1)")
				.run()
		).toThrow(SIGNED);
		expect(() => db.prepare('DELETE FROM finding_history WHERE encounter_id = 1').run()).toThrow(SIGNED);

		expect(() => saveDrawing(db, 1, 1, 'RETINA', png(9), 1)).toThrow(SIGNED);
		expect(() => db.prepare('DELETE FROM drawings WHERE encounter_id = 1').run()).toThrow(SIGNED);

		expect(() => addItem(db, 1, 1, 1, { kind: 'free', title: 'Cataract' })).toThrow(SIGNED);
		expect(() => updateItem(db, 1, 1, 1, item.id, { plan: 'changed' })).toThrow(SIGNED);
		expect(() => deleteItem(db, 1, 1, item.id)).toThrow(SIGNED);
		expect(() => reorderItems(db, 1, 1, [item.id])).toThrow(SIGNED);
		expect(listItems(db, 1, 1)!.map((i) => i.plan)).toEqual(['Fields in 6 months']);

		expect(() => saveOrders(db, 1, 1, 1, [], 'changed')).toThrow(SIGNED);
		expect(() => db.prepare("UPDATE visit_order_plan SET plan = 'x' WHERE encounter_id = 1").run()).toThrow(SIGNED);
		expect(() => db.prepare('DELETE FROM visit_orders WHERE encounter_id = 1').run()).toThrow(SIGNED);
		expect(db.prepare('SELECT COUNT(*) AS n FROM visit_orders WHERE encounter_id = 1').get()).toEqual({ n: 1 });

		expect(() => saveCodingState(db, 1, 1, 1, validateCodingState({ ...EMPTY_CODING_STATE, visitCode: '92004' }))).toThrow(SIGNED);

		expect(() => uploadDocument(db, 1, { category: 'FUNDUS_PHOTO', filename: 'g.png', bytes: png(4), encounterId: 1 }, 1)).toThrow(SIGNED);
		expect(() => updateDocument(db, 1, doc.id, { notes: 'changed' }, 1)).toThrow(SIGNED);
		expect(() => deleteDocument(db, 1, doc.id, 1)).toThrow(SIGNED);
		// A visit document cannot be moved off the signed visit, nor another one moved onto it.
		expect(() => db.prepare('UPDATE documents SET encounter_id = NULL WHERE id = ?').run(doc.id)).toThrow(SIGNED);

		expect(() => setVisitStaff(db, 1, 1, { providerId: 1, technicianId: TECH.id })).toThrow(SIGNED);
	});

	it('leave patient-level documents, other visits and addenda editable', () => {
		const { paper } = signedExamWithContent();
		expect(updateDocument(db, 1, paper.id, { notes: 'front and back' }, 1)!.notes).toBe('front and back');
		expect(uploadDocument(db, 1, { category: 'OUTSIDE_RECORDS', filename: 'r.pdf', bytes: png(5) }, 1)).not.toBeNull();
		expect(deleteDocument(db, 1, paper.id, 1)).toBe(true);
		// Another (unsigned) visit of the same patient still saves.
		expect(saveFindings(db, 1, 3, 1, change('ODIOP', '15'))).toBeTruthy();
		expect(saveDrawing(db, 1, 3, 'RETINA', png(6), 1)).not.toBeNull();
		const moved = listDocuments(db, 1)!.find((d) => d.encounterId === null && d.category === 'OUTSIDE_RECORDS')!;
		expect(db.prepare('UPDATE documents SET encounter_id = 3 WHERE id = ?').run(moved.id).changes).toBe(1);
		// Addenda go on the signed exam.
		expect(addAddendum(db, 1, 1, TECH, 'IOP rechecked: 16').addenda).toHaveLength(1);
	});

	it('signing itself, with content in every table, still works and the signature stands', () => {
		signedExamWithContent();
		expect(getSignature(db, 1)).toMatchObject({ signedBy: 'Dr. Example' });
	});

	it('unsigned exams save as before', () => {
		expect(saveFindings(db, 1, 1, 1, change('ODIOP', '17'))).toBeTruthy();
		const item = addItem(db, 1, 1, 1, { kind: 'free', title: 'Dry eye' })!;
		expect(updateItem(db, 1, 1, 1, item.id, { plan: 'Tears QID' })!.plan).toBe('Tears QID');
		expect(deleteItem(db, 1, 1, item.id)).toBe(true);
		expect(deleteItem(db, 1, 1, item.id)).toBe(false); // already gone: nothing changed, no error
		expect(saveOrders(db, 1, 1, 1, [], 'RTC 1 year')!.orderPlan).toBe('RTC 1 year');
	});
});

describe('editTransaction', () => {
	it('refuses a signed exam with the signed EncounterLockedError and writes nothing', () => {
		signedExamWithContent();
		let ran = false;
		try {
			editTransaction(db, 1, 1, 1, TOKEN, () => (ran = true));
			throw new Error('expected a refusal');
		} catch (e) {
			expect(e).toBeInstanceOf(EncounterLockedError);
			expect((e as EncounterLockedError).reason).toBe('signed');
		}
		expect(ran).toBe(false);
	});

	it('turns a trigger abort into the signed refusal and rolls the whole write back', () => {
		acquireLock(db, 1, 1, 1, TOKEN);
		saveFindings(db, 1, 1, 1, change('ODIOP', '17'));
		// Signing lands between the check and the write (another process): the trigger catches it, and
		// the part already written in the same transaction is rolled back with it.
		const err = (() => {
			try {
				editTransaction(db, 1, 1, 1, TOKEN, () => {
					saveFindings(db, 1, 1, 1, change('OSIOP', '19'));
					db.prepare("INSERT INTO exam_signatures (encounter_id, signed_by, signed_at, content_hash) VALUES (1, 1, 'x', 'h')").run();
					saveFindings(db, 1, 1, 1, change('ODIOP', '30'));
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(EncounterLockedError);
		expect((err as EncounterLockedError).reason).toBe('signed');
		expect(getSignature(db, 1)).toBeNull();
		expect(getFindings(db, 1, 1)!.ODIOP?.value).toBe('17');
		expect(getFindings(db, 1, 1)!.OSIOP).toBeUndefined();
		expect(db.isTransaction).toBe(false);
	});

	it('runs the write when this page holds the lock; refuses without it', () => {
		acquireLock(db, 1, 1, 1, TOKEN);
		expect(editTransaction(db, 1, 1, 1, TOKEN, () => saveFindings(db, 1, 1, 1, change('ODIOP', '18')))).toBeTruthy();
		expect(() => editTransaction(db, 1, 1, 1, 'page-token-bbbbbbbbbbbb', () => 1)).toThrow(EncounterLockedError);
	});

	it('signedAbort only maps the signed-exam aborts', () => {
		expect(signedAbort(new Error('signed exam: findings are final'))?.reason).toBe('signed');
		expect(signedAbort(new Error('UNIQUE constraint failed'))).toBeNull();
		expect(signedAbort('signed exam: x')).toBeNull();
	});
});

describe('transaction', () => {
	it('nests with a savepoint: an inner failure rolls back only the inner part', () => {
		transaction(db, () => {
			saveFindings(db, 1, 1, 1, change('ODIOP', '17'));
			expect(() =>
				transaction(db, () => {
					saveFindings(db, 1, 1, 1, change('OSIOP', '19'));
					throw new Error('inner');
				})
			).toThrow('inner');
		});
		expect(getFindings(db, 1, 1)!.ODIOP?.value).toBe('17');
		expect(getFindings(db, 1, 1)!.OSIOP).toBeUndefined();
	});

	it('rolls everything back when the outer part throws', () => {
		expect(() =>
			transaction(db, () => {
				saveFindings(db, 1, 1, 1, change('ODIOP', '17'));
				throw new Error('outer');
			})
		).toThrow('outer');
		expect(getFindings(db, 1, 1)!.ODIOP).toBeUndefined();
		expect(db.isTransaction).toBe(false);
	});
});
