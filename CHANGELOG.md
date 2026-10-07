# Changelog

OpenVision follows [semantic versioning](https://semver.org/). **1.0 will follow a clinical review by a
practising eye-care professional**; until then every release is a pre-release and is not for real patient
data.

## 0.1.0 — 2026-10-07 (pre-release, not for real patient data until clinical review)

The first release. Everything below is new.

### Exam

- Sections: HPI (three complaints, elements, chronic problems from history), review of systems, vision
  (acuity, Amsler), IOP / pupils / confrontation fields, refraction (current glasses, manifest,
  cycloplegic, autorefraction, contact lens, transpose), external, slit lamp, fundus, neuro (motility,
  alternate cover test, color, stereo, NPC, amplitudes).
- Shorthand bar (`Alt+K`, e.g. `das; rc:1+ inj`), normal defaults, copy between eyes, per-provider quick
  picks, prior visits with copy forward, undo, autosave, keyboard section switching.
- Drawings: own canvas for touch and pen, versioned autosave, prior drawings.
- Impression and plan builder from exam findings and history, with orders and next visit; diagnosis codes
  from **ICD-10-CM** (FY2027) or **WHO ICD-11** (2026-01), chosen per practice.
- Billing aid only: visit and test code suggestions with their reasons, modifiers and justifiers, printed for
  the practice's own billing system; OpenVision never bills. US code suggestions can be switched off.
- Exam locking while someone edits, final electronic signing with dated addenda.

### Records and output

- Patients and visits; explicit allergy states (not recorded, no known allergies, listed); past eye and
  medical history, surgeries, medications, family and social history.
- Documents and images per patient and exam area; visual-acuity history; glaucoma flow sheet with IOP
  targets.
- Printable exam reports (one or many visits), spectacle and contact-lens Rx, **PDF**, **CSV** and
  **FHIR R4** export (impression and plan as Conditions); every print and export is audit-logged.

### Access and safety

- Sign-in with roles (admin, provider, technician), automatic logoff after inactivity, an append-only audit
  log of sign-ins, settings changes and chart views, emergency admin reset from the computer.

### Languages and code sets

- Six interface languages: English, and drafts awaiting native review in Spanish, French, Chinese
  (Simplified), Hindi and Arabic (right-to-left layout).
- Code sets are downloaded by the practice (or imported offline), checked against pinned releases; WHO
  ICD-11 titles can be added in Spanish, French, Chinese, Arabic and other languages WHO publishes.

### Windows desktop app

- Installer for Windows (Electron): runs without a browser, server inside the app on `127.0.0.1` only,
  data in `C:\ProgramData\OpenVision` restricted to the OpenVision Users group, automatic updates from
  GitHub Releases with a database backup first, Save-as-PDF, warning when the drive is not encrypted
  (BitLocker). Installers are not code-signed yet.
- Terms of Use, Privacy Policy and a data safety notice, accepted in the installer and at first-run setup.

### Found in external review and fixed before release

- A signed exam is now final in the database too: triggers refuse changes to its findings, drawings, plan,
  orders, chosen codes and visit documents.
- The server checks the signature and edit lock after a request arrives, inside the same transaction as the
  change, so a slow save cannot land after signing; a provider or technician change and its audit entry are
  saved together.
- Past-history items are never overwritten or erased: each edit or delete keeps the earlier version, and a
  deleted item is only hidden.
- Signing stores the patient history as shown in the exam; a signed report prints that history, labelled with
  the signing date.
- Every print is in the audit log as well as the print log, and the print log cannot be edited or deleted.
- Installing a newer version by hand backs up the database before upgrading it; if the backup fails, nothing
  is changed and the app does not start.
- Empty past-history categories on the report say "Not recorded", never "None".
- Signing first saves everything still open on the page and stops if anything could not be saved; plan items
  and orders save one request at a time, so the last change is the one kept.
- The installer resets old permissions on the data folder and stops if it cannot protect it.
- Old unfinished downloads in the data folder are deleted when the app starts.
- Choosing "Wait" when closing with changes still saving now really cancels the exit or restart.
- CSV and FHIR exports carry the signature and addenda, with a signed visit's allergies as recorded at
  signing; printed prescriptions and opened or downloaded documents are in the audit log, which now has
  readable labels.
- The glaucoma flow sheet's default IOP target comes from the visit's provider, not whoever is viewing, and
  says whose it is.
- Transpose refuses a blank sphere (type PLANO for zero) or a blank or invalid axis instead of guessing.
- A temporary password blocks everything except changing it, signing out and the session check.

### Known limits

- The database is not encrypted by OpenVision (planned); use BitLocker.
- Desktop menus are in English only; the Terms, Privacy Policy and notice are in English only.
