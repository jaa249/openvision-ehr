// Exam signing and the edit lock (spec §15.1 FIX: enforced on the server).
// Every route that changes an exam checks assertEditable after reading the request body, inside the
// write's transaction (editTransaction); database triggers refuse signed content as well (D36).
//
// Lock model: one row per exam (exam_locks) naming the holder user and the holder PAGE (a random
// token made per page load, sent as the X-Lock-Token header). The lock is live while it has not
// been released and its last heartbeat is younger than lockMinutes(); after that anyone may take it
// (an expired lock taken by someone else is audited). Only the holder token may save, extend or
// release. Taking a live lock from someone else is an explicit, audited takeover; the previous
// holder's next request gets 423 and its page switches to read-only.
//
// Signing is final: there is no unsigning (pre-release decision: corrections after signing are
// addenda, which are append-only; the tables refuse UPDATE/DELETE with triggers).
import { createHash } from 'node:crypto';
import { transaction, type DB } from './db.ts';
import type { Signature } from '#lib/plan/types.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import { getEncounter, getFindings } from './exam.ts';
import { audit } from './audit.ts';
import { snapshotHistory } from './history.ts';

/** Who holds an exam's edit lock. Times are ISO strings. */
export interface LockInfo {
	holderId: number;
	holderName: string;
	acquiredAt: string;
	heartbeatAt: string;
	expiresAt: string;
}

/** What a page needs to know about an exam's lock and signature. `lock` is null when nobody holds a live lock. */
export interface LockState {
	lock: LockInfo | null;
	/** True when the asking page (token) holds the lock. */
	mine: boolean;
	signature: Signature | null;
	/** Current findings, sent where a read-only page needs fresh values (state poll, acquire, takeover). */
	findings?: Findings;
}

/** Thrown when an exam cannot be changed: signed, or the edit lock is held by another page. */
export class EncounterLockedError extends Error {
	constructor(
		message: string,
		/** 'signed' = finalized; 'locked' = someone else is editing. */
		readonly reason: 'signed' | 'locked',
		/** The current holder, when someone holds a live lock. */
		readonly holder: LockInfo | null = null
	) {
		super(message);
	}
}

/** Signing / addendum refused: 400 bad input, 403 not allowed, 404 no such exam, 409 wrong state. */
export class SigningError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 403 | 404 | 409
	) {
		super(message);
	}
}

export interface SigningUser {
	id: number;
	displayName: string;
	role: 'admin' | 'provider' | 'tech';
}

/** Lock lifetime after the last heartbeat, in minutes (spec: 15, configurable via OPENVISION_LOCK_MINUTES). */
export function lockMinutes(): number {
	const v = Number(process.env.OPENVISION_LOCK_MINUTES);
	return Number.isFinite(v) && v > 0 ? v : 15;
}

export const MAX_ADDENDUM_LENGTH = 4000;

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** The page's lock token from the X-Lock-Token header (null when missing or malformed). */
export function lockToken(request: Request): string | null {
	const t = request.headers.get('x-lock-token');
	return t && TOKEN_RE.test(t) ? t : null;
}

/** HTTP 423 Locked with { message, reason, lock } for the client's read-only switch. */
export function lockedResponse(e: EncounterLockedError): Response {
	return new Response(JSON.stringify({ message: e.message, reason: e.reason, lock: e.holder }), {
		status: 423,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}

/** assertEditable for a route: null when the write may go ahead, otherwise the 423 response to return. */
export function guardEditable(db: DB, patientId: number, encounterId: number, userId: number, request: Request): Response | null {
	try {
		assertEditable(db, patientId, encounterId, userId, lockToken(request));
		return null;
	} catch (e) {
		if (e instanceof EncounterLockedError) return lockedResponse(e);
		throw e;
	}
}

// ---------- lock rows ----------

interface LockRow {
	encounter_id: number;
	holder_id: number;
	holder_name: string;
	token: string;
	acquired_at: string;
	heartbeat_at: string;
	released_at: string | null;
}

function readLock(db: DB, encounterId: number): LockRow | null {
	return (
		(db
			.prepare(
				`SELECT l.*, u.display_name AS holder_name FROM exam_locks l JOIN users u ON u.id = l.holder_id WHERE l.encounter_id = ?`
			)
			.get(encounterId) as LockRow | undefined) ?? null
	);
}

const expiresAt = (row: LockRow) => new Date(Date.parse(row.heartbeat_at) + lockMinutes() * 60_000);

function isLive(row: LockRow | null, now: Date): boolean {
	return !!row && row.released_at === null && expiresAt(row).getTime() > now.getTime();
}

function info(row: LockRow): LockInfo {
	return {
		holderId: row.holder_id,
		holderName: row.holder_name,
		acquiredAt: row.acquired_at,
		heartbeatAt: row.heartbeat_at,
		expiresAt: expiresAt(row).toISOString()
	};
}

/** The holder page keeps its rights until another page takes the row, even past expiry or release. */
const holds = (row: LockRow | null, userId: number, token: string | null): boolean =>
	!!row && !!token && row.token === token && row.holder_id === userId;

function isSigned(db: DB, encounterId: number): boolean {
	return !!db.prepare('SELECT 1 FROM exam_signatures WHERE encounter_id = ?').get(encounterId);
}

function writeLock(db: DB, encounterId: number, userId: number, token: string, now: Date): void {
	const at = now.toISOString();
	db.prepare(
		`INSERT INTO exam_locks (encounter_id, holder_id, token, acquired_at, heartbeat_at, released_at)
		 VALUES (?, ?, ?, ?, ?, NULL)
		 ON CONFLICT (encounter_id) DO UPDATE SET holder_id = excluded.holder_id, token = excluded.token,
		   acquired_at = excluded.acquired_at, heartbeat_at = excluded.heartbeat_at, released_at = NULL`
	).run(encounterId, userId, token, at, at);
}

function requireEncounter(db: DB, patientId: number, encounterId: number) {
	const e = getEncounter(db, patientId, encounterId);
	if (!e) throw new SigningError('Not found', 404);
	return e;
}

function requireToken(token: string | null): string {
	if (!token || !TOKEN_RE.test(token)) throw new SigningError('Missing or invalid lock token', 400);
	return token;
}

function heldElsewhere(row: LockRow): EncounterLockedError {
	return new EncounterLockedError(`${row.holder_name} is editing this exam. This page is read-only.`, 'locked', info(row));
}

const signedError = () => new EncounterLockedError('This exam is signed. Add an addendum instead of changing it.', 'signed');

/** Lock and signature as seen by one page (`token` may be null for a plain read). */
export function getLockState(db: DB, encounterId: number, userId: number, token: string | null, now = new Date()): LockState {
	const signature = getSignature(db, encounterId);
	const row = readLock(db, encounterId);
	if (signature) return { lock: null, mine: false, signature };
	const live = isLive(row, now);
	return { lock: live && row ? info(row) : null, mine: live && holds(row, userId, token), signature };
}

/**
 * Takes the lock when it is free (never held, released, expired) or already this page's.
 * When someone else holds a live lock nothing changes and the state says who (mine = false);
 * the page then offers an explicit takeover. Signed exams are never locked.
 */
export function acquireLock(db: DB, patientId: number, encounterId: number, userId: number, token: string | null, now = new Date()): LockState {
	requireEncounter(db, patientId, encounterId);
	const t = requireToken(token);
	db.exec('BEGIN IMMEDIATE');
	try {
		if (!isSigned(db, encounterId)) {
			const row = readLock(db, encounterId);
			if (holds(row, userId, t)) {
				db.prepare('UPDATE exam_locks SET heartbeat_at = ?, released_at = NULL WHERE encounter_id = ?').run(now.toISOString(), encounterId);
			} else if (!isLive(row, now)) {
				// Expired without a release (crashed page, sleeping laptop): taking it is logged.
				if (row && row.released_at === null) {
					audit(db, { userId, action: 'lock.expired_takeover', patientId, encounterId, detail: previous(row) }, now);
				}
				writeLock(db, encounterId, userId, t, now);
			}
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return { ...getLockState(db, encounterId, userId, t, now), findings: getFindings(db, patientId, encounterId) ?? {} };
}

const previous = (row: LockRow) => ({
	previousHolderId: row.holder_id,
	previousHolderName: row.holder_name,
	previousAcquiredAt: row.acquired_at,
	previousHeartbeatAt: row.heartbeat_at
});

/** Explicit takeover of a lock someone else holds (audited). The previous holder's next write gets 423. */
export function takeOverLock(db: DB, patientId: number, encounterId: number, userId: number, token: string | null, now = new Date()): LockState {
	requireEncounter(db, patientId, encounterId);
	const t = requireToken(token);
	db.exec('BEGIN IMMEDIATE');
	try {
		if (isSigned(db, encounterId)) throw signedError();
		const row = readLock(db, encounterId);
		if (!holds(row, userId, t)) {
			if (row && (isLive(row, now) || row.released_at === null)) {
				const action = isLive(row, now) ? 'lock.takeover' : 'lock.expired_takeover';
				audit(db, { userId, action, patientId, encounterId, detail: previous(row) }, now);
			}
			writeLock(db, encounterId, userId, t, now);
		} else {
			db.prepare('UPDATE exam_locks SET heartbeat_at = ?, released_at = NULL WHERE encounter_id = ?').run(now.toISOString(), encounterId);
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return { ...getLockState(db, encounterId, userId, t, now), findings: getFindings(db, patientId, encounterId) ?? {} };
}

/** Keeps the holder's lock alive. Anyone else gets EncounterLockedError (their page goes read-only). */
export function heartbeatLock(db: DB, patientId: number, encounterId: number, userId: number, token: string | null, now = new Date()): LockState {
	requireEncounter(db, patientId, encounterId);
	if (isSigned(db, encounterId)) throw signedError();
	const row = readLock(db, encounterId);
	if (!holds(row, userId, token)) throw notHolder(row, now);
	db.prepare('UPDATE exam_locks SET heartbeat_at = ?, released_at = NULL WHERE encounter_id = ?').run(now.toISOString(), encounterId);
	return getLockState(db, encounterId, userId, token, now);
}

/**
 * Releases the holder's lock (page hide / unload). The row keeps the holder token so a save that
 * races the release still lands; anyone may take the lock from now on. Non-holders: false.
 */
export function releaseLock(db: DB, patientId: number, encounterId: number, userId: number, token: string | null, now = new Date()): boolean {
	requireEncounter(db, patientId, encounterId);
	const row = readLock(db, encounterId);
	if (!holds(row, userId, token)) return false;
	db.prepare('UPDATE exam_locks SET released_at = ? WHERE encounter_id = ? AND token = ?').run(now.toISOString(), encounterId, token);
	return true;
}

function notHolder(row: LockRow | null, now: Date): EncounterLockedError {
	if (row && isLive(row, now)) return heldElsewhere(row);
	return new EncounterLockedError('This page does not hold the edit lock for this exam. Reload the exam to edit it.', 'locked');
}

/**
 * Throws EncounterLockedError unless this user (and this page's lock token, sent as the
 * X-Lock-Token header) may change the exam right now.
 */
export function assertEditable(db: DB, _patientId: number, encounterId: number, userId: number, lockToken: string | null, now = new Date()): void {
	if (isSigned(db, encounterId)) throw signedError();
	const row = readLock(db, encounterId);
	if (!holds(row, userId, lockToken)) throw notHolder(row, now);
}

/**
 * An abort from the signed-content triggers (migration signed_final.ts, and encounters_staff_signed):
 * the exam was signed before the write reached the database. Mapped to the same 'signed' refusal the
 * routes answer with 423; null for any other error.
 */
export function signedAbort(e: unknown): EncounterLockedError | null {
	return e instanceof Error && /signed exam:/.test(e.message) ? signedError() : null;
}

/**
 * Runs an exam write in one transaction that takes the write lock first (BEGIN IMMEDIATE) and checks
 * assertEditable inside it, so neither signing nor a lock takeover (in this process or another one)
 * can come between the check and the write. Routes call it after reading the request body: a body
 * that arrives after the exam was signed is refused (EncounterLockedError) and nothing is written.
 * Writes with their own transaction nest (savepoint). Anything thrown rolls the whole write back.
 */
export function editTransaction<T>(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	token: string | null,
	write: () => T,
	now = new Date()
): T {
	try {
		return transaction(
			db,
			() => {
				assertEditable(db, patientId, encounterId, userId, token, now);
				return write();
			},
			true
		);
	} catch (e) {
		throw signedAbort(e) ?? e;
	}
}

/** editTransaction for a route: the write's own response, or the 423 when the exam cannot be changed. */
export function editableWrite(db: DB, patientId: number, encounterId: number, userId: number, request: Request, write: () => Response): Response {
	try {
		return editTransaction(db, patientId, encounterId, userId, lockToken(request), write);
	} catch (e) {
		if (e instanceof EncounterLockedError) return lockedResponse(e);
		throw e;
	}
}

// ---------- signing ----------

/** Tables holding the Impression/Plan and orders, if the plan feature created them (queried defensively). */
function planTables(db: DB): string[] {
	const tables = db
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'plan%' OR name LIKE 'imp%' OR name LIKE 'order%') ORDER BY name`)
		.all() as { name: string }[];
	return tables
		.map((t) => t.name)
		.filter((name) => /^[A-Za-z0-9_]+$/.test(name))
		.filter((name) => (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).some((c) => c.name === 'encounter_id'));
}

/**
 * Columns added to plan tables after exams were already signed, with their default. A row holding the
 * default hashes as if the column did not exist, so an exam signed before the column existed still
 * hashes the same; a row that uses the column (an ICD-11 item, D44; a title language, D50) hashes it.
 */
const LATER_COLUMN_DEFAULTS: Record<string, unknown> = { code_system: 'icd10cm', code_uris: '', title_lang: '' };
const isLaterDefault = (k: string, v: unknown) => k in LATER_COLUMN_DEFAULTS && LATER_COLUMN_DEFAULTS[k] === v;

function canonical(v: unknown): unknown {
	if (v instanceof Uint8Array) return Buffer.from(v).toString('hex');
	if (typeof v === 'bigint') return v.toString();
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		return Object.fromEntries(
			Object.keys(v)
				.sort()
				.map((k) => [k, canonical((v as Record<string, unknown>)[k])])
		);
	}
	return Array.isArray(v) ? v.map(canonical) : v;
}

/**
 * SHA-256 (hex) of what signing locks: findings (field, value, default flag), the latest drawing id per
 * zone, and rows of any Impression/Plan / orders tables. Audit columns (updated_at/by) are left out so
 * the hash describes clinical content only; it is stable for unchanged content.
 */
export function examContentHash(db: DB, encounterId: number): string {
	const findings = (
		db.prepare('SELECT field, value, is_default FROM findings WHERE encounter_id = ? ORDER BY field').all(encounterId) as {
			field: string;
			value: string;
			is_default: number;
		}[]
	).map((r) => [r.field, r.value, r.is_default]);
	const drawings = db
		.prepare('SELECT zone, MAX(id) AS id FROM drawings WHERE encounter_id = ? GROUP BY zone ORDER BY zone')
		.all(encounterId)
		.map((r) => [(r as { zone: string }).zone, (r as { id: number }).id]);
	const plan: Record<string, unknown[]> = {};
	for (const table of planTables(db)) {
		const rows = db
			.prepare(`SELECT * FROM "${table}" WHERE encounter_id = ? ORDER BY rowid`)
			.all(encounterId)
			.map((row) => canonical(Object.fromEntries(Object.entries(row).filter(([k, v]) => !/_(at|by)$/.test(k) && !isLaterDefault(k, v)))));
		// Only tables with rows count, so the hash does not change when an empty table is added.
		if (rows.length) plan[table] = rows;
	}
	const content = JSON.stringify(canonical({ v: 1, findings, drawings, plan }));
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Signs (finalizes) the exam. Only the encounter's own provider may sign (admins and techs cannot,
 * and nobody signs for another provider). Refused while another page holds a live edit lock, so
 * nobody's unsaved typing is cut off. After signing every write is refused by assertEditable.
 */
export function signExam(db: DB, patientId: number, encounterId: number, user: SigningUser, token: string | null, now = new Date()): Signature {
	const encounter = requireEncounter(db, patientId, encounterId);
	if (user.role !== 'provider') throw new SigningError('Only a provider can sign an exam.', 403);
	if (user.id !== encounter.providerId) throw new SigningError(`Only ${encounter.provider}, the provider for this visit, can sign it.`, 403);
	db.exec('BEGIN IMMEDIATE');
	try {
		if (isSigned(db, encounterId)) throw signedError();
		const row = readLock(db, encounterId);
		if (row && isLive(row, now) && !holds(row, user.id, token)) throw heldElsewhere(row);
		const hash = examContentHash(db, encounterId);
		const at = now.toISOString();
		db.prepare('INSERT INTO exam_signatures (encounter_id, signed_by, signed_at, content_hash) VALUES (?, ?, ?, ?)').run(encounterId, user.id, at, hash);
		// The patient history as shown in this exam, so the signed report reprints it (not part of the hash,
		// so signatures made before snapshots existed keep verifying).
		snapshotHistory(db, patientId, encounterId, now);
		db.prepare('UPDATE exam_locks SET released_at = ? WHERE encounter_id = ?').run(at, encounterId);
		audit(db, { userId: user.id, action: 'exam.sign', patientId, encounterId, detail: { contentHash: hash } }, now);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return getSignature(db, encounterId)!;
}

/** Appends an addendum to a signed exam (providers and techs; never an edit of the signed content). */
export function addAddendum(db: DB, patientId: number, encounterId: number, user: SigningUser, text: unknown, now = new Date()): Signature {
	requireEncounter(db, patientId, encounterId);
	if (user.role === 'admin') throw new SigningError('Addenda are written by clinical staff.', 403);
	if (typeof text !== 'string' || !text.trim()) throw new SigningError('Write the addendum text.', 400);
	const body = text.trim();
	if (body.length > MAX_ADDENDUM_LENGTH) throw new SigningError(`An addendum is limited to ${MAX_ADDENDUM_LENGTH} characters.`, 400);
	if (!isSigned(db, encounterId)) throw new SigningError('This exam is not signed yet; change the exam itself.', 409);
	db.exec('BEGIN');
	try {
		const r = db
			.prepare('INSERT INTO exam_addenda (encounter_id, author_id, added_at, text) VALUES (?, ?, ?, ?)')
			.run(encounterId, user.id, now.toISOString(), body);
		audit(db, { userId: user.id, action: 'exam.addendum', patientId, encounterId, detail: { addendumId: Number(r.lastInsertRowid), length: body.length } }, now);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return getSignature(db, encounterId)!;
}

/** The stored content hash for a signed exam (null = not signed). */
export function getSignedHash(db: DB, encounterId: number): string | null {
	const r = db.prepare('SELECT content_hash FROM exam_signatures WHERE encounter_id = ?').get(encounterId) as { content_hash: string } | undefined;
	return r?.content_hash ?? null;
}

/** The signature for the report; null = not signed. */
export function getSignature(db: DB, encounterId: number): Signature | null {
	const s = db
		.prepare(
			`SELECT s.signed_at, u.display_name FROM exam_signatures s JOIN users u ON u.id = s.signed_by WHERE s.encounter_id = ?`
		)
		.get(encounterId) as { signed_at: string; display_name: string } | undefined;
	if (!s) return null;
	const addenda = db
		.prepare(
			`SELECT a.added_at, a.text, u.display_name FROM exam_addenda a JOIN users u ON u.id = a.author_id
			  WHERE a.encounter_id = ? ORDER BY a.id`
		)
		.all(encounterId) as { added_at: string; text: string; display_name: string }[];
	return {
		signedBy: s.display_name,
		signedAt: s.signed_at,
		addenda: addenda.map((a) => ({ by: a.display_name, at: a.added_at, text: a.text }))
	};
}
