# Contributing

## Clean-room rule (please read)

This project is Apache-2.0. It reproduces the *features* of OpenEMR's Eye Exam form (eye_mag), which is GPL-3. Features and behavior can be reimplemented freely; GPL **code and creative text cannot be copied** into this repository.

- Do **not** paste, translate, or closely paraphrase eye_mag (or OpenEyes/EyeDraw, AGPL) source code.
- Implement from the spec in [`docs/spec/`](docs/spec/), not from the original source.
- Field names, shorthand codes, and short clinical terms (e.g. "trace SPK", "1+ NS") are functional facts and may be used.
- **Seed data:** [`docs/spec/LISTS.md`](docs/spec/LISTS.md) is a reference extract. Before shipping seed data, rewrite any descriptive prose (e.g. lens material descriptions) in our own words; keep only factual values and codes.
- When unsure, open an issue before writing the code.

## Patient data

Never commit real patient information. All examples, fixtures, screenshots and tests use fictional data.
