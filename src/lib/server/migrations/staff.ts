// Who was involved in a visit: the provider who authorizes it (and signs it) and the technician who
// worked it up. Appended to db.ts MIGRATIONS after the phase 5/6 slots (decision D43).
//
// - encounters.provider_id stays the authorizing provider and must be a provider account.
// - encounters.technician_id is the technician; NULL when no technician worked on the visit.
// Visits that a technician or admin started before this column existed listed that person as the
// provider: move them to technician (admins are dropped) and give the visit the first active
// provider, so it can still be signed. Pre-release data only (D16).
// Once the exam is signed, neither can change (trigger).
export const STAFF_SQL = `
ALTER TABLE encounters ADD COLUMN technician_id INTEGER REFERENCES users(id);
UPDATE encounters
   SET technician_id = CASE WHEN (SELECT role FROM users WHERE id = encounters.provider_id) = 'tech' THEN provider_id END,
       provider_id = (SELECT id FROM users WHERE role = 'provider' AND active = 1 ORDER BY id LIMIT 1)
 WHERE (SELECT role FROM users WHERE id = encounters.provider_id) <> 'provider'
   AND EXISTS (SELECT 1 FROM users WHERE role = 'provider' AND active = 1);
CREATE INDEX encounters_technician ON encounters (technician_id);
-- The signed record names its provider and technician for good.
CREATE TRIGGER encounters_staff_signed BEFORE UPDATE OF provider_id, technician_id ON encounters
 WHEN EXISTS (SELECT 1 FROM exam_signatures WHERE encounter_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'signed exam: provider and technician are final'); END;
`;
