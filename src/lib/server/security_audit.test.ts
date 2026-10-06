import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { audit } from './audit.ts';
import { auditActions, searchAudit, securityAudit } from './security_audit.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

describe('security audit', () => {
	it('records events with and without a known user, in the shared audit_log', () => {
		securityAudit(db, { action: 'auth.login_failed', userId: null, detail: { username: 'ghost', ip: '1.2.3.4' } });
		securityAudit(db, { action: 'view_exam', userId: 1, patientId: 1, encounterId: 1 });
		audit(db, { userId: 1, action: 'exam.sign', patientId: 1, encounterId: 1 });
		const { rows, total } = searchAudit(db, {});
		expect(total).toBe(3);
		expect(rows.map((r) => r.action)).toEqual(['exam.sign', 'view_exam', 'auth.login_failed']);
		expect(rows[1]).toMatchObject({ user: 'Dr. Example (demo-provider)', patient: 'Jordan Demo', encounterId: 1 });
		expect(rows[2].userId).toBeNull();
	});

	it('is append-only: updates and deletes are refused', () => {
		securityAudit(db, { action: 'auth.login', userId: 1 });
		expect(() => db.prepare("UPDATE audit_log SET action = 'x'").run()).toThrow(/append-only/);
		expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
	});

	it('filters by user, patient, action and date range, newest first, paginated', () => {
		const at = (d: string) => new Date(`${d}T12:00:00Z`);
		securityAudit(db, { action: 'view_patient', userId: 1, patientId: 1 }, at('2026-10-01'));
		securityAudit(db, { action: 'view_patient', userId: 2, patientId: 2 }, at('2026-10-03'));
		securityAudit(db, { action: 'auth.login', userId: 2 }, at('2026-10-05'));
		expect(searchAudit(db, { userId: 2 }).total).toBe(2);
		expect(searchAudit(db, { patientId: 1 }).rows.map((r) => r.userId)).toEqual([1]);
		expect(searchAudit(db, { action: 'view_patient' }).total).toBe(2);
		expect(searchAudit(db, { from: '2026-10-02', to: '2026-10-03' }).total).toBe(1);
		expect(searchAudit(db, { to: '2026-10-05' }).total).toBe(3);
		const p1 = searchAudit(db, {}, 1, 2);
		const p2 = searchAudit(db, {}, 2, 2);
		expect(p1.total).toBe(3);
		expect(p1.rows.map((r) => r.action)).toEqual(['auth.login', 'view_patient']);
		expect(p2.rows).toHaveLength(1);
		expect(auditActions(db)).toContain('view_exam');
	});
});
