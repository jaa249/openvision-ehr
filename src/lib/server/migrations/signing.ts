// Schema for the signing feature, appended to db.ts MIGRATIONS in a fixed slot.
// Pre-release (decision D16): edit freely until v0.1; delete data/ to rebuild.
//
// exam_locks      one row per exam being edited (spec §15.1 FIX: enforced on the server).
//                 A lock is "live" while released_at is NULL and the last heartbeat is younger than
//                 the lock lifetime; otherwise anyone may take it. The holder's own token keeps
//                 working until somebody else takes the row (so a save racing the release on
//                 page hide is not lost).
// exam_signatures one row per signed exam, never updated or deleted (no unsigning, see signing.ts).
// exam_addenda    text appended after signing; append-only (triggers refuse UPDATE and DELETE).
// audit_log       who did what to which chart: lock takeovers, signing, addenda.
export const SIGNING_SQL = `
CREATE TABLE exam_locks (
	encounter_id INTEGER PRIMARY KEY REFERENCES encounters(id),
	holder_id INTEGER NOT NULL REFERENCES users(id),
	token TEXT NOT NULL,
	acquired_at TEXT NOT NULL,
	heartbeat_at TEXT NOT NULL,
	released_at TEXT
);
CREATE TABLE exam_signatures (
	encounter_id INTEGER PRIMARY KEY REFERENCES encounters(id),
	signed_by INTEGER NOT NULL REFERENCES users(id),
	signed_at TEXT NOT NULL,
	content_hash TEXT NOT NULL
);
CREATE TRIGGER exam_signatures_no_update BEFORE UPDATE ON exam_signatures
BEGIN SELECT RAISE(ABORT, 'A signature cannot be changed'); END;
CREATE TRIGGER exam_signatures_no_delete BEFORE DELETE ON exam_signatures
BEGIN SELECT RAISE(ABORT, 'A signature cannot be removed'); END;
CREATE TABLE exam_addenda (
	id INTEGER PRIMARY KEY,
	encounter_id INTEGER NOT NULL REFERENCES encounters(id),
	author_id INTEGER NOT NULL REFERENCES users(id),
	added_at TEXT NOT NULL,
	text TEXT NOT NULL
);
CREATE INDEX exam_addenda_encounter ON exam_addenda(encounter_id, id);
CREATE TRIGGER exam_addenda_no_update BEFORE UPDATE ON exam_addenda
BEGIN SELECT RAISE(ABORT, 'Addenda are append-only'); END;
CREATE TRIGGER exam_addenda_no_delete BEFORE DELETE ON exam_addenda
BEGIN SELECT RAISE(ABORT, 'Addenda are append-only'); END;
CREATE TABLE audit_log (
	id INTEGER PRIMARY KEY,
	at TEXT NOT NULL,
	user_id INTEGER NOT NULL REFERENCES users(id),
	action TEXT NOT NULL,
	patient_id INTEGER REFERENCES patients(id),
	encounter_id INTEGER REFERENCES encounters(id),
	detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_encounter ON audit_log(encounter_id, id);
CREATE INDEX audit_log_patient ON audit_log(patient_id, id);
`;
