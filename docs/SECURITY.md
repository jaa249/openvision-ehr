# Security

OpenVision is meant to run as an offline desktop app on one practice computer (see [DECISIONS.md](DECISIONS.md) D41, D42). This page says what the app does to protect patient data and what the practice must do itself. It is not legal advice; each practice is responsible for its own HIPAA risk analysis.

## Current release

Version 0.1.0 is a pre-release: not for real patient data until a practising eye-care professional has reviewed it. It comes two ways:

- **Windows desktop app** (installer, see [DECISIONS.md](DECISIONS.md) D51). The app runs its own server inside its window, on `127.0.0.1` only, and refuses any request that does not come from its own window (a random token per launch), so other programs and browsers on the computer cannot use it. Data lives in `C:\ProgramData\OpenVision`, which the installer makes readable only by Administrators, SYSTEM and the local **OpenVision Users** group. Closing the app signs the user out. Updates come only from this project's GitHub Releases and a backup of the database is taken before each update is installed. Installers are **not code-signed yet**, so Windows SmartScreen shows a warning.
- **Browser build** (`node build`, for development and evaluation): keep it bound to `127.0.0.1` and do not open its port to the network.

**The database is not encrypted by OpenVision** (encryption at rest, D42, is postponed). Turn on **BitLocker** (full-disk encryption) on the computer: the desktop app checks the system drive and shows admins a warning in Settings when it is not encrypted. The installer and first-run setup ask the practice to accept the [Terms of Use](TERMS.md) and a short data safety notice; see also the [Privacy Policy](PRIVACY.md).

## What OpenVision does

| Safeguard | How |
|---|---|
| Unique user sign-in | Every person has their own account. Passwords are at least 12 characters, common passwords are refused, and only a salted scrypt hash is stored. |
| Roles | Admin (users, settings, audit log), provider (signs exams), technician (works up exams, cannot sign). |
| Wrong-password protection | 5 wrong tries lock that user name for a minute; the error never says whether the name exists. |
| Automatic logoff | After 15 minutes without activity (5-60, set with `OPENVISION_IDLE_MINUTES`), with a one-minute warning, and after 12 hours in any case. Unsaved exam typing is saved before logoff. |
| Audit log | Sign-ins and failures, user and settings changes, chart and exam views, signing and addenda; prints and exports are logged per visit. Entries cannot be edited or deleted. Admins read it under Settings. |
| Record integrity | A signed exam cannot be changed; corrections are dated addenda. Only one person edits an exam at a time. |
| Emergency access | `node scripts/reset-admin.mjs <admin>` gives an admin a temporary password from the computer itself, and is logged. |
| Uploads | Documents are checked by their contents (PNG, JPEG or PDF only) and limited to 15 MB. |

Planned:

- Database encrypted at rest; key protected by Windows (DPAPI) and kept in `C:\ProgramData\OpenVision` (D42, postponed).
- A printed **recovery key**, needed to restore a backup on a different computer.
- Scheduled encrypted backups (today: a backup before every update, in `C:\ProgramData\OpenVision\backups`).
- Code-signed installers.

## What the practice is responsible for

- **One Windows account per person.** Never share a Windows sign-in. Anyone signed in to Windows as a member of "OpenVision Users" (or as an administrator) can open the database file; the app's own sign-in is what separates users inside it. Add people with `net localgroup "OpenVision Users" <user name> /add` (or Computer Management › Local Users and Groups); they sign out of Windows and back in once.
- **Lock the screen** when stepping away (Windows key + L), and set Windows to lock after a few minutes idle.
- **Turn on BitLocker** (or equivalent full-disk encryption) so a stolen computer or drive is unreadable.
- **Keep Windows updated** and run its antivirus. Don't install unrelated software on the exam computer.
- **Keep the recovery key safe**, on paper, locked away and away from the computer. Without it, a backup cannot be restored on another computer.
- **Store backups securely**: encrypted, off the computer, and tested by restoring now and then.
- **Remove access promptly**: deactivate a person's OpenVision account and Windows account when they leave.
- **Review the audit log** periodically.
- **Physical security**: position screens away from patients and visitors.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue. Do not include real patient data in any report.
