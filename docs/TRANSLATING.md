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

`npx vitest run src/lib/i18n` checks all of this (keys, placeholders, plurals, no HTML, every key used in
the code exists in English).

## Adding a language

1. Add an entry to `LOCALES` in `src/lib/i18n/locales.ts`:
   `{ code: 'pt', name: 'Português', dir: 'ltr', status: 'draft' }` (`name` in the language itself;
   `dir: 'rtl'` for Arabic or Hebrew, which also needs a CSS check for left/right properties first).
2. Add `messages/<namespace>/pt.json` next to each `en.json` (start with `{}`; missing keys show English).
3. Run the tests above.

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
