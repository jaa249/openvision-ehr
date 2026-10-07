// Diagnosis code-set releases (D49): what a practice downloads, from where, and the exact bytes we accept.
// Nothing here is shipped with OpenVision: the practice downloads the official file (or imports it from a
// USB stick), the server checks it against the SHA-256 below and keeps the original text, gzip-compressed
// and otherwise unchanged, in its code cache folder (src/lib/server/codefiles.ts).
// Pure data, shared by the server, the settings page and scripts/fetch-codes.mjs (which reads this file
// as text, so keep each value a plain string literal).
//
// A new release: download the new zip, list it (`unzip -l`), hash the entry (`unzip -p <zip> <entry> | sha256sum`),
// change url / entry / sha256 / bytes / file / release here, then run the tests (codes/README.md).
import type { CodeSetId } from './index.ts';

export interface CodeSetRelease {
	set: CodeSetId;
	/** Shown in Settings, e.g. "FY2027" or "2026-01". */
	release: string;
	/** The official download (a zip). */
	url: string;
	/** Path of the code file inside the zip, exactly as listed. */
	entry: string;
	/** SHA-256 (hex) of the entry's bytes, as published. */
	sha256: string;
	/** Size of the entry in bytes. */
	bytes: number;
	/** Name of the gzip-compressed copy in the code cache folder (also the loader's source tag). */
	file: string;
	publisher: string;
	licence: string;
	/** Where people read about the release (the page linking the download). */
	infoUrl: string;
	/** First date of service the release is valid for (ICD-10-CM fiscal year). */
	validFrom?: string;
	/** Required citation (WHO). */
	citation?: string;
}

export const RELEASES: Record<CodeSetId, CodeSetRelease> = {
	icd10cm: {
		set: 'icd10cm',
		release: 'FY2027',
		url: 'https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip',
		entry: 'Code Descriptions/icd10cm_codes_2027.txt',
		sha256: '3c0583a38ee0e848f7dc0ac8ce88e8f001bbba8c6385ed825d44d46f6e5297c9',
		bytes: 6425201,
		file: 'icd10cm_codes_2027.txt.gz',
		publisher: 'CMS and NCHS',
		licence: 'Public domain',
		infoUrl: 'https://www.cms.gov/medicare/coding-billing/icd-10-codes',
		validFrom: '2026-10-01'
	},
	icd11: {
		set: 'icd11',
		release: '2026-01',
		url: 'https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-en.zip',
		entry: 'SimpleTabulation-ICD-11-MMS-en.txt',
		sha256: '91b6e19048918b0f5cfb5ff56b16262c96e6e301214018f707d84dd6c775e93b',
		bytes: 11661691,
		file: 'icd11_mms_2026-01_en.txt.gz',
		publisher: 'World Health Organization (WHO)',
		licence: 'CC BY-ND 3.0 IGO',
		infoUrl: 'https://icd.who.int/browse/2026-01/mms/en',
		citation: 'International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019 https://icd.who.int'
	}
};

/** The release a set loads from (one current release per set). */
export const releaseOf = (set: CodeSetId): CodeSetRelease => RELEASES[set];

// ---------- ICD-11 titles in other languages (D50) ----------
// WHO publishes the same 2026-01 MMS release as one SimpleTabulation file per language: the same codes and
// URIs as English (checked by script for every file below on 2026-10-07: identical (Code, Linearization
// URI) sets, 35,664 codes), with WHO's title in that language in the column "Title" (and English in
// "TitleEN"). Titles WHO has not translated are empty there; OpenVision then shows English. We never
// translate a title ourselves (D44). Each file's readme.txt is the same column description in every zip and
// names no translator or co-publisher, so every language carries WHO's own ICD-11 citation and licence.
// English stays the main ICD-11 file (RELEASES.icd11): the findings engine searches it.

/** WHO's ICD-11 citation (the same for every language file, as WHO's files and licence state it). */
const WHO_ICD11_CITATION =
	'International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019 https://icd.who.int';

export interface Icd11LanguageRelease {
	/** WHO's language code in the file name (also OpenVision's interface code where they match). */
	lang: string;
	/** The language's English name (the page shows its own name through Intl.DisplayNames). */
	name: string;
	release: string;
	url: string;
	entry: string;
	sha256: string;
	bytes: number;
	file: string;
	publisher: string;
	licence: string;
	citation: string;
	/** WHO's browser in that language. */
	infoUrl: string;
	/** The OpenVision interface language this serves (null: no interface in that language yet). */
	serves: 'es' | 'fr' | 'zh' | 'ar' | null;
	/** WHO's own remark on the translation: 'prerelease' (German) or 'titlesOnly' (Latin). */
	note?: 'prerelease' | 'titlesOnly';
}

/** One entry per language WHO publishes for 2026-01 (probed 2026-10-07: no Hindi, Italian, Japanese or Korean file). */
const lang = (
	code: string,
	name: string,
	sha256: string,
	bytes: number,
	serves: Icd11LanguageRelease['serves'],
	note?: Icd11LanguageRelease['note']
): Icd11LanguageRelease => ({
	lang: code,
	name,
	release: '2026-01',
	url: `https://icdcdn.who.int/static/releasefiles/2026-01/SimpleTabulation-ICD-11-MMS-${code}.zip`,
	entry: `SimpleTabulation-ICD-11-MMS-${code}.txt`,
	sha256,
	bytes,
	file: `icd11_mms_2026-01_${code}.txt.gz`,
	publisher: 'World Health Organization (WHO)',
	licence: 'CC BY-ND 3.0 IGO',
	citation: WHO_ICD11_CITATION,
	infoUrl: `https://icd.who.int/browse/2026-01/mms/${code}`,
	serves,
	...(note ? { note } : {})
});

/** WHO language files, in the order the Code sets page lists them (OpenVision's interface languages first). */
export const ICD11_LANGUAGES: readonly Icd11LanguageRelease[] = [
	lang('es', 'Spanish', 'fecec2e898e9f5856017501e52998eb2fd3edd9a76c326323988e80d1482bc0e', 13521947, 'es'),
	lang('fr', 'French', 'a517d9b79a0005e2fa0d5b58e9e8d199a8c1419248193761b10306ac5dbe3dd6', 13509150, 'fr'),
	lang('zh', 'Chinese', 'aa30ced6e8d0d181ba46d82096c4a71e52b698c85b09d62289968e81284a47df', 13018671, 'zh'),
	lang('ar', 'Arabic', '62f8b56774fb56ef2f28bc332ffae406d54e8710eb81ce24704be40bcb1c439d', 14292082, 'ar'),
	lang('ru', 'Russian', '94e4bf055d8515b467f01767a32213632436ae0727b41578b9b2836003ef930d', 14829738, null),
	lang('pt', 'Portuguese', 'bcfd1b3fa54a21eee13df38ffe0abc3483b94fbfc024a5ccd20f2001922f1eda', 13523313, null),
	lang('de', 'German', '2885f5f298f6d219a75cd99ae4199575577e64dc7ec9257dcad47a3add97081d', 13346264, null, 'prerelease'),
	lang('tr', 'Turkish', '270b5c110e0e83abb93263ab50ba4fb7d4a98d9bfafee8f1b7e103fc15d34561', 13418603, null),
	lang('uz', 'Uzbek', 'f4d94db46a77729bdb4bf59fd503a938973c6f8f504e6bc344d29f5eb0dbb253', 13477317, null),
	lang('cs', 'Czech', 'e5e4e6254d44036e1ebadc8f0305206a0dff993f78fad1a2b6636fff976cb267', 13443719, null),
	lang('kk', 'Kazakh', '08d776fb28e81b3e41ac2cfd32c6c2fa4361612c6f559b6fa147a34c7c16bd21', 14700500, null),
	lang('sv', 'Swedish', '6544c71bb187e84521dcc7807a24416d99de43ec62401642f09cefa4480f4d8b', 13329961, null),
	lang('sk', 'Slovak', '47128c41e15ae1bb18ff36b8ab865a9e186de2032470651b08744ce01229266b', 13675938, null),
	lang('la', 'Latin', 'd0f0129e8275e7a3940ca9476c88e8aaf29c32753d2bfbd193f3ac1c7f3d5cda', 13633183, null, 'titlesOnly')
];

/** The WHO language file for a code ('es', 'zh', ...); null for English (the main file) and anything else. */
export const icd11Language = (code: unknown): Icd11LanguageRelease | null =>
	typeof code === 'string' ? (ICD11_LANGUAGES.find((l) => l.lang === code) ?? null) : null;

/** A WHO language's name in the reader's language (Intl.DisplayNames), else its English name, else the code. */
export function icd11LanguageName(lang: string, uiLocale: string): string {
	try {
		const n = new Intl.DisplayNames([uiLocale, 'en'], { type: 'language' }).of(lang);
		if (n && n !== lang) return n;
	} catch {
		// an engine without DisplayNames data: the English name below
	}
	return lang === 'en' ? 'English' : (icd11Language(lang)?.name ?? lang);
}
