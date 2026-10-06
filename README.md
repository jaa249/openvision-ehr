# OpenVision

A free, open-source, standalone eye exam and eye-care records app for optometrists and ophthalmologists. Fast enough for a busy clinic, light enough for an old office PC, with optional extras (AI drafting, imaging) for practices that have the hardware.

Inspired by the well-regarded OpenEMR Eye Exam form (eye_mag), rebuilt from scratch with a modern, tablet-first design.

**Status:** first working slice. The slit lamp (anterior segment) section works end to end: shorthand, normal defaults, copy between eyes, undo, autosave, and light/dark/dim-room modes. Everything else is still design and spec.

## Try it

Requires Node.js 24 or newer. Uses Node's built-in SQLite, so there is nothing native to compile.

```sh
npm install
npm run build
HOST=127.0.0.1 PORT=3000 node build    # Windows PowerShell: $env:HOST='127.0.0.1'; $env:PORT='3000'; node build
```

Open http://127.0.0.1:3000. A fresh install creates `data/openvision.sqlite` with two fictional patients. Set `OPENVISION_DB` to store the database elsewhere.

> **Not for real patients yet.** There is no sign-in in this release, so keep the server bound to `127.0.0.1`.

Development: `npm run dev`, `npm test`, `npm run check`.

In the exam: press `Alt+K` for the shorthand bar, then try `das; rc:1+ inj; lk:tr spk.a` and Enter. Keys `1`–`0` switch sections.

## Docs


- Design direction: [`docs/design/DESIGN.md`](docs/design/DESIGN.md)
- Design tokens: [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css)
- Clickable exam-screen preview: open [`docs/design/preview.html`](docs/design/preview.html) in a browser (all data fictional)

License: [Apache-2.0](LICENSE). This is a clean-room project: OpenEMR eye_mag (GPL-3) is used only as a feature reference. See [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).
