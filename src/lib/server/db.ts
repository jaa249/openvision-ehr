// SQLite storage via Node's built-in driver (no native build step, so installs stay simple).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SEED_DEFAULTS } from '#lib/exam/catalog.ts';

export type DB = DatabaseSync;

const MIGRATIONS: string[] = [
	`CREATE TABLE users (
		id INTEGER PRIMARY KEY,
		display_name TEXT NOT NULL
	);
	CREATE TABLE patients (
		id INTEGER PRIMARY KEY,
		mrn TEXT NOT NULL UNIQUE,
		legal_first TEXT NOT NULL,
		legal_last TEXT NOT NULL,
		preferred_name TEXT,
		dob TEXT NOT NULL,
		photo_url TEXT
	);
	CREATE TABLE allergies (
		id INTEGER PRIMARY KEY,
		patient_id INTEGER NOT NULL REFERENCES patients(id),
		title TEXT NOT NULL,
		reaction TEXT
	);
	CREATE TABLE encounters (
		id INTEGER PRIMARY KEY,
		patient_id INTEGER NOT NULL REFERENCES patients(id),
		provider_id INTEGER NOT NULL REFERENCES users(id),
		date TEXT NOT NULL,
		visit_type TEXT NOT NULL
	);
	CREATE INDEX encounters_patient ON encounters(patient_id, date);
	CREATE TABLE findings (
		encounter_id INTEGER NOT NULL REFERENCES encounters(id),
		field TEXT NOT NULL,
		value TEXT NOT NULL DEFAULT '',
		is_default INTEGER NOT NULL DEFAULT 0,
		updated_at TEXT NOT NULL,
		updated_by INTEGER NOT NULL REFERENCES users(id),
		PRIMARY KEY (encounter_id, field)
	);
	CREATE TABLE finding_history (
		id INTEGER PRIMARY KEY,
		encounter_id INTEGER NOT NULL,
		field TEXT NOT NULL,
		old_value TEXT,
		new_value TEXT NOT NULL,
		changed_at TEXT NOT NULL,
		changed_by INTEGER NOT NULL
	);
	CREATE TABLE user_defaults (
		user_id INTEGER NOT NULL REFERENCES users(id),
		field TEXT NOT NULL,
		value TEXT NOT NULL,
		PRIMARY KEY (user_id, field)
	);`
];

export function migrate(db: DB): void {
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
	const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
	for (let v = row.v ?? 0; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		try {
			db.exec(MIGRATIONS[v]);
			db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1);
			db.exec('COMMIT');
		} catch (e) {
			db.exec('ROLLBACK');
			throw e;
		}
	}
}

/** Fictional demo data so a fresh install has something to open. */
export function seedDemo(db: DB, today = new Date().toISOString().slice(0, 10)): void {
	const has = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
	if (has.n > 0) return;
	db.exec('BEGIN');
	db.prepare('INSERT INTO users (id, display_name) VALUES (1, ?)').run('Dr. Example');
	const p = db.prepare(
		'INSERT INTO patients (id, mrn, legal_first, legal_last, preferred_name, dob) VALUES (?, ?, ?, ?, ?, ?)'
	);
	p.run(1, '000123', 'Jordan', 'Demo', null, '1968-03-14');
	p.run(2, '000124', 'Alexandra', 'Sample', 'Alex', '1991-11-02');
	db.prepare('INSERT INTO allergies (patient_id, title, reaction) VALUES (1, ?, ?)').run('Sulfa', 'hives');
	const e = db.prepare('INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (?, ?, 1, ?, ?)');
	e.run(1, 1, today, 'Comprehensive');
	e.run(2, 2, today, 'Follow-up');
	const d = db.prepare('INSERT INTO user_defaults (user_id, field, value) VALUES (1, ?, ?)');
	for (const [field, value] of Object.entries(SEED_DEFAULTS)) d.run(field, value);
	db.exec('COMMIT');
}

export function openDatabase(path: string): DB {
	if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
	const db = new DatabaseSync(path);
	if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA busy_timeout = 5000');
	migrate(db);
	return db;
}

let instance: DB | null = null;

export function getDb(): DB {
	if (!instance) {
		instance = openDatabase(process.env.OPENVISION_DB ?? 'data/openvision.sqlite');
		seedDemo(instance);
	}
	return instance;
}
