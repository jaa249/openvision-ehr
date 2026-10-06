// Schema for the auth feature, appended to db.ts MIGRATIONS in a fixed slot.
// Pre-release (decision D16): edit freely until v0.1; delete data/ to rebuild.
//
// - users gains sign-in columns. ALTER TABLE cannot add a UNIQUE column, so uniqueness of the
//   username (case-insensitive) is a unique index. A NULL username/password = cannot sign in.
// - sessions stores only the SHA-256 of the random cookie token; times are epoch milliseconds.
// - user_prefs: per-user layout prefs (spec §1.7 FIX). Values are '1'/'0' for booleans or the
//   enum value itself, never translated words; the key whitelist lives in #lib/prefs/keys.ts.
// - visit_types replaces the old VISIT_TYPES constant (kept in patients.ts as the seed).
//   Encounters store the name as text, so renaming or hiding a type never rewrites history.
// - audit_log (created by the signing migration) is rebuilt with a nullable user_id, so a failed
//   sign-in for an unknown username can be recorded (HIPAA 164.312(b) audit controls), gains
//   user/time indexes for the admin Audit log page, and becomes append-only: triggers refuse
//   UPDATE and DELETE, so no code path (and no admin) can edit or erase the trail.
import { VISIT_TYPES } from '../patients.ts';

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

export const AUTH_SQL = `
	ALTER TABLE users ADD COLUMN username TEXT;
	ALTER TABLE users ADD COLUMN password_hash TEXT;
	ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'provider' CHECK (role IN ('admin', 'provider', 'tech'));
	ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
	ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
	ALTER TABLE users ADD COLUMN created_at TEXT;
	CREATE UNIQUE INDEX users_username ON users(username COLLATE NOCASE);
	CREATE TABLE sessions (
		token_hash TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at INTEGER NOT NULL,
		last_seen INTEGER NOT NULL
	);
	CREATE INDEX sessions_user ON sessions(user_id);
	CREATE TABLE user_prefs (
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		PRIMARY KEY (user_id, key)
	);
	CREATE TABLE visit_types (
		id INTEGER PRIMARY KEY,
		name TEXT NOT NULL COLLATE NOCASE UNIQUE,
		seq INTEGER NOT NULL,
		active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
	);
	INSERT INTO visit_types (name, seq) VALUES ${VISIT_TYPES.map((t, i) => `(${sqlString(t)}, ${i})`).join(', ')};
	CREATE TABLE audit_log_v2 (
		id INTEGER PRIMARY KEY,
		at TEXT NOT NULL,
		user_id INTEGER REFERENCES users(id),
		action TEXT NOT NULL,
		patient_id INTEGER REFERENCES patients(id),
		encounter_id INTEGER REFERENCES encounters(id),
		detail TEXT NOT NULL DEFAULT '{}'
	);
	INSERT INTO audit_log_v2 (id, at, user_id, action, patient_id, encounter_id, detail)
		SELECT id, at, user_id, action, patient_id, encounter_id, detail FROM audit_log;
	DROP TABLE audit_log;
	ALTER TABLE audit_log_v2 RENAME TO audit_log;
	CREATE INDEX audit_log_encounter ON audit_log(encounter_id, id);
	CREATE INDEX audit_log_patient ON audit_log(patient_id, id);
	CREATE INDEX audit_log_user ON audit_log(user_id, id);
	CREATE INDEX audit_log_at ON audit_log(at);
	CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
	BEGIN SELECT RAISE(ABORT, 'The audit log is append-only'); END;
	CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
	BEGIN SELECT RAISE(ABORT, 'The audit log is append-only'); END;
`;
