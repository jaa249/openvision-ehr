# Translating OpenVision

English is the source language. Every other language starts as a **draft** and is labelled so in the
language menus ("Español (draft translation)") until a native-speaking eye-care professional has
reviewed it. Background and the rules behind them: decision D48 in [`DECISIONS.md`](DECISIONS.md).

## Where the text lives

```
src/lib/i18n/messages/<namespace>/en.json   English (the source; developers edit this)
src/lib/i18n/messages/<namespace>/es.json   Spanish (and so on, one file per language)
```

Each file is one flat JSON object. The code uses `<namespace>.<key>`, e.g. `auth.signIn` is
`"signIn"` in `messages/auth/en.json`.

## Rules for message files

- **Keys**: camelCase, letters and digits only, no dots.
- **Placeholders**: `{name}` is filled in by the app. Keep every placeholder of the English text, with
  the same name; you may move it within the sentence. Some placeholders stand for markup (a command,
  a bold name); they are placeholders all the same.
- **Plurals**: `count_one`, `count_other` (and `_zero`, `_two`, `_few`, `_many` where your language
  needs them, following the CLDR plural rules). English always has `_one` and `_other`.
- **No HTML** in any message.
- A translation may leave keys out (English is shown instead) but may not add keys English does not have.
- **Never translate**: the name OpenVision, shorthand codes, CPT and ICD codes, usernames, commands and
  file names. WHO ICD-11 titles are WHO's text and are not translated by us. Clinical text people type,
  and quick-pick and shorthand expansions, are kept exactly as entered.
- Spanish uses neutral Latin-American clinical Spanish and the "usted" form.

**Diagnosis titles come from WHO, never from us** (D44, D50). ICD-11 titles in Spanish, French, Chinese,
Arabic and other languages are WHO's official files, which a practice downloads in Settings › Code sets;
OpenVision shows and saves them unchanged and falls back to WHO's English title where WHO has none. So a
message never carries a translated diagnosis name next to a code: an example such as
`plan.newDxPlaceholderIcd11` keeps the official English title exactly ("Primary open-angle glaucoma,
unspecified 9C61.0Z&XK9J"), and only the words around it are translated. ICD-10-CM is a US code set and
stays English.

**Glossary, tips and keys** (D52, D56). Three namespaces explain the interface rather than label it:

- `glossary`: the plain name of every abbreviation the exam shows (`"ns"` is "nuclear sclerosis ..." for
  NS). Translate the explanation only; the abbreviation itself stays as written on screen. These are
  clinical definitions, so a glossary translation needs review by a clinician **and** a native speaker
  before the language is marked reviewed. `glossary.test.ts` fails when the exam shows an abbreviation
  that has no entry.
- `tips`: tooltips, the reasons a button cannot be used right now, and the first-run tour.
- `keys`: the keyboard and shorthand help sheet and the names of the shortcuts. Key names in the
  shortcuts themselves (`Alt`, `Ctrl`, `F1`) are not messages and stay as they are.

`npx vitest run src/lib/i18n` checks all of this (keys, placeholders, plurals, no HTML, every key used in
the code exists in English).

## Adding a language

1. Add an entry to `LOCALES` in `src/lib/i18n/locales.ts`:
   `{ code: 'pt', name: 'Português', dir: 'ltr', status: 'draft' }` (`name` in the language itself;
   `dir: 'rtl'` for Arabic, Hebrew, Persian or Urdu; see "Right-to-left" below).
2. Add `messages/<namespace>/pt.json` next to each `en.json` (start with `{}`; missing keys show English).
3. Run the tests above.

## Right-to-left

Arabic (and any language with `dir: 'rtl'`) mirrors the page: menus, the section list, buttons and
headings start on the right. A few things never mirror, and translators and developers should keep them so:

- **The patient's right eye (OD) is always on the viewer's left**, exactly as when facing the patient, in
  every language. Every OD | OS column grid, the drawings and their zones, the motility diagram, the cover
  test gaze grid, the Amsler and visual-field grids, the flow sheet and acuity charts (time runs left to
  right) and the Rx tables (sphere, cylinder, axis, add in the order written on a prescription) stay left to
  right. In code: put `class="eye-ltr"` on the container (from `src/lib/styles/base.css`). Row labels,
  captions and headings inside it still read right to left within their own cells; give any other label
  inside such a block `class="page-dir"`.
- **Values keep their order**: "20/40", "-2.25 +0.75 x 180", "OD → OS", codes, MRN, dates, times and phone
  numbers. Value inputs are left to right (`dir="ltr"`, or `class="num"` / `inputmode="decimal"`); free
  text boxes follow what is typed (Arabic right to left, Latin left to right). The shorthand bar is Latin
  and always left to right.
- **Printed report and Rx**: headings and labels right to left, eye grids and Rx tables as above.
- **Arrows in messages** point the reading way: "← Patients" (back) becomes "→ المرضى" in Arabic. In the
  page chrome, a directional glyph (▸ ◀ ▶ ↩) is wrapped in `<span class="flip-rtl">` instead.
- **CSS**: use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`,
  `border-inline-start`, `text-align: start | end`, `float: inline-end`); they are identical to left/right
  in a left-to-right language. Never hide something by moving it `-9999px` sideways (in right-to-left the
  page scrolls to it); clip it instead.

## From draft to reviewed

A reviewer reads the language in the running app (My settings → Language, or the Language menu on the
sign-in page for the sign-in screen itself), corrects the files, and the
entry's `status` changes from `'draft'` to `'reviewed'`. The "(draft translation)" label then disappears.

## Hosted Weblate

One Weblate component per namespace:

- File format: **i18next JSON v4**
- File mask: `src/lib/i18n/messages/<namespace>/*.json` (e.g. `src/lib/i18n/messages/auth/*.json`)
- Monolingual base language file: `src/lib/i18n/messages/<namespace>/en.json`
- Source language: English; new translations start from `{}`.
