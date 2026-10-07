# OpenVision for Windows (desktop app)

The Windows app is the same web app in an Electron window, with its server running inside the app on
`127.0.0.1` (design: [`docs/DECISIONS.md`](../docs/DECISIONS.md) D51; security: [`docs/SECURITY.md`](../docs/SECURITY.md)).

## For practices

1. Run `OpenVision-Setup-<version>.exe` as an administrator. Builds are not code-signed yet, so Windows
   SmartScreen says "Windows protected your PC": choose **More info › Run anyway** only for an installer
   downloaded from this project's GitHub Releases.
2. Read and accept the data safety notice and the Terms of Use.
3. The installer creates `C:\ProgramData\OpenVision` (database, code files, logs, backups) and a Windows
   group **OpenVision Users**, adds the Windows user who ran it, and lets only that group, Administrators
   and SYSTEM open the folder.
4. Start OpenVision from the Start menu. The first start asks for the first admin account.

**Other Windows users on the same computer**: an administrator adds each one to the group, then that
person signs out of Windows and back in:

- Computer Management (`compmgmt.msc` or `lusrmgr.msc`) › Local Users and Groups › Groups › OpenVision Users › Add, or
- in an administrator command prompt: `net localgroup "OpenVision Users" <user name> /add`

Turn on **BitLocker** for the computer's drive. OpenVision's database is not encrypted by OpenVision;
admins see a warning in Settings while the drive is not encrypted.

**Updates** are checked at start and from Help › Check for updates (GitHub Releases only). A downloaded
update is installed when you choose "Restart now" or when OpenVision closes, after a backup of the database
is written to `C:\ProgramData\OpenVision\backups` (the newest 5 are kept). Set `OPENVISION_UPDATES=off`
to stop checking.

**Uninstalling** keeps `C:\ProgramData\OpenVision` unless you confirm twice that it should be deleted.

## For developers

Requires Windows, Node.js 24 and the root project's dependencies.

```sh
npm install                      # root (web app)
npm --prefix desktop install     # Electron, electron-builder, electron-updater
npm run desktop:dev              # builds the web app, opens it in Electron (data in data\desktop)
npm run desktop:dist             # builds the web app and desktop\dist\OpenVision-Setup-<version>.exe
npm --prefix desktop run pack    # the unpacked app only: desktop\dist\win-unpacked\OpenVision.exe
```

`OPENVISION_DATA_DIR=<folder>` runs the app against another data folder (tests, portable use).
`OPENVISION_DEVTOOLS=1` allows developer tools in an installed build. Unit tests for the shell's pure
parts run with the root tests (`npm test`).

| File | What it does |
|---|---|
| `main.cjs` | Start-up, window, menu, navigation rules, downloads, PDF, updates, shutdown |
| `server.cjs` | Serves `build/handler.js` with `node:http`: `start({ host, port }) → { url, close }` |
| `preload.cjs` | `window.openvisionDesktop` (the only bridge into the page) |
| `lib/` | Data folder, shell token, navigation rules, backups, log, PDF, BitLocker check, window state |
| `builder.config.cjs` | electron-builder settings; version from the root `package.json`; signing from env vars |
| `installer.nsh` | NSIS: data folder, OpenVision Users group, permissions, uninstall choice, acceptance page |
| `NOTICE-INSTALL.txt` | The data safety notice (installer, Help menu, first-run setup) |
| `scripts/` | Icon (`assets/icon.svg` drawn to `build/icon.png`) and plain-text legal copies for the installer |

**Code signing** (needed before a public release): set `CSC_LINK` + `CSC_KEY_PASSWORD` (a .pfx) or the
Azure Trusted Signing variables `AZURE_SIGN_ENDPOINT`, `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE`,
`AZURE_SIGN_PUBLISHER` (with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`). Nothing secret
is kept in the repo. `.github/workflows/desktop.yml` builds and uploads a draft release when a `v*` tag
is pushed.
