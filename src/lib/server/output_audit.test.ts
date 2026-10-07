// Prints, exports, printed Rx and document access all reach the audit log the Settings view reads (#14).
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { logPrint } from './report.ts';
import { createDispense, validateDispense } from './rx.ts';
import { DOCUMENT_VIEW_DEDUPE_MS, logDocumentAccess, OUTPUT_ACTIONS } from './audit.ts';
import { auditActions, OUTPUT_GROUP, SECURITY_ACTIONS, searchAudit } from './security_audit.ts';
import { EN } from '#lib/i18n/catalog.ts';
import { ACTION_LABEL_KEY } from '../../routes/settings/audit/labels.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

const NOW = new Date('2026-10-06T15:00:00Z');
const rows = (action?: string) => searchAudit(db, action ? { action } : {}).rows;

describe('prints and exports', () => {
	it('each print, CSV and FHIR export writes one audit row per visit, with the patient', () => {
		logPrint(db, 2, [1, 2], 'print', NOW);
		logPrint(db, 1, [4], 'csv', NOW);
		logPrint(db, 1, [3, 999], 'fhir', NOW); // unknown ids are skipped in both logs
		const print = rows('export.print');
		expect(print.map((r) => [r.encounterId, r.patientId, r.userId]).sort()).toEqual([
			[1, 1, 2],
			[2, 2, 2]
		]);
		expect(JSON.parse(print[0].detail)).toEqual({ visits: 2 });
		expect(rows('export.csv').map((r) => r.encounterId)).toEqual([4]);
		expect(rows('export.fhir').map((r) => r.encounterId)).toEqual([3]);
		expect((db.prepare('SELECT COUNT(*) AS n FROM print_log').get() as { n: number }).n).toBe(4);
		// The output group filter finds all of them, and only them.
		expect(searchAudit(db, { action: OUTPUT_GROUP }).total).toBe(4);
		expect(searchAudit(db, { action: OUTPUT_GROUP, patientId: 2 }).total).toBe(1);
	});

	it('a printed Rx is audited with its record id and no prescription values', () => {
		const mr = validateDispense({ source: 'MR', rxType: '1', values: { ODSPH: '-2', ODCYL: '-0.5', ODAXIS: '90' } });
		const r = createDispense(db, 1, 1, 2, mr, NOW)!;
		const [row] = rows('rx.print');
		expect(row).toMatchObject({ patientId: 1, encounterId: 1, userId: 2 });
		expect(JSON.parse(row.detail)).toEqual({ rx: r.record.id, type: 'MR' });
		expect(row.detail).not.toContain('-2.00');
	});

	it('the print log is append-only', () => {
		logPrint(db, 1, [1], 'print', NOW);
		expect(() => db.prepare("UPDATE print_log SET kind = 'csv'").run()).toThrow(/append-only/);
		expect(() => db.prepare('DELETE FROM print_log').run()).toThrow(/append-only/);
	});
});

describe('documents', () => {
	const doc = { id: 7, patientId: 1, encounterId: 1 };

	it('every download is logged; views once per user and file per 5 minutes', () => {
		expect(logDocumentAccess(db, 1, doc, false, NOW)).not.toBeNull();
		expect(logDocumentAccess(db, 1, doc, false, new Date(NOW.getTime() + 60_000))).toBeNull();
		expect(logDocumentAccess(db, 2, doc, false, new Date(NOW.getTime() + 60_000))).not.toBeNull(); // another user
		expect(logDocumentAccess(db, 1, { ...doc, id: 8 }, false, NOW)).not.toBeNull(); // another file
		expect(logDocumentAccess(db, 1, doc, false, new Date(NOW.getTime() + DOCUMENT_VIEW_DEDUPE_MS + 1))).not.toBeNull();
		expect(logDocumentAccess(db, 1, doc, true, NOW)).not.toBeNull();
		expect(logDocumentAccess(db, 1, doc, true, NOW)).not.toBeNull();
		expect(rows('document.view')).toHaveLength(4);
		expect(rows('document.download')).toHaveLength(2);
		const [d] = rows('document.download');
		expect(d).toMatchObject({ patientId: 1, encounterId: 1, userId: 1 });
		expect(JSON.parse(d.detail)).toEqual({ document: 7 });
	});
});

describe('Settings audit view', () => {
	it('offers every output action in the filter even before one happens', () => {
		const actions = auditActions(db);
		for (const a of OUTPUT_ACTIONS) expect(actions).toContain(a);
	});

	it('every security and output action has a readable English label', () => {
		for (const a of [...SECURITY_ACTIONS, ...OUTPUT_ACTIONS, 'exam.sign', 'exam.addendum', 'lock.takeover']) {
			const key = ACTION_LABEL_KEY[a];
			expect(key, a).toBeTruthy();
			expect(EN[key], a).toBeTruthy();
		}
	});
});
