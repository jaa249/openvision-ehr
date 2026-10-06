// Schema for the coding feature, appended to db.ts MIGRATIONS in a fixed slot.
// Pre-release (decision D16): edit freely until v0.1; delete data/ to rebuild.
//
// coding_state   one row per exam: what the provider chose in the Coding panel (spec §11.1-11.3).
//                modifiers / justifiers_off / tests are JSON (validated in server/coding.ts).
// coding_lines   the lines this exam owns (§11.4 FIX: no fee sheet exists, so "Populate fee sheet"
//                became "Save coding lines"; only this exam's unbilled lines are ever added, updated or
//                removed). billed_at is for a future billing export: a billed line is never touched.
// visit_status   every status change with who and when (§11.5 adapted: no scheduler or flow board).
//                changed_by_name keeps the user's name as it was (FIX: a name, not a 0/1 flag).
export const CODING_SQL = `
CREATE TABLE coding_state (
	encounter_id INTEGER PRIMARY KEY REFERENCES encounters(id),
	family TEXT NOT NULL DEFAULT 'eye' CHECK (family IN ('eye', 'em')),
	visit_code TEXT,
	modifiers TEXT NOT NULL DEFAULT '[]',
	justifiers_off TEXT NOT NULL DEFAULT '[]',
	tests TEXT NOT NULL DEFAULT '[]',
	include_92060 INTEGER NOT NULL DEFAULT 0 CHECK (include_92060 IN (0, 1)),
	updated_at TEXT NOT NULL,
	updated_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE coding_lines (
	id INTEGER PRIMARY KEY,
	encounter_id INTEGER NOT NULL REFERENCES encounters(id),
	source TEXT NOT NULL DEFAULT 'exam',
	kind TEXT NOT NULL CHECK (kind IN ('dx', 'visit', 'sensorimotor', 'test')),
	seq INTEGER NOT NULL,
	code TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	modifiers TEXT NOT NULL DEFAULT '',
	pointers TEXT NOT NULL DEFAULT '',
	units INTEGER NOT NULL DEFAULT 1 CHECK (units BETWEEN 1 AND 99),
	billed_at TEXT,
	created_at TEXT NOT NULL,
	created_by INTEGER NOT NULL REFERENCES users(id),
	updated_at TEXT NOT NULL,
	updated_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX coding_lines_encounter ON coding_lines(encounter_id, source, seq);
CREATE TABLE visit_status (
	id INTEGER PRIMARY KEY,
	encounter_id INTEGER NOT NULL REFERENCES encounters(id),
	status TEXT NOT NULL CHECK (status IN ('in_progress', 'coding_complete', 'checked_out', 'send_notes')),
	changed_at TEXT NOT NULL,
	changed_by INTEGER NOT NULL REFERENCES users(id),
	changed_by_name TEXT NOT NULL
);
CREATE INDEX visit_status_encounter ON visit_status(encounter_id, id);
`;
