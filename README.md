# OpenVision

A free, open-source, standalone eye exam and eye-care records app for optometrists and ophthalmologists. Fast enough for a busy clinic, light enough for an old office PC, with optional extras (AI drafting, imaging) for practices that have the hardware.

Inspired by the well-regarded OpenEMR Eye Exam form (eye_mag), rebuilt from scratch with a modern, tablet-first design.

**Status:** early. Patients and visits (create, search, chart, new visit). Allergies are explicit: "not recorded", "no known allergies" (who confirmed and when) or a list. Past history: eye and medical problems, surgeries, eye and other medications, allergies, family and social history, with an editor, summary and shorthand (`poh:dry eye; all:penicillin rash`). Exam: HPI (three complaints, elements, chronic problems fed from history, Limited/Detailed hint), review of systems, vision (acuity, Amsler), IOP / pupils / confrontation fields, refraction (current glasses, manifest, cycloplegic, autorefraction, contact lens, transpose) with printable spectacle and contact-lens Rx and dispensed history, external, slit lamp, fundus, neuro (motility, alternate cover test with builder, color, stereo, NPC, amplitudes), and drawings (own canvas, touch and pen, versioned autosave, prior drawings). Shorthand, normal defaults, copy between eyes, per-provider quick picks, prior visits with copy forward, undo, autosave. Printable exam reports (one or many visits; Save as PDF), CSV and FHIR R4 export (with the impression/plan as Conditions), a Download menu in the exam (PDF or FHIR, to add the visit to another chart), light/dark/dim-room modes. Impression/plan builder (from exam findings and history, ICD-10-CM FY2027 or WHO ICD-11 code search, chosen per practice, orders and next visit), code suggestions as a billing aid only, never bills (eye-visit or office-visit codes with their reasons, modifiers, justifiers, tests performed; chosen codes print on the report for your billing system; US code suggestions can be switched off), exam locking while someone edits, final electronic signing with addenda. Sign-in with roles (admin, provider, technician), automatic logoff, an audit log of sign-ins and chart views, practice settings, users, per-user preferences and quick-pick editing. Documents and images per patient and exam area, visual-acuity history and a glaucoma flow sheet with IOP targets. Still to come: the desktop installer (encrypted database, automatic updates), see [`docs/SECURITY.md`](docs/SECURITY.md).

## Try it

Requires Node.js 24 or newer. Uses Node's built-in SQLite, so there is nothing native to compile.

```sh
npm install
npm run build
HOST=127.0.0.1 PORT=3000 BODY_SIZE_LIMIT=20M node build    # PowerShell: $env:HOST='127.0.0.1'; $env:PORT='3000'; $env:BODY_SIZE_LIMIT='20M'; node build
```

Open http://127.0.0.1:3000. A fresh install creates `data/openvision.sqlite` with two fictional patients and three demo accounts, all with the password `openvision-demo`: `demo-provider`, `demo-tech` and `demo-admin`. Set `OPENVISION_DB` to store the database elsewhere. Set `OPENVISION_DEMO=0` before the first start for an empty install; the first visit then asks you to create the admin account. Locked out? `node scripts/reset-admin.mjs <admin username>` on the server gives an admin a temporary password. Diagnosis codes are not part of the package: an admin downloads the practice's code set (ICD-10-CM or WHO ICD-11) in Settings › Code sets, or imports the official file on a computer without internet (see [`codes/README.md`](codes/README.md)).

> **Not for real patients yet.** The database is not encrypted until the desktop installer ships. Keep the server bound to `127.0.0.1`, and read [`docs/SECURITY.md`](docs/SECURITY.md).

Development: `npm run codes:fetch` (once, downloads the diagnosis code sets into the git-ignored `codes/`), then `npm run dev`, `npm test`, `npm run check`.

In the exam: press `Alt+K` for the shorthand bar, then try `das; rc:1+ inj; lk:tr spk.a` and Enter. Keys `1`–`0` switch sections (`5` External, `6` Slit lamp, `7` Fundus). The **Quick picks** and **Prior visits** buttons open a helper panel; the demo patient Jordan Demo has two earlier visits to copy from. **Print** (or `Ctrl+P`) in the exam prints the report; **All encounters & printing** on the home page prints or exports many visits at once: **CSV** (one row per visit, for spreadsheets) or **FHIR R4** (a Bundle of Patient, Encounter, AllergyIntolerance and Observation resources, for other EHR systems).

## Docs

- Security and what the clinic is responsible for: [`docs/SECURITY.md`](docs/SECURITY.md)
- Design direction: [`docs/design/DESIGN.md`](docs/design/DESIGN.md)
- Design tokens: [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css)
- Clickable exam-screen preview: open [`docs/design/preview.html`](docs/design/preview.html) in a browser (all data fictional)

License: [Apache-2.0](LICENSE). This is a clean-room project: OpenEMR eye_mag (GPL-3) is used only as a feature reference. See [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).
