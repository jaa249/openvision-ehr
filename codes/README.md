# Code sets

OpenVision ships **no diagnosis code files** (decision D49 in [`docs/DECISIONS.md`](../docs/DECISIONS.md)). Each practice downloads the code set it uses, and nothing else is stored.

## For a practice

An admin opens **Settings › Code sets** and presses **Download** next to the code set the practice uses (ICD-10-CM or ICD-11, chosen at setup or in Settings › Practice). The server fetches the official file, checks that it is exactly the expected release (SHA-256), keeps the code text gzip-compressed and otherwise unchanged in its code folder, and loads it. It takes a few seconds.

**No internet on the server?** Download the official zip on another computer (the link is on the Code sets page and below), bring it on a USB stick and use **Import file…**. The zip itself, or the text file inside it, is accepted; it gets the same check. Start the server with `BODY_SIZE_LIMIT=20M` so it accepts the upload.

Until the code set is downloaded, the code finder says "Diagnosis codes are not downloaded yet", typed codes are not saved and the findings engine suggests no codes; everything else works. **Remove** deletes a set's codes (not the set the practice uses). Diagnoses already saved keep their code and text (and, for ICD-11, the WHO URI) whatever happens here. Download, import and remove are admin only and audited (`settings.codes`).

Where the files go: `OPENVISION_CODES_DIR` when set, else a `codes` folder next to the database (`OPENVISION_DB`; default `data/codes`).

## Releases

| Set | Release | Official file | Entry | Publisher, licence |
|---|---|---|---|---|
| ICD-10-CM | FY2027 (dates of service from 2026-10-01) | https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip | `Code Descriptions/icd10cm_codes_2027.txt` | CMS and NCHS, public domain |
| ICD-11 MMS, English | 2026-01 | https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-en.zip | `SimpleTabulation-ICD-11-MMS-en.txt` | WHO, CC BY-ND 3.0 IGO |

The pinned SHA-256 values are in [`src/lib/codesets/releases.ts`](../src/lib/codesets/releases.ts).

## ICD-11 titles in other languages (D50)

WHO publishes the same ICD-11 MMS 2026-01 release with official titles in other languages. An admin downloads the ones the staff use under **Settings › Code sets › ICD-11 › Languages** (Download, Import file…, Remove; same checks, same audit as a code set). The code finder then searches and shows WHO's titles in each user's interface language, and ICD-11 diagnoses are saved with the title in the saving user's language (and that language). English is always needed: it is the ICD-11 set itself and the findings engine searches it. Codes WHO has not translated show in English. **OpenVision never translates a title.**

| Language | Official file | Entry | SHA-256 (start; full value in releases.ts) | Serves |
|---|---|---|---|---|
| Spanish (`es`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-es.zip` | `SimpleTabulation-ICD-11-MMS-es.txt` | `fecec2e898e9…` | Español interface |
| French (`fr`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-fr.zip` | `SimpleTabulation-ICD-11-MMS-fr.txt` | `a517d9b79a00…` | Français interface |
| Chinese (`zh`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-zh.zip` | `SimpleTabulation-ICD-11-MMS-zh.txt` | `aa30ced6e8d0…` | 简体中文 interface |
| Arabic (`ar`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-ar.zip` | `SimpleTabulation-ICD-11-MMS-ar.txt` | `62f8b56774fb…` | العربية interface |
| Russian (`ru`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-ru.zip` | `SimpleTabulation-ICD-11-MMS-ru.txt` | `94e4bf055d85…` | later |
| Portuguese (`pt`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-pt.zip` | `SimpleTabulation-ICD-11-MMS-pt.txt` | `bcfd1b3fa54a…` | later |
| German (`de`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-de.zip` | `SimpleTabulation-ICD-11-MMS-de.txt` | `2885f5f298f6…` | later; WHO: pre-release |
| Turkish (`tr`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-tr.zip` | `SimpleTabulation-ICD-11-MMS-tr.txt` | `270b5c110e0e…` | later |
| Uzbek (`uz`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-uz.zip` | `SimpleTabulation-ICD-11-MMS-uz.txt` | `f4d94db46a77…` | later |
| Czech (`cs`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-cs.zip` | `SimpleTabulation-ICD-11-MMS-cs.txt` | `e5e4e6254d44…` | later |
| Kazakh (`kk`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-kk.zip` | `SimpleTabulation-ICD-11-MMS-kk.txt` | `08d776fb28e8…` | later |
| Swedish (`sv`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-sv.zip` | `SimpleTabulation-ICD-11-MMS-sv.txt` | `6544c71bb187…` | later |
| Slovak (`sk`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-sk.zip` | `SimpleTabulation-ICD-11-MMS-sk.txt` | `47128c41e15a…` | later |
| Latin (`la`) | `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-la.zip` | `SimpleTabulation-ICD-11-MMS-la.txt` | `d0f0129e8275…` | later; titles only |

There is no Hindi file (nor Italian, Japanese or Korean; checked 2026-10-07), so Hindi users see English titles. Every language file has the same codes and URIs as English (checked by script and by `src/lib/server/icd11_titles.test.ts` for the files in this folder).

**Citation and licence for every language**: International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019 https://icd.who.int, CC BY-ND 3.0 IGO. Each zip's `readme.txt` is the same column description in every language and names no translator or co-publisher, and WHO's release page names none either, so WHO's own citation is the citation for each language; the code finder and the printed report add "titles from WHO's official <language> release" when a non-English title is shown. WHO lists German as a pre-release (BfArM, which prepared it, publishes this first version for viewing) and Latin as titles only.

ICD-10-CM stays English (a US code set). Other national ICD-10 editions (France CIM-10, Germany ICD-10-GM, PAHO CIE-10) are separate code sets with their own licences and are not offered.

**ICD-11** is WHO's: International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019 https://icd.who.int. Licence CC BY-ND 3.0 IGO with WHO's ICD-11 licence terms. OpenVision never redistributes WHO's file: each practice downloads it from WHO. It reads the file as published and never writes a modified copy. Every ICD-11 code it stores keeps its code, WHO title and URI together. There is no mapping or crosswalk between ICD-10(-CM) and ICD-11, and WHO titles are not translated by us; other languages come only from WHO's own files, below (the leading "- " depth markers are left out on screen only).

CPT codes are copyrighted by the AMA; OpenVision stores only the numbers a practice enters or selects, with its own short descriptions.

## For development and tests

`npm run codes:fetch` downloads both releases into this folder (git-ignored; only this README is tracked), checking the hashes. `node scripts/fetch-codes.mjs icd11 --lang es,fr,zh,ar` also fetches WHO's titles in those languages (`--lang all` for every WHO language; default English only). Without `OPENVISION_CODES_DIR`, a development checkout also looks here last, so `npm run dev`, the demo and the tests use these files. Tests that need the real files are skipped (with "run npm run codes:fetch" in their name) when the files are missing.

## A new release

1. Download the new zip and list it: `unzip -l <zip>`.
2. Hash the code file inside it: `unzip -p <zip> "<entry>" | sha256sum`.
3. In `src/lib/codesets/releases.ts` change `release`, `url`, `entry`, `sha256`, `bytes` and `file` (a new file name makes every install reload its table on first use; practices download the new release in Settings › Code sets).
4. `npm run codes:fetch`, then `npm test`: the ICD-11 tests check that every code in WHO's file matches OpenVision's code shapes and that the laterality extension codes (XK9K right, XK8G left, XK9J bilateral) still exist.
5. ICD-11 languages: probe `https://icdcdn.who.int/static/releasefiles/<release>/SimpleTabulation-ICD-11-MMS-<lang>.zip` for each language (HEAD), hash each entry the same way and update `ICD11_LANGUAGES` in releases.ts (the release goes in the `lang()` helper there). Fetch them with `--lang all`; the tests check that each has the same codes and URIs as English.
