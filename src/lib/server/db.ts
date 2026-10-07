// SQLite storage via Node's built-in driver (no native build step, so installs stay simple).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SEED_DEFAULTS } from '#lib/exam/catalog.ts';
import { PLAN_SQL } from './migrations/plan.ts';
import { CODING_SQL } from './migrations/coding.ts';
import { SIGNING_SQL } from './migrations/signing.ts';
import { AUTH_SQL } from './migrations/auth.ts';
import { DOCUMENTS_SQL } from './migrations/documents.ts';
import { STAFF_SQL } from './migrations/staff.ts';
import { CODESETS_SQL } from './migrations/codesets.ts';
import { BILLING_AID_SQL } from './migrations/billing_aid.ts';
import { DEMO_USERS, demoPasswordHash } from './auth.ts';

/** Earlier visits for the demo patient, so prior-visit review has something to show. */
const DEMO_PRIORS: { id: number; date: string; type: string; findings: Record<string, string> }[] = [
	{
		id: 3,
		date: '2024-08-02',
		type: 'Comprehensive',
		findings: {
			RUL: 'dermatochalasis',
			LUL: 'dermatochalasis',
			ODCONJ: 'quiet',
			OSCONJ: 'quiet',
			ODCORNEA: 'clear',
			OSCORNEA: 'clear',
			ODAC: 'deep and quiet',
			OSAC: 'deep and quiet',
			ODLENS: 'trace NS',
			OSLENS: 'trace NS',
			ODDISC: 'pink',
			OSDISC: 'pink',
			ODCUP: '0.4',
			OSCUP: '0.4',
			ODMACULA: 'flat',
			OSMACULA: 'flat'
		}
	},
	{
		id: 4,
		date: '2025-09-14',
		type: 'Comprehensive',
		findings: {
			RUL: 'dermatochalasis',
			LUL: 'dermatochalasis',
			ODHERTEL: '16',
			OSHERTEL: '16',
			HERTELBASE: '102',
			ODCONJ: 'quiet',
			OSCONJ: 'trace pinguecula',
			ODCORNEA: 'clear',
			OSCORNEA: 'clear',
			ODAC: 'deep and quiet',
			OSAC: 'deep and quiet',
			ODLENS: '+1 NS',
			OSLENS: '+1 NS',
			ODDISC: 'pink',
			OSDISC: 'pink',
			ODCUP: '0.45',
			OSCUP: '0.5',
			ODMACULA: 'flat',
			OSMACULA: 'few hard drusen',
			ODVESSELS: '2:3',
			OSVESSELS: '2:3',
			RETINA_COMMENTS: 'Watch OS cup; OCT RNFL next visit.'
		}
	}
];

/** Fictional history for the demo patient: [type, title, codes, begin, occurrence, reaction, comments]. */
const DEMO_ISSUES: [string, string, string, string, string, string, string][] = [
	['ALLERGY', 'Sulfa', '', '', '', 'hives', ''],
	['POH', 'Glaucoma suspect', '', '2024-08-02', '', '', 'Watch cup-to-disc ratio OS'],
	['PMH', 'Hypertension', 'I10', '2015-01-01', 'chronic', '', 'Controlled on lisinopril'],
	['PMH', 'Type 2 diabetes', 'E11.9', '2019-06-01', 'chronic', '', 'Diet controlled, last A1c 6.4'],
	['EYEMED', 'Artificial tears', '', '2025-09-14', '', '', 'Both eyes as needed'],
	['MED', 'Lisinopril', '', '2015-01-01', '', '', '10 mg daily']
];

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
	);`,
	// Quick picks, one list per provider (spec §4). Seeded from QP_SEED on first use.
	`CREATE TABLE qp_items (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		zone TEXT NOT NULL,
		row TEXT NOT NULL,
		label TEXT NOT NULL,
		text TEXT NOT NULL,
		mode TEXT NOT NULL CHECK (mode IN ('add', 'replace', 'append')),
		seq INTEGER NOT NULL
	);
	CREATE INDEX qp_items_user ON qp_items(user_id, zone, seq);`,
	// Report header (spec §13.3) and the print audit log (§12.4: printing is logged).
	`CREATE TABLE practice (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		name TEXT NOT NULL,
		address TEXT NOT NULL DEFAULT '',
		phone TEXT NOT NULL DEFAULT '',
		fax TEXT NOT NULL DEFAULT ''
	);
	INSERT INTO practice (id, name) VALUES (1, 'Your Practice Name');
	CREATE TABLE print_log (
		id INTEGER PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(id),
		encounter_id INTEGER NOT NULL REFERENCES encounters(id),
		printed_at TEXT NOT NULL
	);`,
	// The same audit log covers data exports.
	`ALTER TABLE print_log ADD COLUMN kind TEXT NOT NULL DEFAULT 'print' CHECK (kind IN ('print', 'csv', 'fhir'));`,
	// Drawings (spec §5.3 FIX): PNG, keyed by exact encounter + zone, every save kept as a new version.
	`CREATE TABLE drawings (
		id INTEGER PRIMARY KEY,
		encounter_id INTEGER NOT NULL REFERENCES encounters(id),
		zone TEXT NOT NULL,
		png BLOB NOT NULL,
		created_at TEXT NOT NULL,
		created_by INTEGER NOT NULL REFERENCES users(id)
	);
	CREATE INDEX drawings_latest ON drawings(encounter_id, zone, id);`,
	// Printed spectacle / contact lens Rx (spec §12.5 with FIXes): written on Print, print date kept,
	// values (incl. prism and ADD) as JSON keyed by eye_mag dispense column names. Soft delete records who and when.
	`CREATE TABLE rx_dispense (
		id INTEGER PRIMARY KEY,
		patient_id INTEGER NOT NULL REFERENCES patients(id),
		encounter_id INTEGER NOT NULL REFERENCES encounters(id),
		provider_id INTEGER NOT NULL REFERENCES users(id),
		printed_by INTEGER NOT NULL REFERENCES users(id),
		printed_at TEXT NOT NULL,
		refdate TEXT NOT NULL,
		expires_on TEXT NOT NULL,
		reftype TEXT NOT NULL CHECK (reftype IN ('W', 'MR', 'CR', 'AR', 'CTL')),
		rx_number INTEGER,
		rx_type TEXT NOT NULL DEFAULT '',
		rx_values TEXT NOT NULL,
		deleted_at TEXT,
		deleted_by INTEGER REFERENCES users(id)
	);
	CREATE INDEX rx_dispense_patient ON rx_dispense(patient_id, printed_at);`,
	// Patient history (spec §7.2-7.7): one issues table for POH/POS/eye meds/PMH/meds/surgery/allergies
	// (the type encodes the eye subtype, so a PMH can never overwrite a POH), versioned family/social
	// history (§7.5 FIX: every save is a new version), and the "No known allergies" confirmation
	// (who and when) so an empty list no longer reads as NKDA. Old allergy rows move into issues.
	// created_by/updated_by are NULL only for rows carried over from the old allergies table.
	`CREATE TABLE issues (
		id INTEGER PRIMARY KEY,
		patient_id INTEGER NOT NULL REFERENCES patients(id),
		type TEXT NOT NULL CHECK (type IN ('POH', 'POS', 'EYEMED', 'PMH', 'MED', 'SURG', 'ALLERGY')),
		title TEXT NOT NULL,
		codes TEXT NOT NULL DEFAULT '',
		begin_date TEXT NOT NULL DEFAULT '',
		end_date TEXT NOT NULL DEFAULT '',
		occurrence TEXT NOT NULL DEFAULT '',
		reaction TEXT NOT NULL DEFAULT '',
		outcome TEXT NOT NULL DEFAULT '',
		provider TEXT NOT NULL DEFAULT '',
		comments TEXT NOT NULL DEFAULT '',
		encounter_id INTEGER REFERENCES encounters(id),
		created_at TEXT NOT NULL,
		created_by INTEGER REFERENCES users(id),
		updated_at TEXT NOT NULL,
		updated_by INTEGER REFERENCES users(id)
	);
	CREATE INDEX issues_patient ON issues(patient_id, type);
	CREATE TABLE patient_history (
		id INTEGER PRIMARY KEY,
		patient_id INTEGER NOT NULL REFERENCES patients(id),
		kind TEXT NOT NULL CHECK (kind IN ('family', 'social')),
		data TEXT NOT NULL,
		saved_at TEXT NOT NULL,
		saved_by INTEGER NOT NULL REFERENCES users(id)
	);
	CREATE INDEX patient_history_latest ON patient_history(patient_id, kind, id);
	ALTER TABLE patients ADD COLUMN allergies_none_at TEXT;
	ALTER TABLE patients ADD COLUMN allergies_none_by INTEGER REFERENCES users(id);
	INSERT INTO issues (patient_id, type, title, reaction, created_at, updated_at)
		SELECT patient_id, 'ALLERGY', title, COALESCE(reaction, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
		  FROM allergies ORDER BY id;
	DROP TABLE allergies;`,
	// Fixed slots for the phase 5/6 features; each feature owns its file under ./migrations/.
	PLAN_SQL,
	CODING_SQL,
	SIGNING_SQL,
	AUTH_SQL,
	DOCUMENTS_SQL,
	STAFF_SQL,
	CODESETS_SQL,
	BILLING_AID_SQL
];

/** Brings the schema up to `target` (default: latest). Tests pass a lower target to check data migrations. */
export function migrate(db: DB, target = MIGRATIONS.length): void {
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
	const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
	for (let v = row.v ?? 0; v < Math.min(target, MIGRATIONS.length); v++) {
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
	// A real install sets OPENVISION_DEMO=0 before first start: no demo data, /setup creates the first admin.
	if (process.env.OPENVISION_DEMO === '0') return;
	const hash = demoPasswordHash();
	db.exec('BEGIN');
	// Demo sign-ins (password "openvision-demo"; listed on the sign-in page only while unchanged).
	// demo-provider keeps id 1: the demo encounters and history reference it.
	const u = db.prepare(
		'INSERT INTO users (id, username, display_name, role, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
	);
	for (const d of DEMO_USERS) u.run(d.id, d.username, d.displayName, d.role, hash, `${today}T08:00:00.000Z`);
	db.prepare('UPDATE practice SET name = ?, address = ?, phone = ?, fax = ? WHERE id = 1').run(
		'Example Eye Care (demo)',
		'100 Sample Street, Anytown, ST 00000',
		'(555) 010-0100',
		'(555) 010-0101'
	);
	const p = db.prepare(
		'INSERT INTO patients (id, mrn, legal_first, legal_last, preferred_name, dob) VALUES (?, ?, ?, ?, ?, ?)'
	);
	p.run(1, '000123', 'Jordan', 'Demo', null, '1968-03-14');
	p.run(2, '000124', 'Alexandra', 'Sample', 'Alex', '1991-11-02');
	const e = db.prepare('INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES (?, ?, 1, ?, ?)');
	e.run(1, 1, today, 'Comprehensive');
	e.run(2, 2, today, 'Follow-up');
	// Patient history for Jordan Demo. Alex Sample has none, so "Allergies not recorded" (amber) is demoable.
	const at = `${today}T14:00:00.000Z`;
	const iss = db.prepare(
		`INSERT INTO issues (patient_id, type, title, codes, begin_date, occurrence, reaction, comments, encounter_id, created_at, created_by, updated_at, updated_by)
		 VALUES (1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, 1)`
	);
	for (const [type, title, codes, begin, occurrence, reaction, comments] of DEMO_ISSUES) {
		iss.run(type, title, codes, begin, occurrence, reaction, comments, at, at);
	}
	const hist = db.prepare("INSERT INTO patient_history (patient_id, kind, data, saved_at, saved_by) VALUES (1, ?, ?, ?, 1)");
	hist.run('family', JSON.stringify({ glaucoma: 'mother', amd: 'negative', diabetes: 'father', htn: 'negative' }), at);
	hist.run(
		'social',
		JSON.stringify({ marital: 'married', occupation: 'teacher', tobacco_status: 'never', alcohol: '1-2 drinks a week', alcohol_status: 'current' }),
		at
	);
	const f = db.prepare(
		"INSERT INTO findings (encounter_id, field, value, is_default, updated_at, updated_by) VALUES (?, ?, ?, 0, ?, 1)"
	);
	for (const prior of DEMO_PRIORS) {
		e.run(prior.id, 1, prior.date, prior.type);
		for (const [field, value] of Object.entries(prior.findings)) f.run(prior.id, field, value, `${prior.date}T15:00:00.000Z`);
	}
	const d = db.prepare('INSERT INTO user_defaults (user_id, field, value) VALUES (?, ?, ?)');
	for (const du of DEMO_USERS) for (const [field, value] of Object.entries(SEED_DEFAULTS)) d.run(du.id, field, value);
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
