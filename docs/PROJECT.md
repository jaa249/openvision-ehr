# OpenVision: why it exists, how it was built, and where it is going

Last updated: 2026-10-07 (version 0.1.0)

This is the story behind the code: the reasons, the process and the turning points that produced version 0.1, and
the road from here to 1.0 and beyond. The detailed, numbered decisions are in [DECISIONS.md](DECISIONS.md) (D1, D2,
...); this page links to them instead of repeating them.

---

## 1. Why OpenVision exists

**The problem.** Eye-care practices need an exam record built for how optometrists and ophthalmologists actually
work: dense, two-eye findings entered fast, drawings, refractions and prescriptions, glaucoma trends. General EHRs do
this poorly. The one free option many practices know, the eye exam form inside OpenEMR, is well liked by its users,
but it lives inside a large hospital-style system, carries known bugs, and its GPL licence and code base make it hard
to build on.

**The goal.** A free, open-source, **standalone** eye exam record that:

- matches the features eye doctors already rate highly, so switching needs no retraining (D3);
- fixes the original's known problems instead of copying them (the FIX items in `spec/BEHAVIOR.md`);
- installs on one ordinary office computer, works offline, and stays light enough for old hardware (D2, D41);
- can be used anywhere in the world, not only in the US (D44, D48, D50);
- produces a clean, complete record of the visit that can be **printed, saved as PDF or downloaded into another
  chart** (D46). It is a documentation tool and a billing aid, not a billing system.

**Who it is for.** Small and independent optometry and ophthalmology practices, including ones with no IT staff and
no budget for a commercial EHR.

---

## 2. Ground rules that shaped everything

These were set on day one and have not changed:

- **Clean room, Apache-2.0** (D1). OpenEMR's eye form (GPL-3) and the EyeDraw library (AGPL) were used only to learn
  *what* the features are. Their code, prose and data were never copied. A git-ignored extraction of the original's
  lists stays local. The project can therefore use the permissive Apache licence, which any practice or company can
  adopt.
- **Fictional data only** during development. No real patient data ever enters the repository, tests or screenshots.
- **Lightweight**: no runtime dependencies in the web app, no bundled AI (an optional download later, D8), no PDF
  engine (D17), our own drawing component (D24), our own translation code (D48) and our own zip reader (D49).
- **Nothing implied**: the record says only what was recorded. Untested means "Not recorded", not "normal" (D27,
  D29).
- **The doctor decides**: code suggestions always show their reasons and are never applied on their own (D7, D34).

---

## 3. How it was built

**Spec first.** The project started as a written specification, not code: a behaviour spec of the original's
features with each bug tagged FIX (`docs/spec/BEHAVIOR.md`), generated field and shorthand references, and a design
direction for a tablet-first, keyboard-plus-touch interface (`docs/design/`).

**Thin slices, then phases.** The first working slice was one exam section end to end: slit lamp, with shorthand,
autosave and ownership checks (D12). That proved the stack and patterns before the app widened, in phases:

| Phase | What was added | Decisions |
|---|---|---|
| 1 | Slit lamp slice: shorthand bar, autosave | D11, D12 |
| 2 | External and fundus sections, quick picks, prior visits with copy forward | D13-D15 |
| Print/export | Printed report, mass print, CSV and FHIR export | D17-D20 |
| 3 | Patients and visits, vision, IOP/pupils, refraction and Rx, drawings | D21-D26 |
| 4 | Past history, HPI and review of systems, neuro | D27-D31 |
| 5-6 | Impression/plan, coding, signing, sign-in and roles, settings, documents, flow sheets | D32-D40 |
| Packaging plan | Offline desktop app, encryption plan | D41, D42 |
| Owner reviews | Provider and technician, ICD-11, billing aid only | D43-D47 |
| International | Six languages, right-to-left, code sets by download, WHO titles per language | D48-D50 |
| Desktop | Windows app, installer, updates, Terms and Privacy | D51 |

**Who did what.** OpenVision was designed and directed by its owner, Jamal (GitHub `jaa249`), and written by AI coding
agents (Claude Code) working under that direction. The owner set the product goals, the system's shape and its
constraints, and made every product decision; the reasons recorded in DECISIONS.md are theirs. The agents wrote the code,
tests and drafts within those boundaries. Section 4 describes the method.

**How quality is checked.**

- About 700 unit tests (Vitest) cover the server, the exam logic, coding rules, code sets, translations and security
  checks; the type checker must report zero errors and warnings.
- Nine browser test suites (about 180 checks) click through real flows: sign-in, exams, signing, printing, exports,
  technician and provider roles, ICD-11.
- Every change to user-visible English is checked against those suites, so translations and refactors cannot quietly
  change what a user sees.
- Exported FHIR was validated with the HL7 validator (D20).
- Security work follows the HIPAA Security Rule's technical safeguards and NIST password guidance (D37).

---

## 4. How the AI work was directed

OpenVision is also a working example of building real software by **directing AI agents with deliberate system
design**: the human owns the architecture, constraints and judgement, and the agents do the volume of implementation.
In about two days of directed work it went from a written spec to a tested, installable desktop application with six
languages. The method:

- **Constraints before code.** The licence boundary (clean room, D1), the data rule (fictional only), the dependency
  budget (none at runtime) and the deployment model (offline, one computer, D41) were fixed first. Every agent task
  carried them, so speed never came at the cost of a licence, privacy or security mistake.
- **Decisions in writing.** Each product or design choice went into the numbered decision log with its reason before or
  as it was built (D1-D51). The log is the project's memory: agents read it before working, and new choices are
  checked against it for contradictions.
- **A spec and tests for every task.** For each piece of work, a lead agent wrote a specification (scope, rules, file
  boundaries, acceptance checks) and the tests first; builder agents implemented against them. The owner reviewed
  outcomes and changed direction at the product level ("billing aid, not billing"; "don't translate the ICDs").
- **Architecture that allows parallel work.** Section modules (D21), per-area message files (D48) and the
  in-process server module (D51) were designed so several agents could build at once without editing the same files.
  The translation of every screen, for example, ran as five parallel extraction tasks and then one task per
  language.
- **Verification gates, never trust.** Nothing was committed until the lead had re-run the unit tests, the type
  checker, the build and the browser suites, and checked the work itself (screenshots, smoke tests, a second look at
  anything an agent flagged as uncertain).
- **Honest edges.** Uncertain work is labelled as such: drafted translations are marked as drafts, code suggestions
  are advisory pending a coder's review, and version 1.0 waits for a clinician's sign-off. AI output is treated as a
  draft until a qualified person approves it.

---

## 5. The turning points

Most of the shape of 0.1 came from a handful of owner decisions. In order:

1. **Parity first, but fix the bugs** (D3). Users like the original, so features and shortcuts match it closely;
   where it silently loses data or implies findings, OpenVision does the safe thing instead (D5, D11, D15, D27, D29,
   D31, D35, D36).
2. **An offline app on one computer, not a web service** (D41). No server to run and no patient data leaving the
   office. This made sign-in, idle logoff and the audit log matter (several staff share one computer), and led to the
   desktop packaging.
3. **Both the provider and the technician on every visit** (D43): when a provider authorizes work a technician
   performs, the record must say who each one is.
4. **Usable outside the US** (D44): the practice chooses ICD-10-CM or WHO ICD-11. ICD-11 is used exactly as WHO
   publishes it: no crosswalk, no home-made code table, no translation of WHO titles.
5. **Documentation, not billing** (D46): OpenVision produces the encounter to print or add to another chart, and helps
   with coding, but never generates bills. The superbill and visit-status workflow were removed; FHIR export gained
   the diagnoses (D47).
6. **Other languages** (D48): the owner speaks English only, so English is the source and every other language is a
   labelled draft until a native-speaking eye-care professional reviews it. Arabic brought right-to-left layout, with
   one firm rule: the patient's right eye stays on the viewer's left in every language.
7. **Don't ship the code data** (D49): each practice downloads only the code sets it needs, from CMS or WHO (or
   imports them offline), checked against pinned fingerprints.
8. **Don't translate the ICDs** (D50): official translations were expected to exist, and they did. WHO publishes
   ICD-11 titles in 14 more languages; OpenVision loads those instead.
9. **Encryption postponed; responsibility made explicit**. Encrypting the database was researched and is feasible
   (see the roadmap), but the owner chose to rely on the computer's full-disk encryption for now, and to state the
   practice's responsibilities plainly: a data-safety notice in the installer, a Terms of Use and a Privacy Policy
   ([TERMS.md](TERMS.md), [PRIVACY.md](PRIVACY.md)), and a warning when BitLocker is off.
10. **Version numbers**: this desktop build is **0.1**. Version **1.0** comes only after a practising eye doctor
    reviews the app and signs off on it.

Two things the owner chose *not* to do: a fax and task manager (D40; practices use fax services, and a one-computer
app has no one to send tasks to), and globally unique FHIR ids across clinics (OpenVision sends what it has; the
receiving system does its own matching).

---

## 5a. Pushbacks: where the owner overruled or redirected the AI

Directing AI well means knowing when to say no. These are the moments the owner rejected or reshaped what the agents
proposed, and what each one changed.

- **Name both people on the visit.** The first design let a technician-started visit list the technician as its
  provider, which left nobody able to sign it. The owner's position: when a provider authorizes work that a
  technician performs, the record must show who each one is. Every visit now records both, and only the provider
  signs (D43).
- **Document the encounter; don't run billing.** The agents had built a superbill, a visit-status workflow and saved
  billing lines. The owner cut all three: OpenVision's job is to produce an encounter that can be printed or added to
  another chart, and to help with coding, never to generate bills. The FHIR export gained the diagnoses instead
  (D46, D47).
- **Don't ship data the practice may never use.** The code files were bundled inside the app. The owner had them
  removed: each practice downloads only the code sets it needs, straight from the publisher, or imports them
  offline (D49).
- **Never translate the diagnosis codes.** When drafts in other languages translated example diagnosis titles, the
  owner stopped it and suspected official translations already existed. They did: WHO publishes ICD-11 in 14 more
  languages, and OpenVision now loads those (D50).
- **Right-size the security work.** A full database-encryption phase was researched and ready. The owner chose to
  rely on full-disk encryption as the baseline and make the practice's responsibilities explicit instead: a
  data-safety notice in the installer, a Terms of Use, a Privacy Policy and a warning when BitLocker is off.
- **Send what we have; let the receiving system match it.** A proposal to make FHIR ids globally unique across
  clinics was declined as solving another system's problem. Exports keep their local ids.
- **Know the cost before committing.** Before choosing whether tablets could connect over the clinic network, the
  owner asked what it would really take to set up. The answer led to a phased plan: one computer now, built so
  network access becomes a single switch later (D51).

The owner also caught problems by using the app rather than reading code: the Download menu falling off the screen on
a tablet in portrait (now one shared placement helper keeps every menu on screen), no way to sign out from inside an
exam (Sign out added to the exam banner), and no way to choose a language before signing in (a language menu on the
sign-in page).

## 5b. Breakthroughs

Moments where a problem that looked like a trade-off turned out to have a clean answer:

- **ICD-11 without a crosswalk.** WHO's licence forbids derivatives, so OpenVision cannot map its findings to ICD-11
  with a home-made table. Searching WHO's own titles with the finding's words found codes for 65 of 114 exam terms.
  Adding the owner-approved plain words for the broader condition ("nuclear sclerosis" is an "age-related cataract"),
  plus a few more WHO chapters, raised it to **109 of 114**, still picking only WHO's codes from WHO's titles (D44).
- **Official translations already existed.** Instead of translating ICD-11 (which the licence would not allow), a
  check of WHO's release server found the same release in **14 more languages**, with the same 35,664 codes and links
  as English (D50).
- **Six languages without a library.** About 150 lines of our own translation code replaced a framework. Then about
  1,800 interface messages were moved into message files by five agents in parallel, and drafted into five languages
  in a day, while the browser suites proved English did not change by a single character (D48).
- **Right-to-left without mirroring the eyes.** Arabic needed the page mirrored but not the clinical layouts. One rule
  (the patient's right eye stays on the viewer's left in every language) plus CSS logical properties did both. The
  audit also found two hidden bugs that affected English too (D48).
- **No database engine change for the desktop app.** Electron 44 ships the same Node version whose built-in SQLite
  the app already uses, so the web app became a desktop app without rewriting its data layer (D51).
- **Encryption is a small change when it is wanted.** The research showed an SQLCipher-compatible library can sit
  behind a 60-line adapter, leaving all 327 database calls untouched (roadmap).

---

## 6. What version 0.1 is

A pre-release for evaluation with fictional data. It contains:

- **The exam**: HPI and review of systems, past history, vision and acuity history, refraction and prescriptions,
  IOP and pupils with targets, external, slit lamp, fundus, neuro and cover test, drawings, impression and plan with
  orders, and US code suggestions (optional). Shorthand entry, quick picks, prior visits with copy forward, autosave,
  one editor at a time, signing with addenda.
- **Patients and records**: patient chart, visit lists, documents and images, glaucoma and acuity flow sheets.
- **Output**: printed report, PDF, mass print, CSV and FHIR R4 export with diagnoses.
- **Codes**: ICD-10-CM or WHO ICD-11, downloaded by the practice; WHO titles in the user's language where WHO
  publishes them.
- **Languages**: English plus draft Spanish, French, Simplified Chinese, Hindi and Arabic (right-to-left).
- **Security**: personal accounts with roles, lockout, idle logoff, append-only audit log, emergency admin reset,
  BitLocker warning, Terms of Use and Privacy Policy.
- **Desktop**: a Windows app with its own window and installer, data in `C:\ProgramData\OpenVision`, updates from
  GitHub with a backup before each update.

**Known limits of 0.1**

- Not reviewed yet by a practising eye doctor (the 1.0 gate), by a medical coder (D7, D34), or by native speakers of
  the drafted languages.
- The database is not encrypted by OpenVision; full-disk encryption is the practice's job.
- The installer is not code-signed yet, so Windows SmartScreen warns on install.
- One computer only; tablets and other PCs cannot connect yet.
- Some English remains in server messages and a few places; diagnosis search is English for ICD-10-CM.

---

## 7. Roadmap

### Before 1.0 (the sign-off gate)

1. **Clinical review** by a practising optometrist or ophthalmologist: walk through real-world (fictional-patient)
   visits, list what is wrong or missing, fix it, and get written sign-off. This is the definition of 1.0.
2. **Coder review** of the coding rules (D7, D34) before any code is filled in automatically.
3. **First public release**: code-signing certificate (e.g. Azure Trusted Signing), a signed installer on GitHub
   Releases, auto-update tested end to end, the git history cleaned of the formerly committed code files.
4. **Legal review** of the Terms of Use and Privacy Policy (indemnity, governing law).
5. **Printed medication prescription**: generic name, strength, eye, directions, refills, from an editable eye-drop
   starter list; print only, no e-prescribing.
6. Small follow-ups already noted: panels that fully honour read-only mode, "glaucoma suspect" search in ICD-10-CM,
   the remaining English server messages, merging duplicate generic message keys.

### After 1.0

- **Clinic network** ("Allow other devices"): the main computer serves tablets and other PCs over the clinic network
  with a clinic certificate, QR-code pairing, a fixed `openvision.local` name and a device list (the server is already
  built for it, D51).
- **Database encryption** (D42 phase B): researched and tested. Plan: an SQLCipher-compatible SQLite library behind a
  small adapter (no other code changes), key protected by Windows at machine scope, printed recovery key, encrypted
  backups, one-time migration of existing databases.
- **Scheduled encrypted backups** with restore testing, not only the pre-update backup.
- **Translation reviews** through Hosted Weblate; promote reviewed languages from "draft"; more languages (Portuguese,
  Russian and others WHO already publishes ICD-11 titles for).
- **Practice settings for international use**: visual-acuity notation (20/20 or 6/6) and paper size (Letter or A4).
- **Clinical vocabulary in other languages**: quick picks and shorthand expansions per language, a separate decision
  because they become the legal record.
- **National ICD-10 editions** (France CIM-10, Germany ICD-10-GM, PAHO CIE-10) as further downloadable code sets,
  each under its own licence.
- **Richer FHIR**: findings mapped to SNOMED CT and LOINC, orders and next visit as a CarePlan.
- **Equipment import**, starting with Topcon (order still open).
- **Optional AI pack** (D8): a downloadable, hardware-checked add-on (for example dictation), never part of the base
  install.
- **macOS and Linux** installers, if practices ask for them.

---

## 8. Where to read more

- [DECISIONS.md](DECISIONS.md): every decision with its reason.
- [SECURITY.md](SECURITY.md): what the app protects and what the practice must do.
- [TERMS.md](TERMS.md) and [PRIVACY.md](PRIVACY.md).
- [TRANSLATING.md](TRANSLATING.md): how languages work and how to help.
- [design/DESIGN.md](design/DESIGN.md) and [spec/BEHAVIOR.md](spec/BEHAVIOR.md): the design direction and the feature
  spec.
- [../CHANGELOG.md](../CHANGELOG.md): what changed in each version.
