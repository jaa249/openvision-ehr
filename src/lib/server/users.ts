// User accounts: create, deactivate/reactivate, reset and change passwords, first-run admin.
// Guards: nobody deactivates or demotes themselves, and the last active admin always stays.
// Unique user identification (HIPAA 164.312(a)(2)(i)): one account per person, usernames unique
// case-insensitively; deactivated accounts cannot sign in and lose their sessions at once.
// Every change is written to the audit log with the acting admin.
import type { DB } from './db.ts';
import { SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { securityAudit } from './security_audit.ts';
import { defaultUsBilling, updateCodeSettings } from './settings.ts';
import { isCodeSetId } from '#lib/codesets/index.ts';
import { deleteUserSessions, hashPassword, needsSetup, passwordProblem, ROLES, verifyPassword, type Role } from './auth.ts';

export type FieldErrors = Record<string, string>;

/** Thrown with one message per bad field so forms can show them inline. */
export class UserError extends Error {
	errors: FieldErrors;
	constructor(errors: FieldErrors) {
		super(Object.values(errors)[0] ?? 'Invalid input');
		this.errors = errors;
	}
}

export interface UserRow {
	id: number;
	username: string | null;
	displayName: string;
	role: Role;
	active: boolean;
	mustChangePassword: boolean;
	canSignIn: boolean;
	createdAt: string | null;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;
const NAME_MAX = 60;
const CONTROL = /[\u0000-\u001f\u007f]/;

type Raw = {
	id: number;
	username: string | null;
	display_name: string;
	role: Role;
	active: number;
	must_change_password: number;
	password_hash: string | null;
	created_at: string | null;
};

const toRow = (r: Raw): UserRow => ({
	id: r.id,
	username: r.username,
	displayName: r.display_name,
	role: r.role,
	active: r.active === 1,
	mustChangePassword: r.must_change_password === 1,
	canSignIn: !!(r.username && r.password_hash && r.active === 1),
	createdAt: r.created_at
});

const SELECT = 'SELECT id, username, display_name, role, active, must_change_password, password_hash, created_at FROM users';

export function listUsers(db: DB): UserRow[] {
	return (db.prepare(`${SELECT} ORDER BY active DESC, display_name COLLATE NOCASE, id`).all() as Raw[]).map(toRow);
}

export function getUser(db: DB, id: number): UserRow | null {
	const r = db.prepare(`${SELECT} WHERE id = ?`).get(id) as Raw | undefined;
	return r ? toRow(r) : null;
}

export function activeAdminCount(db: DB): number {
	return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND password_hash IS NOT NULL").get() as { n: number }).n;
}

function checkDisplayName(v: unknown, errors: FieldErrors): string {
	const name = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
	if (!name) errors.displayName = 'Display name is required.';
	else if (name.length > NAME_MAX) errors.displayName = `Display name must be ${NAME_MAX} characters or fewer.`;
	else if (CONTROL.test(name)) errors.displayName = 'Display name contains characters that are not allowed.';
	return name;
}

function checkUsername(db: DB, v: unknown, errors: FieldErrors): string {
	const u = typeof v === 'string' ? v.trim() : '';
	if (!u) errors.username = 'Username is required.';
	else if (!USERNAME_RE.test(u)) errors.username = 'Use 3-32 letters, numbers, dots, hyphens or underscores, starting with a letter or number.';
	else if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(u)) errors.username = 'That username is already taken.';
	return u;
}

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** Every new user starts with the starter normal values (spec §3.1), so "Normal" works for them at once. */
function seedDefaults(db: DB, userId: number): void {
	const ins = db.prepare('INSERT OR IGNORE INTO user_defaults (user_id, field, value) VALUES (?, ?, ?)');
	for (const [field, value] of Object.entries(SEED_DEFAULTS)) ins.run(userId, field, value);
}

export interface NewUser {
	username: string;
	displayName: string;
	role: Role | string;
	password: string;
}

/**
 * Adds a user. By default the password is temporary: the user must change it at first sign-in.
 * Returns the new id.
 */
export async function createUser(
	db: DB,
	input: NewUser,
	{ actorId = null, temporary = true, now = new Date() }: { actorId?: number | null; temporary?: boolean; now?: Date } = {}
): Promise<number> {
	const errors: FieldErrors = {};
	const username = checkUsername(db, input.username, errors);
	const displayName = checkDisplayName(input.displayName, errors);
	if (!isRole(input.role)) errors.role = 'Choose a role.';
	const pw = passwordProblem(input.password, username);
	if (pw) errors.password = pw;
	if (Object.keys(errors).length) throw new UserError(errors);
	const hash = await hashPassword(input.password);
	db.exec('BEGIN');
	try {
		// Re-check inside the transaction: the hash above yielded the event loop.
		if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
			throw new UserError({ username: 'That username is already taken.' });
		}
		const { lastInsertRowid } = db
			.prepare(
				'INSERT INTO users (username, display_name, role, password_hash, active, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
			)
			.run(username, displayName, input.role as Role, hash, temporary ? 1 : 0, now.toISOString());
		const id = Number(lastInsertRowid);
		seedDefaults(db, id);
		securityAudit(db, { action: 'user.created', userId: actorId ?? id, detail: { targetUserId: id, username, role: input.role } }, now);
		db.exec('COMMIT');
		return id;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

/** First run only (no one can sign in yet): creates the first admin. Throws UserError when setup is already done. */
export async function setupFirstAdmin(
	db: DB,
	input: { username: string; displayName: string; password: string; confirm: string; codeSet?: unknown },
	now = new Date()
): Promise<number> {
	if (!needsSetup(db)) throw new UserError({ form: 'Setup is already complete. Sign in instead.' });
	const errors: FieldErrors = {};
	if (input.password !== input.confirm) errors.confirm = 'The two passwords do not match.';
	// The diagnosis code set (D44); US code suggestions start on for ICD-10-CM, off for ICD-11 (D45).
	const codeSet = input.codeSet === undefined || input.codeSet === '' ? 'icd10cm' : input.codeSet;
	if (!isCodeSetId(codeSet)) errors.codeSet = 'Choose ICD-10-CM or ICD-11.';
	checkPre(db, input, errors);
	if (Object.keys(errors).length) throw new UserError(errors);
	const hash = await hashPassword(input.password);
	db.exec('BEGIN');
	try {
		if (!needsSetup(db)) throw new UserError({ form: 'Setup is already complete. Sign in instead.' });
		const { lastInsertRowid } = db
			.prepare(
				"INSERT INTO users (username, display_name, role, password_hash, active, must_change_password, created_at) VALUES (?, ?, 'admin', ?, 1, 0, ?)"
			)
			.run(input.username.trim(), input.displayName.trim().replace(/\s+/g, ' '), hash, now.toISOString());
		const id = Number(lastInsertRowid);
		seedDefaults(db, id);
		if (isCodeSetId(codeSet)) updateCodeSettings(db, { codeSet, usBilling: defaultUsBilling(codeSet) }, null);
		securityAudit(db, { action: 'auth.setup_admin', userId: id, detail: { username: input.username.trim(), codeSet } }, now);
		db.exec('COMMIT');
		return id;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

function checkPre(db: DB, input: { username: string; displayName: string; password: string }, errors: FieldErrors) {
	checkUsername(db, input.username, errors);
	checkDisplayName(input.displayName, errors);
	const pw = passwordProblem(input.password, input.username);
	if (pw) errors.password = pw;
}

function mustExist(db: DB, id: number): UserRow {
	const u = Number.isSafeInteger(id) ? getUser(db, id) : null;
	if (!u) throw new UserError({ form: 'That user was not found.' });
	return u;
}

/** Deactivating signs the user out everywhere. Refuses yourself and the last active admin. */
export function setUserActive(db: DB, actorId: number, userId: number, active: boolean): void {
	const u = mustExist(db, userId);
	if (u.active === active) return;
	if (!active) {
		if (userId === actorId) throw new UserError({ form: 'You cannot deactivate your own account.' });
		if (u.role === 'admin' && u.canSignIn && activeAdminCount(db) <= 1) {
			throw new UserError({ form: 'This is the last active admin. Make another admin first.' });
		}
	}
	db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, userId);
	if (!active) deleteUserSessions(db, userId);
	securityAudit(db, { action: active ? 'user.reactivated' : 'user.deactivated', userId: actorId, detail: { targetUserId: userId, username: u.username } });
}

/** Changes a role. Refuses changing your own role and demoting the last active admin. */
export function setUserRole(db: DB, actorId: number, userId: number, role: string): void {
	const u = mustExist(db, userId);
	if (!isRole(role)) throw new UserError({ role: 'Choose a role.' });
	if (u.role === role) return;
	if (userId === actorId) throw new UserError({ form: 'You cannot change your own role.' });
	if (u.role === 'admin' && u.canSignIn && activeAdminCount(db) <= 1) {
		throw new UserError({ form: 'This is the last active admin. Make another admin first.' });
	}
	db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
	securityAudit(db, { action: 'user.role_changed', userId: actorId, detail: { targetUserId: userId, username: u.username, from: u.role, to: role } });
}

/** Admin reset: sets a temporary password (changed at next sign-in) and signs the user out everywhere. */
export async function resetPassword(db: DB, actorId: number, userId: number, temporary: string): Promise<void> {
	const u = mustExist(db, userId);
	const pw = passwordProblem(temporary, u.username);
	if (pw) throw new UserError({ password: pw });
	const hash = await hashPassword(temporary);
	db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hash, userId);
	deleteUserSessions(db, userId);
	securityAudit(db, { action: 'auth.password_reset', userId: actorId, detail: { targetUserId: userId, username: u.username } });
}

/** The user's own change: current password required; other sessions are signed out, this one kept. */
export async function changeOwnPassword(
	db: DB,
	userId: number,
	input: { current: string; next: string; confirm: string },
	keepToken?: string
): Promise<void> {
	const row = db.prepare('SELECT username, password_hash FROM users WHERE id = ?').get(userId) as
		| { username: string | null; password_hash: string | null }
		| undefined;
	const errors: FieldErrors = {};
	if (!row || !(await verifyPassword(input.current ?? '', row.password_hash))) errors.current = 'That is not your current password.';
	const pw = passwordProblem(input.next, row?.username);
	if (pw) errors.next = pw;
	else if (input.next === input.current) errors.next = 'Choose a password different from the current one.';
	if (input.next !== input.confirm) errors.confirm = 'The two passwords do not match.';
	if (Object.keys(errors).length) throw new UserError(errors);
	const hash = await hashPassword(input.next);
	db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, userId);
	deleteUserSessions(db, userId, keepToken);
	securityAudit(db, { action: 'auth.password_changed', userId });
}

export function updateDisplayName(db: DB, userId: number, displayName: string): string {
	const errors: FieldErrors = {};
	const name = checkDisplayName(displayName, errors);
	if (Object.keys(errors).length) throw new UserError(errors);
	const before = getUser(db, userId);
	db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, userId);
	if (before && before.displayName !== name) {
		securityAudit(db, { action: 'user.renamed', userId, detail: { from: before.displayName, to: name } });
	}
	return name;
}
