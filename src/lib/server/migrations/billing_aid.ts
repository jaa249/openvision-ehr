// OpenVision documents the encounter and is a billing aid only (decision D46): the visit status
// workflow (In progress / Coding complete / Checked out / Send notes) is gone, and so are the saved
// billing lines (coding_lines with its billed_at bookkeeping, "Save coding lines"). Appended to db.ts
// MIGRATIONS after the code-set slot. Pre-release, fictional data only (D16).
// coding_state stays: it holds the doctor's chosen codes that print on the report.
export const BILLING_AID_SQL = `
DROP TABLE IF EXISTS visit_status;
DROP TABLE IF EXISTS coding_lines;
`;
