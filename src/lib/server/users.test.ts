import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import { createSession, login, LoginLimiter, needsSetup, resolveSession } from './auth.ts';
import {
	activeAdminCount,
	changeOwnPassword,
	createUser,
	getUser,
	listUsers,
	resetPassword,
	setupFirstAdmin,
	setUserActive,
	setUserRole,
	updateDisplayName,
	UserError
} from './users.ts';
import { searchAudit } from './security_audit.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});
const ADMIN = 3;
const PW = 'a sentence that is long';
const errorsOf = async (fn: () => unknown) => {
	try {
		await fn();
	} catch (e) {
		if (e instanceof UserError) return e.errors;
		throw e;
	}
	return null;
};

describe('createUser', () => {
	it('creates a user with a temporary password and starter normals, audited with the admin', async () => {
		const id = await createUser(db, { username: 'jlee', displayName: 'Dr. J Lee', role: 'provider', password: PW }, { actorId: ADMIN });
		expect(getUser(db, id)).toMatchObject({ username: 'jlee', role: 'provider', active: true, mustChangePassword: true, canSignIn: true });
		const n = (db.prepare('SELECT COUNT(*) AS n FROM user_defaults WHERE user_id = ?').get(id) as { n: number }).n;
		expect(n).toBeGreaterThan(20);
		expect(searchAudit(db, { action: 'user.created' }).rows[0]).toMatchObject({ userId: ADMIN });
		const r = await login(db, 'JLEE', PW, 'ip', { limiter: new LoginLimiter() });
		expect(r.ok && r.user.mustChangePassword).toBe(true);
	});

	it('usernames are unique case-insensitively and validated; bad fields reported together', async () => {
		expect((await errorsOf(() => createUser(db, { username: 'Demo-Tech', displayName: 'X', role: 'tech', password: PW })))?.username).toMatch(/taken/);
		const errs = await errorsOf(() => createUser(db, { username: 'a b', displayName: '', role: 'owner', password: 'short' }));
		expect(Object.keys(errs!).sort()).toEqual(['displayName', 'password', 'role', 'username']);
		expect(
			(await errorsOf(() => createUser(db, { username: 'samesame12345', displayName: 'S', role: 'tech', password: 'SameSame12345' })))?.password
		).toMatch(/username/);
	});
});

describe('deactivate / reactivate', () => {
	it('deactivating ends sessions at once and blocks sign-in; reactivating restores it', async () => {
		const token = createSession(db, 2);
		setUserActive(db, ADMIN, 2, false);
		expect(resolveSession(db, token)).toBeNull();
		expect((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = 2').get() as { n: number }).n).toBe(0);
		expect((await login(db, 'demo-tech', 'openvision-demo', 'ip', { limiter: new LoginLimiter() })).ok).toBe(false);
		setUserActive(db, ADMIN, 2, true);
		expect((await login(db, 'demo-tech', 'openvision-demo', 'ip', { limiter: new LoginLimiter() })).ok).toBe(true);
		expect(searchAudit(db, { userId: ADMIN }).rows.map((r) => r.action)).toEqual(['user.reactivated', 'user.deactivated']);
	});

	it('cannot deactivate yourself or the last active admin', async () => {
		expect((await errorsOf(() => setUserActive(db, ADMIN, ADMIN, false)))?.form).toMatch(/own account/);
		expect((await errorsOf(() => setUserActive(db, 1, ADMIN, false)))?.form).toMatch(/last active admin/);
		const second = await createUser(db, { username: 'admin2', displayName: 'Second Admin', role: 'admin', password: PW });
		expect(activeAdminCount(db)).toBe(2);
		setUserActive(db, second, ADMIN, false);
		expect(getUser(db, ADMIN)?.active).toBe(false);
	});
});

describe('roles', () => {
	it('changes a role, audited; refuses own role and demoting the last admin', async () => {
		setUserRole(db, ADMIN, 2, 'provider');
		expect(getUser(db, 2)?.role).toBe('provider');
		expect(searchAudit(db, { action: 'user.role_changed' }).rows[0].detail).toContain('"to":"provider"');
		expect((await errorsOf(() => setUserRole(db, ADMIN, ADMIN, 'tech')))?.form).toMatch(/own role/);
		expect((await errorsOf(() => setUserRole(db, 1, ADMIN, 'tech')))?.form).toMatch(/last active admin/);
		expect((await errorsOf(() => setUserRole(db, ADMIN, 2, 'owner')))?.role).toBeTruthy();
	});
});

describe('passwords', () => {
	it('admin reset sets a temporary password, ends sessions and forces a change; audited', async () => {
		const token = createSession(db, 1);
		await resetPassword(db, ADMIN, 1, 'temporary words here');
		expect(resolveSession(db, token)).toBeNull();
		expect(getUser(db, 1)?.mustChangePassword).toBe(true);
		expect(searchAudit(db, { action: 'auth.password_reset' }).rows[0]).toMatchObject({ userId: ADMIN });
		expect((await errorsOf(() => resetPassword(db, ADMIN, 1, 'short')))?.password).toBeTruthy();
	});

	it('own change needs the current password, keeps this session, ends the others, clears the flag', async () => {
		await resetPassword(db, ADMIN, 1, 'temporary words here');
		const mine = createSession(db, 1);
		const other = createSession(db, 1);
		expect((await errorsOf(() => changeOwnPassword(db, 1, { current: 'wrong one', next: PW, confirm: PW })))?.current).toBeTruthy();
		expect((await errorsOf(() => changeOwnPassword(db, 1, { current: 'temporary words here', next: PW, confirm: 'different' })))?.confirm).toBeTruthy();
		await changeOwnPassword(db, 1, { current: 'temporary words here', next: PW, confirm: PW }, mine);
		expect(resolveSession(db, mine)).not.toBeNull();
		expect(resolveSession(db, other)).toBeNull();
		expect(getUser(db, 1)?.mustChangePassword).toBe(false);
		expect(searchAudit(db, { action: 'auth.password_changed' }).total).toBe(1);
	});

	it('display name is validated and audited', async () => {
		expect(updateDisplayName(db, 1, '  Dr.   Example  Two ')).toBe('Dr. Example Two');
		expect((await errorsOf(() => updateDisplayName(db, 1, ' ')))?.displayName).toBeTruthy();
		expect(searchAudit(db, { action: 'user.renamed' }).total).toBe(1);
	});
});

describe('first-run setup', () => {
	it('creates the first admin only while nobody can sign in', async () => {
		const fresh = openDatabase(':memory:');
		expect(needsSetup(fresh)).toBe(true);
		expect((await errorsOf(() => setupFirstAdmin(fresh, { username: 'boss', displayName: 'Boss', password: PW, confirm: 'nope' })))?.confirm).toBeTruthy();
		const id = await setupFirstAdmin(fresh, { username: 'boss', displayName: 'Boss', password: PW, confirm: PW });
		expect(getUser(fresh, id)).toMatchObject({ role: 'admin', mustChangePassword: false });
		expect(needsSetup(fresh)).toBe(false);
		expect((await errorsOf(() => setupFirstAdmin(fresh, { username: 'boss2', displayName: 'B', password: PW, confirm: PW })))?.form).toMatch(/already complete/);
		expect(listUsers(fresh)).toHaveLength(1);
		expect(searchAudit(fresh, { action: 'auth.setup_admin' }).total).toBe(1);
	});
});
