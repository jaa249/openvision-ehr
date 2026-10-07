// Schema for patient history integrity (0.1.0 review), appended to db.ts MIGRATIONS.
//
// issues            soft delete (deleted_at, deleted_by): a deleted history item stays in the table, hidden
//                   from every reader. A hard DELETE is refused, and so is any change to a deleted item.
// issue_versions    append-only: the full previous contents of an issue (JSON of the row) each time it is
//                   edited or deleted, with who and when (like family/social history, D28).
// history_snapshots append-only: the patient history as shown in the exam when it was signed (one per signed
//                   exam), so a signed report reprints the history it was signed with (D36). Exams signed
//                   before this migration have none; the report then labels the live history as such.
export const HISTORY_INTEGRITY_SQL = `
ALTER TABLE issues ADD COLUMN deleted_at TEXT;
ALTER TABLE issues ADD COLUMN deleted_by INTEGER REFERENCES users(id);
CREATE TRIGGER issues_no_delete BEFORE DELETE ON issues
BEGIN SELECT RAISE(ABORT, 'History items are never deleted; they are marked deleted'); END;
CREATE TRIGGER issues_deleted_frozen BEFORE UPDATE ON issues WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'A deleted history item cannot be changed'); END;
CREATE TABLE issue_versions (
	id INTEGER PRIMARY KEY,
	issue_id INTEGER NOT NULL REFERENCES issues(id),
	patient_id INTEGER NOT NULL REFERENCES patients(id),
	action TEXT NOT NULL CHECK (action IN ('update', 'delete')),
	changed_at TEXT NOT NULL,
	changed_by INTEGER NOT NULL REFERENCES users(id),
	data TEXT NOT NULL
);
CREATE INDEX issue_versions_issue ON issue_versions(issue_id, id);
CREATE TRIGGER issue_versions_no_update BEFORE UPDATE ON issue_versions
BEGIN SELECT RAISE(ABORT, 'History versions are append-only'); END;
CREATE TRIGGER issue_versions_no_delete BEFORE DELETE ON issue_versions
BEGIN SELECT RAISE(ABORT, 'History versions are append-only'); END;
CREATE TABLE history_snapshots (
	encounter_id INTEGER PRIMARY KEY REFERENCES encounters(id),
	patient_id INTEGER NOT NULL REFERENCES patients(id),
	taken_at TEXT NOT NULL,
	data TEXT NOT NULL
);
CREATE TRIGGER history_snapshots_no_update BEFORE UPDATE ON history_snapshots
BEGIN SELECT RAISE(ABORT, 'A signed history snapshot cannot be changed'); END;
CREATE TRIGGER history_snapshots_no_delete BEFORE DELETE ON history_snapshots
BEGIN SELECT RAISE(ABORT, 'A signed history snapshot cannot be removed'); END;
`;
