# OpenVision Privacy Policy

Last updated: 2026-10-07

**Short version: OpenVision keeps everything on your computer. The authors never receive your patient data or
information about how you use the app.**

This policy explains what the OpenVision software does with information. "The authors" means the people who write
and publish OpenVision. "You" means the practice or person using it.

## 1. Patient data stays with you

- Everything you enter in OpenVision (patients, exams, drawings, documents, users, audit log) is stored in a database
  on your own computer. In the Windows app it lives in `C:\ProgramData\OpenVision`, together with the app's logs
  (which never contain patient data) and the backups taken before each update. Each Windows user also has a small
  `%APPDATA%\OpenVision` folder with the window position and the app's browser-engine cache; the sign-in cookie in it
  is cleared whenever the app closes.
- OpenVision has no cloud service, no accounts with the authors, and no way for the authors to reach your computer or
  your data.
- You are the controller (or covered entity) for that data and decide how it is used, shared, kept and deleted, under
  the laws that apply to you. See the [Terms of Use](TERMS.md).

## 2. No telemetry

OpenVision does not collect analytics, crash reports, usage statistics, advertising identifiers or location. It sends
nothing about you or your patients to the authors.

## 3. When OpenVision connects to the internet

The app works offline. It connects to the internet only in these cases, and never sends patient data in them:

| When | Where | What is sent |
|---|---|---|
| Checking for and downloading updates (at start and from Help > Check for updates) | GitHub (github.com and its download servers) | A normal web request: your computer's IP address, the app version and operating system in the request headers. GitHub's own privacy statement applies to that request. |
| An admin downloads a diagnosis code set (Settings > Code sets) | CMS (www.cms.gov) for ICD-10-CM; WHO (icdcdn.who.int) for ICD-11 | A normal web request for the published file. The publishers' privacy terms apply. |
| You click a help link (for example to Microsoft's BitLocker help) | That website, in your normal web browser | Whatever your browser sends to any website. |

Admins can avoid code-set downloads entirely by importing the official files from a USB stick.

## 4. Exports you make

When you print, save a PDF, export CSV or FHIR files, or send a record to someone else, that copy leaves OpenVision's
protection. Handling those copies is your responsibility. Every print and export is recorded in the audit log.

## 5. Support requests

If you contact the authors (for example by opening an issue on GitHub), only what you choose to send is shared, under
GitHub's terms. **Never include patient data** in issues, emails or screenshots.

## 6. Children's information, cookies and the like

OpenVision has no website accounts and no cookies other than the sign-in and language cookies it uses on your own
computer to keep you signed in and remember your language. They never leave your computer.

## 7. Changes

If OpenVision ever starts to connect to anything not listed above, this policy will be updated first and the change
will be listed in the release notes.

## 8. Contact

Questions about this policy: open an issue on the project's GitHub page
(https://github.com/jaa249/openvision-ehr). Do not include patient data.
