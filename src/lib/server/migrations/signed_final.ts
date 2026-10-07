// Signing is final in the database too (decision D36), appended to db.ts MIGRATIONS.
//
// Every table that holds an exam's signed content refuses INSERT, UPDATE and DELETE once the exam has
// a row in exam_signatures: findings and their change history, drawings (every version), the
// impression/plan items, the visit's orders and order plan, the chosen codes (coding_state), and
// documents tied to the visit. Patient-level documents (encounter_id NULL) stay editable, as do
// addenda (append-only on their own), the edit lock, the audit log and everything patient-level.
// The routes check inside the write's transaction (signing.ts editTransaction) and answer 423; these
// triggers are the backstop for any write that does not (a future route, a script, a bug). Every message starts with
// "signed exam:" so signing.ts can turn the abort into the same 423 (signedAbort).
//
// The SQL is built once from the table list below; like every migration it must never change once
// released (append a new migration instead).
const SIGNED_TABLES: [table: string, what: string][] = [
	['findings', 'findings'],
	['finding_history', 'finding history'],
	['drawings', 'drawings'],
	['imp_items', 'impression and plan'],
	['visit_orders', 'orders'],
	['visit_order_plan', 'orders'],
	['coding_state', 'chosen codes'],
	['documents', 'visit documents']
];

const signed = (ref: string) => `EXISTS (SELECT 1 FROM exam_signatures WHERE encounter_id = ${ref})`;

export const SIGNED_FINAL_SQL = SIGNED_TABLES.map(
	([t, what]) => `
CREATE TRIGGER ${t}_signed_insert BEFORE INSERT ON ${t}
 WHEN ${signed('NEW.encounter_id')}
BEGIN SELECT RAISE(ABORT, 'signed exam: ${what} are final'); END;
CREATE TRIGGER ${t}_signed_update BEFORE UPDATE ON ${t}
 WHEN ${signed('OLD.encounter_id')} OR ${signed('NEW.encounter_id')}
BEGIN SELECT RAISE(ABORT, 'signed exam: ${what} are final'); END;
CREATE TRIGGER ${t}_signed_delete BEFORE DELETE ON ${t}
 WHEN ${signed('OLD.encounter_id')}
BEGIN SELECT RAISE(ABORT, 'signed exam: ${what} are final'); END;`
).join('\n');
