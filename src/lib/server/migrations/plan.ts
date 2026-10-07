// Schema for the plan feature, appended to db.ts MIGRATIONS in a fixed slot.
// Pre-release (decision D16): edit freely until v0.1; delete data/ to rebuild.
//
// - icd10 / icd10_meta: the ICD-10-CM code set, loaded on first use from the practice's downloaded file (D49) (src/lib/server/icd10.ts).
// - imp_items: the impression list, one row per item, saved BY ID (spec §10.5 FIX). No unique key on
//   title+plan: duplicates are detected in code and answered with a warning (409), never dropped silently.
// - order_options / order_options_seeded: each provider's orders list (§10.6), seeded once from
//   ORDER_SEED; the seeded marker keeps an emptied list from re-seeding.
// - visit_orders / visit_order_plan: the orders checked for one exam and its free-text plan,
//   cleared and re-inserted per exam only (§10.6 FIX, B28). Labels/CPT are copied so renaming or
//   removing a list item never rewrites a past visit.
export const PLAN_SQL = `
CREATE TABLE icd10 (
	code TEXT PRIMARY KEY,
	display TEXT NOT NULL,
	description TEXT NOT NULL,
	billable INTEGER NOT NULL DEFAULT 1
) WITHOUT ROWID;
CREATE TABLE icd10_meta (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	source TEXT NOT NULL,
	row_count INTEGER NOT NULL,
	loaded_at TEXT NOT NULL
);
CREATE TABLE imp_items (
	id INTEGER PRIMARY KEY,
	encounter_id INTEGER NOT NULL REFERENCES encounters(id),
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('free', 'finding', 'issue')),
	title TEXT NOT NULL,
	codes TEXT NOT NULL DEFAULT '',
	code_text TEXT NOT NULL DEFAULT '',
	plan TEXT NOT NULL DEFAULT '',
	link TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	created_by INTEGER NOT NULL REFERENCES users(id),
	updated_at TEXT NOT NULL,
	updated_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX imp_items_encounter ON imp_items(encounter_id, seq);
CREATE TABLE order_options (
	id INTEGER PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id),
	seq INTEGER NOT NULL,
	label TEXT NOT NULL,
	cpt TEXT NOT NULL DEFAULT ''
);
CREATE INDEX order_options_user ON order_options(user_id, seq);
CREATE TABLE order_options_seeded (
	user_id INTEGER PRIMARY KEY REFERENCES users(id),
	seeded_at TEXT NOT NULL
);
CREATE TABLE visit_orders (
	id INTEGER PRIMARY KEY,
	encounter_id INTEGER NOT NULL REFERENCES encounters(id),
	option_id INTEGER,
	priority INTEGER NOT NULL,
	label TEXT NOT NULL,
	cpt TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'pending',
	placed_on TEXT NOT NULL,
	placed_by INTEGER NOT NULL REFERENCES users(id),
	saved_at TEXT NOT NULL,
	saved_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX visit_orders_encounter ON visit_orders(encounter_id, priority);
CREATE TABLE visit_order_plan (
	encounter_id INTEGER PRIMARY KEY REFERENCES encounters(id),
	plan TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL,
	updated_by INTEGER NOT NULL REFERENCES users(id)
);
`;
