// The print log (every print, PDF, CSV and FHIR export; spec §12.4) becomes append-only like
// audit_log (migrations/auth.ts): triggers refuse UPDATE and DELETE, so no code path and no admin can
// rewrite who printed or exported what. Each print/export is also written to audit_log, which the
// Settings audit view reads (report.ts logPrint).
export const PRINT_LOG_APPEND_ONLY_SQL = `
	CREATE TRIGGER print_log_no_update BEFORE UPDATE ON print_log
	BEGIN SELECT RAISE(ABORT, 'The print log is append-only'); END;
	CREATE TRIGGER print_log_no_delete BEFORE DELETE ON print_log
	BEGIN SELECT RAISE(ABORT, 'The print log is append-only'); END;
`;
