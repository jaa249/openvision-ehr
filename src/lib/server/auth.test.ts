import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedDemo, type DB } from './db.ts';
import {
	ABSOLUTE_MS,
	createSession,
	deleteSession,
	deleteUserSessions,
	DEMO_PASSWORD,
	hashPassword,
	idleMs,
	isBackgroundRequest,
	login,
	LOGIN_ERROR,
	LoginLimiter,
	needsSetup,
	passwordProblem,
	requireRole,
	resolveSession,
	routeKind,
	safeNext,
	sessionRemaining,
	shownDemoAccounts,
	touchSession,
	verifyPassword
} from './auth.ts';
import { searchAudit } from './security_audit.ts';

let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, '2026-10-06');
});

const IDLE = 15 * 60 * 1000;
const sessions = () => (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;

describe('password hashing', () => {
	it('hashes with scrypt, a random salt and stored parameters, and verifies', async () => {
		const a = await hashPassword('a long passphrase here');
		const b = await hashPassword('a long passphrase here');
		expect(a).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
		expect(a).not.toBe(b);
		expect(await verifyPassword('a long passphrase here', a)).toBe(true);
		expect(await verifyPassword('a long passphrase herE', a)).toBe(false);
	});

	it('rejects malformed or dangerous stored hashes without throwing', async () => {
		expect(await verifyPassword('x', null)).toBe(false);
		expect(await verifyPassword('x', 'plain')).toBe(false);
		expect(await verifyPassword('x', 'scrypt$1073741824$8$1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA')).toBe(false);
		expect(await verifyPassword('x', 'scrypt$32768$999$1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA')).toBe(false);
	});
});

describe('password policy (NIST 800-63B)', () => {
	it('length 12-128, no composition rules', () => {
		expect(passwordProblem('short pass')).toMatch(/at least 12/);
		expect(passwordProblem('x'.repeat(129))).toMatch(/128/);
		expect(passwordProblem('all lower case words')).toBeNull();
		expect(passwordProblem('            ')).toMatch(/spaces/);
	});
	it('refuses common passwords, simple runs and the username', () => {
		expect(passwordProblem('Password1234')).toMatch(/common/);
		expect(passwordProblem('aaaaaaaaaaaaaa')).toMatch(/common/);
		expect(passwordProblem('123456789012')).toMatch(/common/);
		expect(passwordProblem('abcdefghijklm')).toMatch(/common/);
		expect(passwordProblem('dr.someone-long', 'Dr.Someone-Long')).toMatch(/username/);
	});
});

describe('sessions', () => {
	it('stores only the SHA-256 of the token and resolves it to the user', () => {
		const token = createSession(db, 1, 1000);
		expect(token).toMatch(/^[\w-]{43}$/);
		const row = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
		expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(row.token_hash).not.toContain(token);
		expect(resolveSession(db, token, 2000, { idle: IDLE })).toMatchObject({ id: 1, username: 'demo-provider', role: 'provider', displayName: 'Dr. Example' });
		expect(resolveSession(db, 'nope', 2000)).toBeNull();
		expect(resolveSession(db, `${token.slice(0, 42)}${token.endsWith('A') ? 'Q' : 'A'}`, 2000)).toBeNull(); // always a different last character
	});

	it('ends after the idle limit, auditing the automatic logoff', () => {
		const token = createSession(db, 1, 0);
		expect(resolveSession(db, token, IDLE - 1000, { idle: IDLE })).not.toBeNull();
		expect(resolveSession(db, token, 2 * IDLE, { idle: IDLE })).toBeNull();
		expect(sessions()).toBe(0);
		expect(searchAudit(db, { action: 'auth.idle_timeout' }).rows[0]).toMatchObject({ userId: 1 });
	});

	it('activity extends the idle window, background reads do not', () => {
		const token = createSession(db, 1, 0);
		resolveSession(db, token, IDLE - 60_000, { idle: IDLE }); // user activity
		expect(resolveSession(db, token, IDLE + 60_000, { idle: IDLE })).not.toBeNull();
		const t2 = createSession(db, 1, 0);
		resolveSession(db, t2, IDLE - 60_000, { idle: IDLE, touch: false }); // heartbeat
		expect(resolveSession(db, t2, IDLE + 60_000, { idle: IDLE })).toBeNull();
	});

	it('ends 12 hours after sign-in however active, and reports time left without extending', () => {
		const token = createSession(db, 1, 0);
		for (let t = 0; t < ABSOLUTE_MS; t += 10 * 60_000) resolveSession(db, token, t, { idle: IDLE });
		expect(sessionRemaining(db, token, ABSOLUTE_MS - 1000, IDLE)).toBe(1000);
		expect(resolveSession(db, token, ABSOLUTE_MS + 1, { idle: IDLE })).toBeNull();
		expect(searchAudit(db, { action: 'auth.session_expired' }).total).toBe(1);
	});

	it('touch, logout and sign-out-everywhere', () => {
		const a = createSession(db, 1, 0);
		const b = createSession(db, 1, 0);
		touchSession(db, a, 5000);
		expect(sessionRemaining(db, a, 5000, IDLE)).toBe(IDLE);
		deleteSession(db, a);
		expect(resolveSession(db, a, 6000)).toBeNull();
		const c = createSession(db, 1, 0);
		deleteUserSessions(db, 1, c);
		expect(resolveSession(db, b, 6000, { idle: IDLE })).toBeNull();
		expect(resolveSession(db, c, 6000, { idle: IDLE })).not.toBeNull();
	});

	it('a deactivated user has no session', () => {
		const token = createSession(db, 2, 0);
		db.prepare('UPDATE users SET active = 0 WHERE id = 2').run();
		expect(resolveSession(db, token, 1000)).toBeNull();
	});

	it('idle minutes come from OPENVISION_IDLE_MINUTES, clamped to 5-60, default 15', () => {
		expect(idleMs(undefined)).toBe(15 * 60_000);
		expect(idleMs('30')).toBe(30 * 60_000);
		expect(idleMs('1')).toBe(5 * 60_000);
		expect(idleMs('600')).toBe(60 * 60_000);
		expect(idleMs('abc')).toBe(15 * 60_000);
	});

	it('background requests: x-background header and the exam lock endpoint', () => {
		const req = (h: Record<string, string> = {}) => new Request('http://x/', { headers: h });
		expect(isBackgroundRequest(req({ 'x-background': '1' }), '/api/session')).toBe(true);
		expect(isBackgroundRequest(req(), '/api/patients/1/encounters/2/lock')).toBe(true);
		expect(isBackgroundRequest(req(), '/api/patients/1/encounters/2/findings')).toBe(false);
	});
});

describe('login', () => {
	it('signs in with the demo password, case-insensitive username, and audits it', async () => {
		const r = await login(db, ' Demo-Provider ', DEMO_PASSWORD, '10.0.0.5', { limiter: new LoginLimiter() });
		expect(r.ok).toBe(true);
		if (r.ok) expect(resolveSession(db, r.token)?.id).toBe(1);
		expect(searchAudit(db, { action: 'auth.login' }).rows[0]).toMatchObject({ userId: 1 });
	});

	it('gives one generic message, logs username and IP but never the password', async () => {
		const limiter = new LoginLimiter();
		const wrong = await login(db, 'demo-provider', 'not-the-password', '10.0.0.5', { limiter });
		const unknown = await login(db, 'nobody-here', 'not-the-password', '10.0.0.5', { limiter });
		expect(wrong).toEqual({ ok: false, message: LOGIN_ERROR });
		expect(unknown).toEqual({ ok: false, message: LOGIN_ERROR });
		const rows = searchAudit(db, { action: 'auth.login_failed' }).rows;
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.userId).sort()).toEqual([1, null].sort());
		for (const r of rows) {
			expect(r.detail).toContain('10.0.0.5');
			expect(r.detail).not.toContain('not-the-password');
		}
	});

	it('deactivated users cannot sign in', async () => {
		db.prepare('UPDATE users SET active = 0 WHERE id = 2').run();
		expect((await login(db, 'demo-tech', DEMO_PASSWORD, 'ip', { limiter: new LoginLimiter() })).ok).toBe(false);
	});

	it('locks a username+IP after 5 failures for a minute, audited; other IPs unaffected', async () => {
		const limiter = new LoginLimiter(5, 60_000);
		for (let i = 0; i < 5; i++) await login(db, 'demo-admin', 'wrong password!', '1.1.1.1', { limiter, now: 1000 });
		expect(searchAudit(db, { action: 'auth.lockout' }).total).toBe(1);
		const locked = await login(db, 'demo-admin', DEMO_PASSWORD, '1.1.1.1', { limiter, now: 2000 });
		expect(locked).toMatchObject({ ok: false, retryAfter: 59 });
		expect((await login(db, 'demo-admin', DEMO_PASSWORD, '2.2.2.2', { limiter, now: 2000 })).ok).toBe(true);
		expect((await login(db, 'demo-admin', DEMO_PASSWORD, '1.1.1.1', { limiter, now: 62_000 })).ok).toBe(true);
	});

	it('limiter: a success clears the count', () => {
		const l = new LoginLimiter(3, 1000);
		const k = l.key('A', 'ip');
		l.fail(k, 0);
		l.fail(k, 0);
		l.succeed(k);
		expect(l.fail(k, 0)).toBe(false);
		expect(l.retryAfter(k, 0)).toBe(0);
	});
});

describe('route gate and helpers', () => {
	it('classifies routes', () => {
		expect(routeKind('/login')).toBe('public');
		expect(routeKind('/setup')).toBe('public');
		expect(routeKind('/logout')).toBe('public');
		expect(routeKind('/_app/immutable/x.js')).toBe('public');
		expect(routeKind('/loginx')).toBe('page');
		expect(routeKind('/api/prefs')).toBe('api');
		expect(routeKind('/export/csv')).toBe('api');
		expect(routeKind('/patients/1')).toBe('page');
		expect(routeKind('/')).toBe('page');
	});
	it('only same-site paths survive as ?next', () => {
		expect(safeNext('/patients/1?x=2')).toBe('/patients/1?x=2');
		for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', '/login', null]) expect(safeNext(bad)).toBe('/');
	});
	it('needs setup only when nobody can sign in', () => {
		expect(needsSetup(db)).toBe(false);
		const empty = openDatabase(':memory:');
		expect(needsSetup(empty)).toBe(true);
	});
	it('requireRole throws 403 for the wrong role', () => {
		const locals = { userId: 2, user: { id: 2, displayName: 'T', role: 'tech' } } as App.Locals;
		expect(() => requireRole(locals, 'admin')).toThrow(expect.objectContaining({ status: 403 }));
		expect(() => requireRole({ ...locals, user: { ...locals.user, role: 'admin' } }, 'admin')).not.toThrow();
	});
});

describe('demo accounts hint', () => {
	it('lists demo accounts only while they keep the demo password and are active', async () => {
		expect((await shownDemoAccounts(db)).map((d) => d.username)).toEqual(['demo-provider', 'demo-tech', 'demo-admin']);
		db.prepare("UPDATE users SET password_hash = ? WHERE username = 'demo-admin'").run(await hashPassword('a different passphrase'));
		db.prepare("UPDATE users SET active = 0 WHERE username = 'demo-tech'").run();
		expect((await shownDemoAccounts(db)).map((d) => d.username)).toEqual(['demo-provider']);
	});
	it('never on an install without demo data', async () => {
		expect(await shownDemoAccounts(openDatabase(':memory:'))).toEqual([]);
	});
});
