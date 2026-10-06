import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { saveFindings } from './exam.ts';
import { saveDrawing } from './drawings.ts';
import { listAudit } from './audit.ts';
import {
	acquireLock,
	addAddendum,
	assertEditable,
	EncounterLockedError,
	examContentHash,
	getLockState,
	getSignature,
	getSignedHash,
	guardEditable,
	heartbeatLock,
	lockMinutes,
	lockToken,
	releaseLock,
	signExam,
	SigningError,
	takeOverLock,
	type SigningUser
} from './signing.ts';

// Demo: user 1 Dr. Example is the provider of encounters 1 (patient 1) and 2 (patient 2).
const DR: SigningUser = { id: 1, displayName: 'Dr. Example', role: 'provider' };
const OTHER: SigningUser = { id: 2, displayName: 'Dr. Other', role: 'provider' };
const TECH: SigningUser = { id: 3, displayName: 'Tech Tess', role: 'tech' };
const ADMIN: SigningUser = { id: 4, displayName: 'Admin Ari', role: 'admin' };
const T1 = 'page-token-aaaaaaaaaaaa';
const T2 = 'page-token-bbbbbbbbbbbb';
const T3 = 'page-token-cccccccccccc';

const at = (min: number) => new Date(Date.UTC(2026, 9, 6, 14, 0) + min * 60_000);

function png(tag = 0): Uint8Array {
	const b = new Uint8Array(64);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	b[40] = tag;
	return b;
}

function lockedReason(fn: () => unknown): string | null {
	try {
		fn();
		return null;
	} catch (e) {
		if (e instanceof EncounterLockedError) return e.reason;
		throw e;
	}
}

function status(fn: () => unknown): number | null {
	try {
		fn();
		return null;
	} catch (e) {
		if (e instanceof SigningError) return e.status;
		throw e;
	}
}

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
	// Fixed names for users 2-4, whatever the demo seed calls them (roles come from the caller, not the row).
	for (const [id, name] of [[2, 'Dr. Other'], [3, 'Tech Tess'], [4, 'Admin Ari']] as const) {
		db.prepare('INSERT OR IGNORE INTO users (id, display_name) VALUES (?, ?)').run(id, name);
		db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id);
	}
});
afterEach(() => {
	delete process.env.OPENVISION_LOCK_MINUTES;
});

describe('edit lock', () => {
	it('acquires a free lock and reports it to its own page only', () => {
		const s = acquireLock(db, 1, 1, 1, T1, at(0));
		expect(s.mine).toBe(true);
		expect(s.lock).toMatchObject({ holderId: 1, holderName: 'Dr. Example', acquiredAt: at(0).toISOString() });
		expect(s.lock?.expiresAt).toBe(at(15).toISOString());
		expect(s.findings).toEqual({});
		expect(getLockState(db, 1, 2, T2, at(1)).mine).toBe(false);
		expect(getLockState(db, 1, 2, T2, at(1)).lock?.holderName).toBe('Dr. Example');
	});

	it('leaves a live lock alone when another page asks (read-only, takeover offered)', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		const s = acquireLock(db, 1, 1, 2, T2, at(5));
		expect(s.mine).toBe(false);
		expect(s.lock?.holderId).toBe(1);
		// The same user in a second tab is a different page: also read-only.
		expect(acquireLock(db, 1, 1, 1, T3, at(5)).mine).toBe(false);
	});

	it('heartbeat extends the lock; it expires 15 minutes after the last heartbeat', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		heartbeatLock(db, 1, 1, 1, T1, at(10));
		expect(acquireLock(db, 1, 1, 2, T2, at(24)).mine).toBe(false); // 14 min after the heartbeat
		const s = acquireLock(db, 1, 1, 2, T2, at(25)); // 15 min: expired, taken silently but logged
		expect(s.mine).toBe(true);
		expect(listAudit(db, { encounterId: 1 }).map((a) => a.action)).toEqual(['lock.expired_takeover']);
	});

	it('lock lifetime is configurable', () => {
		process.env.OPENVISION_LOCK_MINUTES = '2';
		expect(lockMinutes()).toBe(2);
		acquireLock(db, 1, 1, 1, T1, at(0));
		expect(acquireLock(db, 1, 1, 2, T2, at(2)).mine).toBe(true);
		process.env.OPENVISION_LOCK_MINUTES = 'nonsense';
		expect(lockMinutes()).toBe(15);
	});

	it('only the holder can heartbeat or release', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		expect(lockedReason(() => heartbeatLock(db, 1, 1, 2, T2, at(1)))).toBe('locked');
		expect(lockedReason(() => heartbeatLock(db, 1, 1, 2, T1, at(1)))).toBe('locked'); // stolen token, wrong user
		expect(releaseLock(db, 1, 1, 2, T2, at(1))).toBe(false);
		expect(getLockState(db, 1, 1, T1, at(1)).mine).toBe(true);
		expect(releaseLock(db, 1, 1, 1, T1, at(2))).toBe(true);
		expect(getLockState(db, 1, 2, T2, at(2)).lock).toBeNull();
		// A released lock is free at once, without an audit row (nothing was taken from anyone).
		expect(acquireLock(db, 1, 1, 2, T2, at(3)).mine).toBe(true);
		expect(listAudit(db)).toEqual([]);
	});

	it('takeover is explicit, audited, and cuts off the previous holder', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		const s = takeOverLock(db, 1, 1, 2, T2, at(3));
		expect(s.mine).toBe(true);
		expect(s.lock?.holderName).toBe('Dr. Other');
		const log = listAudit(db, { encounterId: 1 });
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ userId: 2, action: 'lock.takeover', patientId: 1, detail: { previousHolderId: 1, previousHolderName: 'Dr. Example' } });
		// The previous holder's next write and heartbeat are refused, naming the new holder.
		expect(lockedReason(() => assertEditable(db, 1, 1, 1, T1, at(4)))).toBe('locked');
		try {
			heartbeatLock(db, 1, 1, 1, T1, at(4));
		} catch (e) {
			expect((e as EncounterLockedError).holder?.holderName).toBe('Dr. Other');
			expect((e as EncounterLockedError).message).toMatch(/Dr. Other is editing/);
		}
		expect(releaseLock(db, 1, 1, 1, T1, at(4))).toBe(false);
	});

	it('refuses wrong patient and bad tokens', () => {
		expect(status(() => acquireLock(db, 2, 1, 1, T1, at(0)))).toBe(404);
		expect(status(() => acquireLock(db, 1, 1, 1, 'short', at(0)))).toBe(400);
		expect(status(() => acquireLock(db, 1, 1, 1, null, at(0)))).toBe(400);
	});

	it('reads the token from the X-Lock-Token header', () => {
		expect(lockToken(new Request('http://x/', { headers: { 'x-lock-token': T1 } }))).toBe(T1);
		expect(lockToken(new Request('http://x/', { headers: { 'x-lock-token': 'bad token!' } }))).toBeNull();
		expect(lockToken(new Request('http://x/'))).toBeNull();
	});
});

describe('assertEditable', () => {
	it('lets the holder page write', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		expect(() => assertEditable(db, 1, 1, 1, T1, at(1))).not.toThrow();
	});

	it('refuses another token, no token, and no lock at all', () => {
		expect(lockedReason(() => assertEditable(db, 1, 1, 1, T1, at(0)))).toBe('locked'); // nobody acquired
		acquireLock(db, 1, 1, 1, T1, at(0));
		expect(lockedReason(() => assertEditable(db, 1, 1, 1, T2, at(1)))).toBe('locked');
		expect(lockedReason(() => assertEditable(db, 1, 1, 1, null, at(1)))).toBe('locked');
		expect(lockedReason(() => assertEditable(db, 1, 1, 2, T1, at(1)))).toBe('locked');
	});

	it('keeps the holder writing past expiry or release until someone else takes the lock', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		expect(() => assertEditable(db, 1, 1, 1, T1, at(30))).not.toThrow(); // expired, nobody took it
		releaseLock(db, 1, 1, 1, T1, at(31));
		expect(() => assertEditable(db, 1, 1, 1, T1, at(31))).not.toThrow(); // a save racing the page-hide release
		acquireLock(db, 1, 1, 2, T2, at(32)); // expired lock taken by someone else
		expect(lockedReason(() => assertEditable(db, 1, 1, 1, T1, at(32)))).toBe('locked');
	});

	it('refuses everyone once signed', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		signExam(db, 1, 1, DR, T1, at(1));
		expect(lockedReason(() => assertEditable(db, 1, 1, 1, T1, at(2)))).toBe('signed');
		expect(lockedReason(() => takeOverLock(db, 1, 1, 2, T2, at(2)))).toBe('signed');
		expect(acquireLock(db, 1, 1, 1, T1, at(2)).mine).toBe(false);
	});

	it('guardEditable answers 423 with { message, reason }', async () => {
		acquireLock(db, 1, 1, 1, T1, new Date()); // guardEditable uses the real clock
		const req = (t: string) => new Request('http://x/', { headers: { 'x-lock-token': t } });
		expect(guardEditable(db, 1, 1, 1, req(T1))).toBeNull();
		const res = guardEditable(db, 1, 1, 2, req(T2))!;
		expect(res.status).toBe(423);
		expect(await res.json()).toMatchObject({ reason: 'locked', lock: { holderName: 'Dr. Example' } });
	});
});

describe('signing', () => {
	it('only the encounter provider can sign', () => {
		expect(status(() => signExam(db, 1, 1, TECH, null, at(0)))).toBe(403);
		expect(status(() => signExam(db, 1, 1, OTHER, null, at(0)))).toBe(403);
		expect(status(() => signExam(db, 1, 1, ADMIN, null, at(0)))).toBe(403); // admins never sign for someone else
		expect(status(() => signExam(db, 2, 1, DR, null, at(0)))).toBe(404);
		expect(getSignature(db, 1)).toBeNull();
	});

	it('stores signer, actual signing time and content hash; audited; final', () => {
		acquireLock(db, 1, 1, 1, T1, at(0));
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: 'quiet', isDefault: false }]);
		const hash = examContentHash(db, 1);
		const sig = signExam(db, 1, 1, DR, T1, at(5));
		expect(sig).toEqual({ signedBy: 'Dr. Example', signedAt: at(5).toISOString(), addenda: [] });
		expect(getSignedHash(db, 1)).toBe(hash);
		expect(listAudit(db, { encounterId: 1 })).toMatchObject([{ action: 'exam.sign', userId: 1, detail: { contentHash: hash } }]);
		expect(lockedReason(() => signExam(db, 1, 1, DR, T1, at(6)))).toBe('signed');
		// No unsigning: the row cannot be changed or removed.
		expect(() => db.prepare('DELETE FROM exam_signatures WHERE encounter_id = 1').run()).toThrow(/cannot be removed/);
		expect(() => db.prepare("UPDATE exam_signatures SET signed_at = 'x'").run()).toThrow(/cannot be changed/);
		// The lock is gone: other pages see the exam as signed, not as being edited.
		expect(getLockState(db, 1, 2, T2, at(6))).toMatchObject({ lock: null, mine: false, signature: { signedBy: 'Dr. Example' } });
	});

	it('is refused while another page holds a live lock', () => {
		acquireLock(db, 1, 1, 2, T2, at(0));
		expect(lockedReason(() => signExam(db, 1, 1, DR, T1, at(1)))).toBe('locked');
		expect(signExam(db, 1, 1, DR, T1, at(20)).signedBy).toBe('Dr. Example'); // expired lock no longer blocks
	});

	it('content hash is stable and follows findings and drawings', () => {
		saveFindings(db, 1, 1, 1, [
			{ field: 'ODCONJ', value: 'quiet', isDefault: false },
			{ field: 'OSCONJ', value: 'quiet', isDefault: true }
		]);
		const h1 = examContentHash(db, 1);
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
		// Re-saving the same values later (new timestamps) does not change it.
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: 'quiet', isDefault: false }], at(60));
		expect(examContentHash(db, 1)).toBe(h1);
		saveFindings(db, 1, 1, 1, [{ field: 'ODCONJ', value: 'injected', isDefault: false }]);
		const h2 = examContentHash(db, 1);
		expect(h2).not.toBe(h1);
		saveDrawing(db, 1, 1, 'ANTSEG', png(1), 1);
		expect(examContentHash(db, 1)).not.toBe(h2);
		expect(examContentHash(db, 2)).not.toBe(examContentHash(db, 1));
	});

	it('includes plan tables when they exist, ignoring audit columns', () => {
		const before = examContentHash(db, 1);
		db.exec(`CREATE TABLE plan_items (id INTEGER PRIMARY KEY, encounter_id INTEGER, title TEXT, updated_at TEXT)`);
		expect(examContentHash(db, 1)).toBe(before); // an empty table changes nothing
		db.prepare("INSERT INTO plan_items (encounter_id, title, updated_at) VALUES (1, 'POAG OU', 'a')").run();
		const withPlan = examContentHash(db, 1);
		expect(withPlan).not.toBe(before);
		db.prepare("UPDATE plan_items SET updated_at = 'b'").run();
		expect(examContentHash(db, 1)).toBe(withPlan);
	});
});

describe('addenda', () => {
	it('need a signed exam, are append-only, and show in the signature', () => {
		expect(status(() => addAddendum(db, 1, 1, DR, 'late note', at(0)))).toBe(409);
		signExam(db, 1, 1, DR, null, at(1));
		expect(status(() => addAddendum(db, 1, 1, DR, '   ', at(2)))).toBe(400);
		expect(status(() => addAddendum(db, 1, 1, DR, 'x'.repeat(4001), at(2)))).toBe(400);
		expect(status(() => addAddendum(db, 1, 1, ADMIN, 'note', at(2)))).toBe(403);
		expect(status(() => addAddendum(db, 2, 1, DR, 'note', at(2)))).toBe(404);
		addAddendum(db, 1, 1, DR, '  IOP recheck called in: 18/19.  ', at(10));
		const sig = addAddendum(db, 1, 1, TECH, 'Patient called back.', at(20));
		expect(sig.addenda).toEqual([
			{ by: 'Dr. Example', at: at(10).toISOString(), text: 'IOP recheck called in: 18/19.' },
			{ by: 'Tech Tess', at: at(20).toISOString(), text: 'Patient called back.' }
		]);
		expect(sig.signedAt).toBe(at(1).toISOString()); // signing time unchanged
		expect(() => db.prepare("UPDATE exam_addenda SET text = 'changed'").run()).toThrow(/append-only/);
		expect(() => db.prepare('DELETE FROM exam_addenda').run()).toThrow(/append-only/);
		expect(listAudit(db, { encounterId: 1 }).map((a) => a.action)).toEqual(['exam.sign', 'exam.addendum', 'exam.addendum']);
	});

	it('getSignature is per exam (the report loader calls it)', () => {
		signExam(db, 2, 2, DR, null, at(0));
		expect(getSignature(db, 1)).toBeNull();
		expect(getSignature(db, 2)?.signedBy).toBe('Dr. Example');
	});
});

describe('routes', () => {
	// The routes use the shared database; point it at a private in-memory one for this file.
	process.env.OPENVISION_DB = ':memory:';
	const locals = { userId: 1, user: DR };
	const params = { pid: '1', eid: '1' };
	const put = (token: string | null) =>
		new Request('http://localhost/api/patients/1/encounters/1/findings', {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...(token ? { 'x-lock-token': token } : {}) },
			body: JSON.stringify({ changes: [{ field: 'ODCONJ', value: 'quiet' }] })
		});
	type Handler = (event: unknown) => Promise<Response> | Response;

	it('findings PUT: saves for the lock holder, 423 for others and after signing', async () => {
		const { getDb } = await import('./db.ts');
		const findings = (await import('../../routes/api/patients/[pid]/encounters/[eid]/findings/+server.ts')) as unknown as { PUT: Handler };
		const lock = (await import('../../routes/api/patients/[pid]/encounters/[eid]/lock/+server.ts')) as unknown as { POST: Handler };
		const sign = (await import('../../routes/api/patients/[pid]/encounters/[eid]/sign/+server.ts')) as unknown as { POST: Handler };
		const shared = getDb();
		shared.prepare('INSERT OR IGNORE INTO users (id, display_name) VALUES (3, ?)').run('Tech Tess');
		expect(shared.prepare('SELECT provider_id FROM encounters WHERE id = 1').get()).toEqual({ provider_id: 1 });

		const noLock = await findings.PUT({ params, request: put(T1), locals });
		expect(noLock.status).toBe(423);

		const acquire = await lock.POST({
			params,
			locals,
			request: new Request('http://localhost/x', { method: 'POST', headers: { 'x-lock-token': T1 }, body: JSON.stringify({ action: 'acquire' }) })
		});
		expect(((await acquire.json()) as { mine: boolean }).mine).toBe(true);
		expect((await findings.PUT({ params, request: put(T1), locals })).status).toBe(200);
		expect((await findings.PUT({ params, request: put(T2), locals })).status).toBe(423);

		// Tech cannot sign: 403 (thrown by SvelteKit's error()).
		await expect(
			Promise.resolve().then(() => sign.POST({ params, locals: { userId: 3, user: TECH }, request: new Request('http://localhost/x', { method: 'POST' }) }))
		).rejects.toMatchObject({ status: 403 });
		const signed = await sign.POST({ params, locals, request: new Request('http://localhost/x', { method: 'POST', headers: { 'x-lock-token': T1 } }) });
		expect(signed.status).toBe(200);

		const after = await findings.PUT({ params, request: put(T1), locals });
		expect(after.status).toBe(423);
		expect(await after.json()).toMatchObject({ reason: 'signed', message: expect.stringMatching(/signed/) });
	});
});
