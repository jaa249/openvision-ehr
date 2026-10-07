# OpenVision for Windows (desktop app)

The Windows app is the same web app in an Electron window, with its server running inside the app on
`127.0.0.1` (design: [`docs/DECISIONS.md`](../docs/DECISIONS.md) D51; security: [`docs/SECURITY.md`](../docs/SECURITY.md)).

## For practices

1. Run `OpenVision-Setup.exe` as an administrator. Builds are not code-signed yet, so Windows
   SmartScreen says "Windows protected your PC": choose **More info › Run anyway** only for an installer
   downloaded from this project's GitHub Releases.
2. Read and accept the data safety notice and the Terms of Use.
3. The installer creates `C:\ProgramData\OpenVision` (database, code files, logs, backups) and a Windows
   group **OpenVision Users**, adds the Windows user who ran it, and lets only that group, Administrators
   and SYSTEM open the folder. Any other permissions on the folder or the files in it (from an earlier
   install or added by hand) are removed. If the permissions cannot be set, the installer stops with an
   error (a silent install exits with code 2 and writes the reason to `logs\install.log`).
4. Start OpenVision from the Start menu. The first start asks for the first admin account.

**Other Windows users on the same computer**: an administrator adds each one to the group, then that
person signs out of Windows and back in:

- Computer Management (`compmgmt.msc` or `lusrmgr.msc`) › Local Users and Groups › Groups › OpenVision Users › Add, or
- in an administrator command prompt: `net localgroup "OpenVision Users" <user name> /add`

Turn on **BitLocker** for the computer's drive. OpenVision's database is not encrypted by OpenVision;
admins see a warning in Settings while the drive is not encrypted.

**Updates** are checked quietly 10 seconds after start, then every 4 hours while OpenVision is open (a
clinic computer may stay on for weeks), and from Help › Check for updates (GitHub Releases only). A quiet
check is skipped while another one is running or once an update is already waiting. A downloaded
update is installed when you choose "Restart now" or when OpenVision closes, after a backup of the database
is written to `C:\ProgramData\OpenVision\backups` (the newest 5 are kept). If a window still has changes
being saved and you choose **Wait**, nothing is closed: OpenVision keeps running and the update is
installed the next time it is closed. Set `OPENVISION_UPDATES=off` to stop checking.

**Installing a newer version by hand** (running a newer `OpenVision-Setup.exe`) gets a backup too: the
first start that has to upgrade the database copies it first to
`backups\pre-migrate-v<old>-to-v<new>-<UTC time>.sqlite` (the newest 5 are kept). If that copy cannot be
written, OpenVision leaves the database as it is and shows an error instead of starting.

**Keyboard shortcuts**: Help › Keyboard shortcuts (F1) opens the list of keys and shorthand codes. It
belongs to the exam screen, so open an exam first; in the exam, `?` (outside a text box) opens it too.

**Several Windows users** on one computer share `data\tmp` (exports on their way to a Save dialog); at
start the app deletes only leftovers there that are more than 24 hours old.

**Uninstalling** keeps `C:\ProgramData\OpenVision` unless you confirm twice that it should be deleted.

## For developers

Requires Windows, Node.js 24 and the root project's dependencies.

```sh
npm install                      # root (web app)
npm --prefix desktop install     # Electron, electron-builder, electron-updater
npm run desktop:dev              # builds the web app, opens it in Electron (data in data\desktop)
npm run desktop:dist             # builds the web app and desktop\dist\OpenVision-Setup.exe
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
| `lib/` | Data folder, shell token, navigation rules, backups, log, PDF, BitLocker check, window state, shutdown ("Wait" calls a quit off) |
| `builder.config.cjs` | electron-builder settings; version from the root `package.json`; signing from env vars |
| `installer.nsh` | NSIS: data folder, OpenVision Users group, permissions, uninstall choice, acceptance page |
| `NOTICE-INSTALL.txt` | The data safety notice (installer, Help menu, first-run setup) |
| `scripts/` | Icon (`assets/icon.svg` drawn to `build/icon.png`) and plain-text legal copies for the installer |

**Code signing** (needed before a public release): set `CSC_LINK` + `CSC_KEY_PASSWORD` (a .pfx) or the
Azure Trusted Signing variables `AZURE_SIGN_ENDPOINT`, `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE`,
`AZURE_SIGN_PUBLISHER` (with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`). Nothing secret
is kept in the repo. `.github/workflows/desktop.yml` builds and uploads a draft release when a `v*` tag
is pushed.

**Releasing a version**

1. Set `version` in the root `package.json`, add a `CHANGELOG.md` entry, commit and push.
2. Tag and push the tag (`git tag -a v0.1.1 -m "OpenVision 0.1.1"` then `git push origin v0.1.1`). The
   workflow tests, builds and uploads `OpenVision-Setup.exe`, `latest.yml`, the `.blockmap` and
   `SHA256SUMS.txt` to a draft release.
3. Write the release notes on the draft (install steps, fingerprint, changelog). **Before 1.0, tick
   "Set as a pre-release"**: 0.x apps follow pre-releases, 1.0 and later follow full releases only
   (`followsPrereleases` in `lib/updates.cjs`).
4. Publish, then update the version in the README's "Download for Windows" links
   (`releases/download/v<version>/OpenVision-Setup.exe`).
