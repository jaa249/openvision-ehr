// Sign-in: password hashing, sessions, login rate limiting, the route gate and role checks.
//
// Passwords: scrypt (node:crypto) with a random 16-byte salt; the cost parameters are stored with
// the hash ("scrypt$N$r$p$salt$hash"), so they can be raised later without breaking old hashes.
// Sessions: a random 32-byte token goes in the HttpOnly cookie; only its SHA-256 is stored.
// Automatic logoff (HIPAA 164.312(a)(2)(iii)): a session ends after OPENVISION_IDLE_MINUTES without
// user activity (default 15, allowed 5-60) or 12 h after sign-in (absolute), whichever comes first.
// Background requests (header x-background: 1, and the exam lock heartbeat/poll) never count as
// activity, or an open exam would keep a walked-away session alive forever.
//
// Emergency access (164.312(a)(2)(ii)): an admin can reset any user's password in Settings > Users;
// if no admin can sign in, `node scripts/reset-admin.mjs <username>` on the server console sets a
// temporary password for an admin account (audited as auth.emergency_reset).
import { createHash, randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { DB } from './db.ts';
import { securityAudit } from './security_audit.ts';
import { PASSWORD_MAX, PASSWORD_MIN } from '#lib/components/settings/rules.ts';

export type Role = 'admin' | 'provider' | 'tech';
export const ROLES: readonly Role[] = ['admin', 'provider', 'tech'];
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', provider: 'Provider', tech: 'Technician' };

export interface SessionUser {
	id: number;
	username: string;
	displayName: string;
	role: Role;
	mustChangePassword: boolean;
}

// ---------------------------------------------------------------- passwords

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32 };
const SALT_BYTES = 16;
export { PASSWORD_MAX, PASSWORD_MIN };

const maxmem = (N: number, r: number) => 256 * N * r + 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scryptCb(password.normalize('NFKC'), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)))
	);
}

const b64 = (b: Buffer) => b.toString('base64url');
const format = (salt: Buffer, key: Buffer) => `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(key)}`;
const opts = { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: maxmem(SCRYPT.N, SCRYPT.r) };

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	return format(salt, await scryptAsync(password, salt, SCRYPT.keylen, opts));
}

/** Synchronous variant for seeding (seedDemo is synchronous). Blocks for ~100 ms; never use per request. */
export function hashPasswordSync(password: string): string {
	const salt = randomBytes(SALT_BYTES);
	return format(salt, scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, opts));
}

interface Parsed {
	N: number;
	r: number;
	p: number;
	salt: Buffer;
	key: Buffer;
}

function parseHash(stored: string): Parsed | null {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
	const [N, r, p] = parts.slice(1, 4).map(Number);
	// Bounds stop a tampered row from turning one sign-in into a memory or CPU bomb.
	if (!Number.isInteger(N) || N < 1024 || N > 2 ** 20 || (N & (N - 1)) !== 0) return null;
	if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 8) return null;
	const salt = Buffer.from(parts[4], 'base64url');
	const key = Buffer.from(parts[5], 'base64url');
	if (salt.length < 8 || key.length < 16 || key.length > 128) return null;
	return { N, r, p, salt, key };
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
	if (typeof password !== 'string' || !stored) return false;
	const h = parseHash(stored);
	if (!h) return false;
	const key = await scryptAsync(password, h.salt, h.key.length, { N: h.N, r: h.r, p: h.p, maxmem: maxmem(h.N, h.r) });
	return timingSafeEqual(key, h.key);
}

let dummyHash: string | null = null;
/** Spends the same work for unknown usernames, so response time does not reveal which names exist. */
async function burnVerify(password: string): Promise<void> {
	dummyHash ??= await hashPassword(randomBytes(12).toString('hex'));
	await verifyPassword(password, dummyHash);
}

/**
 * A message for the password field, or null when acceptable. NIST SP 800-63B: length 12-128, no
 * composition rules, but refuse well-known passwords and the username itself.
 */
export function passwordProblem(password: string, username?: string | null): string | null {
	if (typeof password !== 'string' || password.length === 0) return 'Enter a password.';
	if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
	if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
	if (password.trim().length === 0) return 'A password cannot be only spaces.';
	const lower = password.toLowerCase();
	if (username && lower === username.trim().toLowerCase()) return 'The password cannot be the same as the username.';
	if (isCommonPassword(lower)) return 'That password is too common. Choose something less predictable.';
	return null;
}

/** A short built-in deny list (NIST 800-63B "commonly used" check); compared lower-case. */
const COMMON = new Set([
	'123456789012', '1234567890123', '111111111111', '000000000000', '123123123123', 'password1234',
	'password12345', 'password123456', 'passwordpassword', 'p@ssw0rd1234', 'qwertyuiopas', 'qwerty123456',
	'qwertyqwerty', '1q2w3e4r5t6y', '1qaz2wsx3edc', 'asdfghjkl123', 'iloveyou1234', 'letmein12345',
	'welcome12345', 'welcome123456', 'changeme1234', 'changeme12345', 'administrator', 'admin1234567',
	'adminadmin12', 'trustno1trustno1', 'abc123abc123', 'football1234', 'baseball1234', 'superman1234',
	'sunshine1234', 'princess1234', 'dragon123456', 'monkey123456', 'master123456', 'openvision12',
	'openvision123', 'openvision1234', 'openvisionehr', 'eyedoctor123', 'optometrist1', 'ophthalmology',
	'temporary123', 'temppassword', 'newpassword1', 'newpassword12', 'mypassword12', 'secret123456',
	'correcthorsebatterystaple'
]);

export function isCommonPassword(lower: string): boolean {
	if (COMMON.has(lower)) return true;
	// One repeated character, or a plain ascending/descending run such as 123456789012 or abcdefghijkl.
	if (/^(.)\1+$/.test(lower)) return true;
	const c = [...lower].map((ch) => ch.charCodeAt(0));
	return c.every((v, i) => i === 0 || v - c[i - 1] === 1) || c.every((v, i) => i === 0 || c[i - 1] - v === 1);
}

// ---------------------------------------------------------------- sessions

export const SESSION_COOKIE = 'ov_session';
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const IDLE_MINUTES_DEFAULT = 15;
/** last_seen is written at most this often, so reads do not turn every request into a write. */
const TOUCH_MS = 15 * 1000;

/** Idle timeout in ms: OPENVISION_IDLE_MINUTES (5-60, default 15). */
export function idleMs(env: string | undefined = process.env.OPENVISION_IDLE_MINUTES): number {
	const n = Number(env);
	const minutes = env && Number.isFinite(n) ? Math.min(60, Math.max(5, Math.round(n))) : IDLE_MINUTES_DEFAULT;
	return minutes * 60 * 1000;
}

const LOCK_PATH = /^\/api\/patients\/\d+\/encounters\/\d+\/lock\/?$/;

/** Requests that must not count as user activity: marked by the client, or the exam lock heartbeat/poll. */
export function isBackgroundRequest(request: Request, pathname: string): boolean {
	return request.headers.get('x-background') === '1' || LOCK_PATH.test(pathname);
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, userId: number, now = Date.now()): string {
	const token = randomBytes(32).toString('base64url');
	db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)').run(tokenHash(token), userId, now, now);
	return token;
}

/**
 * The signed-in user for a cookie token, or null (unknown, expired, or the user was deactivated).
 * `touch: false` (background requests) reads the session without extending it.
 */
export function resolveSession(
	db: DB,
	token: string | undefined | null,
	now = Date.now(),
	{ touch = true, idle = idleMs() }: { touch?: boolean; idle?: number } = {}
): SessionUser | null {
	if (!token || !TOKEN_RE.test(token)) return null;
	const h = tokenHash(token);
	const row = db
		.prepare(
			`SELECT s.created_at, s.last_seen, u.id, u.username, u.display_name, u.role, u.active, u.password_hash, u.must_change_password
			   FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
		)
		.get(h) as
		| {
				created_at: number;
				last_seen: number;
				id: number;
				username: string | null;
				display_name: string;
				role: Role;
				active: number;
				password_hash: string | null;
				must_change_password: number;
		  }
		| undefined;
	if (!row) return null;
	const absolute = now - row.created_at > ABSOLUTE_MS;
	const idleOut = now - row.last_seen > idle;
	if (absolute || idleOut || !row.active || !row.password_hash || !row.username) {
		db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
		if (absolute || idleOut) {
			securityAudit(db, { action: absolute ? 'auth.session_expired' : 'auth.idle_timeout', userId: row.id }, new Date(now));
		}
		return null;
	}
	if (touch && now - row.last_seen > TOUCH_MS) db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(now, h);
	return {
		id: row.id,
		username: row.username,
		displayName: row.display_name,
		role: row.role,
		mustChangePassword: row.must_change_password === 1
	};
}

/** Milliseconds until this session ends (idle or absolute, whichever first); 0 when gone. Does not extend it. */
export function sessionRemaining(db: DB, token: string | undefined | null, now = Date.now(), idle = idleMs()): number {
	if (!token || !TOKEN_RE.test(token)) return 0;
	const row = db.prepare('SELECT created_at, last_seen FROM sessions WHERE token_hash = ?').get(tokenHash(token)) as
		| { created_at: number; last_seen: number }
		| undefined;
	if (!row) return 0;
	return Math.max(0, Math.min(row.last_seen + idle, row.created_at + ABSOLUTE_MS) - now);
}

/** "Stay signed in": counts as activity right now, regardless of the write throttle. */
export function touchSession(db: DB, token: string | undefined | null, now = Date.now()): void {
	if (token && TOKEN_RE.test(token)) db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(now, tokenHash(token));
}

export function deleteSession(db: DB, token: string | undefined | null): void {
	if (token && TOKEN_RE.test(token)) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

/** Signs a user out everywhere, optionally keeping the session making the request. */
export function deleteUserSessions(db: DB, userId: number, keepToken?: string): void {
	if (keepToken && TOKEN_RE.test(keepToken)) {
		db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, tokenHash(keepToken));
	} else {
		db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
	}
}

export function purgeExpiredSessions(db: DB, now = Date.now(), idle = idleMs()): void {
	db.prepare('DELETE FROM sessions WHERE created_at < ? OR last_seen < ?').run(now - ABSOLUTE_MS, now - idle);
}

export function sessionCookieOptions(secure: boolean) {
	return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure, maxAge: ABSOLUTE_MS / 1000 };
}

/**
 * Whether the browser is talking https. adapter-node reports https for every request unless a
 * proxy header is configured, so the URL cannot be trusted on a plain-http LAN install. Sign-in
 * is a POST, which always carries the page's real Origin; that decides. (A Secure cookie on
 * plain http would be dropped by the browser and sign-in would loop.)
 */
export function isHttps(request: Request, url: URL): boolean {
	const origin = request.headers.get('origin');
	if (origin) {
		try {
			return new URL(origin).protocol === 'https:';
		} catch {
			/* fall through */
		}
	}
	return url.protocol === 'https:' && url.hostname !== 'localhost';
}

// ---------------------------------------------------------------- rate limiting

/** Failed sign-ins per (username, IP): after `maxFails` the pair is locked for `lockMs`. In memory. */
export class LoginLimiter {
	private entries = new Map<string, { fails: number; first: number; lockedUntil: number }>();
	constructor(
		readonly maxFails = 5,
		readonly lockMs = 60_000,
		readonly windowMs = 15 * 60_000,
		readonly maxEntries = 10_000
	) {}

	key(username: string, ip: string): string {
		return `${username.trim().toLowerCase()}\u0000${ip}`;
	}

	/** Seconds until the pair may try again; 0 = allowed. */
	retryAfter(key: string, now = Date.now()): number {
		const e = this.entries.get(key);
		return e && e.lockedUntil > now ? Math.ceil((e.lockedUntil - now) / 1000) : 0;
	}

	/** Records a failure; returns true when this failure starts a lockout. */
	fail(key: string, now = Date.now()): boolean {
		let e = this.entries.get(key);
		if (!e || now - e.first > this.windowMs || (e.lockedUntil && e.lockedUntil <= now)) {
			e = { fails: 0, first: now, lockedUntil: 0 };
		}
		e.fails++;
		const locked = e.fails >= this.maxFails;
		if (locked) e.lockedUntil = now + this.lockMs;
		this.entries.delete(key);
		this.entries.set(key, e);
		if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
		return locked;
	}

	succeed(key: string): void {
		this.entries.delete(key);
	}
}

export const loginLimiter = new LoginLimiter();

export const LOGIN_ERROR = 'Wrong username or password.';

export type LoginResult = { ok: true; user: SessionUser; token: string } | { ok: false; message: string; retryAfter?: number };

/** Checks credentials and starts a new session (the caller deletes any previous one: rotation). */
export async function login(
	db: DB,
	username: string,
	password: string,
	ip: string,
	{ limiter = loginLimiter, now = Date.now() }: { limiter?: LoginLimiter; now?: number } = {}
): Promise<LoginResult> {
	const name = typeof username === 'string' ? username.trim().slice(0, 64) : '';
	const pw = typeof password === 'string' ? password.slice(0, PASSWORD_MAX + 1) : '';
	const key = limiter.key(name, ip);
	const at = new Date(now);
	const row = name
		? (db.prepare('SELECT id, password_hash, active FROM users WHERE username = ? COLLATE NOCASE').get(name) as
				| { id: number; password_hash: string | null; active: number }
				| undefined)
		: undefined;
	const wait = limiter.retryAfter(key, now);
	if (wait > 0) {
		securityAudit(db, { action: 'auth.login_failed', userId: row?.id ?? null, detail: { username: name, ip, reason: 'locked out' } }, at);
		return { ok: false, message: `Too many failed attempts. Try again in ${wait} seconds.`, retryAfter: wait };
	}
	let ok = false;
	if (row?.password_hash && row.active) ok = await verifyPassword(pw, row.password_hash);
	else await burnVerify(pw);
	if (!ok || !row) {
		// The username tried and the IP are logged; the password never is.
		const reason = !row ? 'unknown username' : !row.active ? 'deactivated' : !row.password_hash ? 'no password' : 'wrong password';
		securityAudit(db, { action: 'auth.login_failed', userId: row?.id ?? null, detail: { username: name, ip, reason } }, at);
		if (limiter.fail(key, now)) {
			securityAudit(db, { action: 'auth.lockout', userId: row?.id ?? null, detail: { username: name, ip, seconds: limiter.lockMs / 1000 } }, at);
		}
		return { ok: false, message: LOGIN_ERROR };
	}
	limiter.succeed(key);
	purgeExpiredSessions(db, now);
	const token = createSession(db, row.id, now);
	const user = resolveSession(db, token, now);
	if (!user) return { ok: false, message: LOGIN_ERROR };
	securityAudit(db, { action: 'auth.login', userId: row.id, detail: { ip } }, at);
	return { ok: true, user, token };
}

// ---------------------------------------------------------------- route gate

export type RouteKind = 'public' | 'api' | 'page';

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** public: sign-in pages and static files; api: JSON/file endpoints (401); page: everything else (redirect). */
export function routeKind(pathname: string): RouteKind {
	if (under(pathname, '/login') || under(pathname, '/setup') || under(pathname, '/logout')) return 'public';
	if (pathname.startsWith('/_app/') || pathname === '/robots.txt' || pathname === '/favicon.ico') return 'public';
	if (under(pathname, '/api') || under(pathname, '/export')) return 'api';
	return 'page';
}

/** A same-site path to return to after sign-in; anything else becomes "/". */
export function safeNext(raw: string | null | undefined): string {
	if (typeof raw !== 'string' || raw.length > 2000) return '/';
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f\\]/.test(raw)) return '/';
	if (under(raw.split(/[?#]/)[0], '/login') || under(raw.split(/[?#]/)[0], '/logout')) return '/';
	return raw;
}

/** First run: nobody can sign in yet, so /setup creates the first admin. */
export function needsSetup(db: DB): boolean {
	return !db.prepare('SELECT 1 FROM users WHERE active = 1 AND password_hash IS NOT NULL AND username IS NOT NULL LIMIT 1').get();
}

// ---------------------------------------------------------------- roles

/** admin: settings + users; provider: clinical, signs own exams, own normals and quick picks; tech: exam entry. */
export const canManageSettings = (role: Role | undefined) => role === 'admin';
export const canEditClinicalLists = (role: Role | undefined) => role === 'provider' || role === 'admin';

/** Throws 403 unless the signed-in user has one of the roles (server-side check for every settings route). */
export function requireRole(locals: App.Locals, ...roles: Role[]): void {
	if (!locals.user) error(401, 'Sign in first');
	if (!roles.includes(locals.user.role)) error(403, 'You do not have access to this page');
}

// ---------------------------------------------------------------- demo accounts

export const DEMO_PASSWORD = 'openvision-demo';
export const DEMO_USERS: readonly { id: number; username: string; displayName: string; role: Role }[] = [
	{ id: 1, username: 'demo-provider', displayName: 'Dr. Example', role: 'provider' },
	{ id: 2, username: 'demo-tech', displayName: 'Casey Tech (demo)', role: 'tech' },
	{ id: 3, username: 'demo-admin', displayName: 'Office Admin (demo)', role: 'admin' }
];

let demoHash: string | null = null;
/** One hash per process for the seeded demo accounts (saves ~100 ms per seed in tests). */
export function demoPasswordHash(): string {
	demoHash ??= hashPasswordSync(DEMO_PASSWORD);
	return demoHash;
}

const demoVerified = new Map<string, boolean>();

/**
 * Demo accounts to list on the sign-in page: those that exist, are active and STILL have the public
 * demo password. A real install (OPENVISION_DEMO=0, or demo accounts changed or deactivated) shows none.
 */
export async function shownDemoAccounts(db: DB): Promise<{ username: string; role: Role }[]> {
	if (process.env.OPENVISION_DEMO === '0') return [];
	const out: { username: string; role: Role }[] = [];
	for (const d of DEMO_USERS) {
		const row = db
			.prepare('SELECT username, role, password_hash FROM users WHERE username = ? AND active = 1')
			.get(d.username) as { username: string; role: Role; password_hash: string | null } | undefined;
		if (!row?.password_hash) continue;
		let same = demoVerified.get(row.password_hash);
		if (same === undefined) {
			same = await verifyPassword(DEMO_PASSWORD, row.password_hash);
			if (demoVerified.size > 100) demoVerified.clear();
			demoVerified.set(row.password_hash, same);
		}
		if (same) out.push({ username: row.username, role: row.role });
	}
	return out;
}
