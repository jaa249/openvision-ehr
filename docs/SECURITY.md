# Security

OpenVision is meant to run as an offline desktop app on one practice computer (see [DECISIONS.md](DECISIONS.md) D41, D42). This page says what the app does to protect patient data and what the practice must do itself. It is not legal advice; each practice is responsible for its own HIPAA risk analysis.

## Current release

This is a pre-release. The database is **not encrypted yet** and the app runs as a local web server. Use fictional data only, keep the server bound to `127.0.0.1`, and do not open its port to the network.

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

Planned for the desktop installer:

- Database encrypted at rest; key protected by Windows (DPAPI) and kept in `C:\ProgramData\OpenVision`, readable only by a local "OpenVision Users" Windows group.
- A printed **recovery key**, needed to restore a backup on a different computer.
- Scheduled encrypted backups.
- Updates only from this project's GitHub Releases, signature-checked, with a backup taken before installing.

## What the practice is responsible for

- **One Windows account per person.** Never share a Windows sign-in. Anyone signed in to Windows as a member of "OpenVision Users" can reach the encrypted database file; the app's own sign-in is what separates users inside it.
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
