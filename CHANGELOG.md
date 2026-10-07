# Changelog

OpenVision follows [semantic versioning](https://semver.org/). **1.0 will follow a clinical review by a
practising eye-care professional**; until then every release is a pre-release and is not for real patient
data.

## 0.2.0 — 2026-10-07 (pre-release, not for real patient data until clinical review)

Accessibility and tooltips. Automated WCAG 2.2 AA checks (axe) pass on all main screens, in the light,
dark and dim-room modes and in Arabic (the project's browser test suite). Crossing the whole slit lamp page with the keyboard now
takes 45 Tab presses instead of 194 (29 within the exam itself). Decisions D52 to D56.

### Tooltips and explanations

- Every button and abbreviation explains itself: point at it, tab to it, or press and hold it on a tablet.
  Escape closes the tip. Screen readers hear the same text.
- A glossary spells out every abbreviation the exam shows (OD, NS, sc, ADD, mmHg, 920xx ...), in every
  interface language (the explanations are drafts until a clinician and a native speaker review them).
- The small codes under a row label ("RC · LC · BC") say what each code means; clicking them opens the
  shorthand help for that row.
- A button that cannot be used right now says why (for example "Nothing to undo").
- A short tour (five steps) shows a new user around their first exam. It shows once and can be skipped.

### Seeing and reading

- Text size: make text and controls up to twice as large for your own account. On a short or zoomed screen
  the exam scrolls as a whole and keeps only the shorthand bar pinned. Printouts are not affected.
- Field states are no longer shown by colour alone: a solid bar marks a default value, a dashed bar a value
  copied from a prior visit, and screen readers hear "(default)" or "(copied from <date>)".
- The section list marks each section empty, started, complete or abnormal, each with its own shape, and has
  a legend.
- Input borders are easier to see in every colour mode, and muted text in the dim-room mode; the flow sheet
  tells the OD and OS targets apart by dash length.
- Drawings show dimmer in the dark and dim-room modes but are stored and printed on white; every pencil
  colour stays visible on both.
- Shift+D turns the dim-room mode on and off. Windows high contrast mode is supported.

### Keyboard

- One Tab stop per group (section list, section and eye buttons, quick picks, modifiers, document lists);
  the arrow keys move inside it.
- Menus and dialogs follow the standard keys and return focus to where you were.
- The undo message waits while you point at it, tab to it or switch windows; Ctrl+Z (outside a text box) or
  Alt+U undoes, Alt+Shift+U moves to the message. It never covers the field you are in.
- "Skip to main content" on every page, one main heading on the exam, larger checkboxes and radio buttons.

### Shorthand

- Suggestions while you type a code or a finding, with recently used codes first and "did you mean" for typos.
  Nothing is chosen until you press the arrow keys, so Enter still saves the bar as before.
- Keyboard and shorthand help: press `?` or F1 in the exam, click the `?` on the shorthand bar, or in the
  desktop app choose Help › Keyboard shortcuts.

### Settings

- My settings has Text size, Show tooltips, Show the tour again, and Keep undo messages visible for
  (10 seconds, 30 seconds or until you close it).

### Windows desktop app

- Updates are checked 10 seconds after start and then every 4 hours while the app is open, not only at
  start; no check runs while one is already running or an update is waiting.
- Help › Keyboard shortcuts (F1).

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
