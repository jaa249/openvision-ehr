#!/usr/bin/env node
// Development and tests (D49): downloads the diagnosis code releases pinned in
// src/lib/codesets/releases.ts into codes/ (git-ignored), checking each file's SHA-256, and stores the
// code text gzip-compressed and otherwise unchanged. A practice never needs this: it downloads its
// code set in Settings › Code sets. No dependencies (Node 24 runs the .ts modules as they are).
//
//   npm run codes:fetch                    # both sets into codes/
//   node scripts/fetch-codes.mjs icd11     # one set
//   node scripts/fetch-codes.mjs --dir D   # another folder (e.g. an OPENVISION_CODES_DIR)
//   node scripts/fetch-codes.mjs icd11 --lang es,zh   # also WHO's ICD-11 titles in these languages (D50)
//
// Without --lang only English is fetched (it is what the findings engine searches). `--lang all` fetches
// every WHO language listed in releases.ts (ICD11_LANGUAGES).
//
// Licences: ICD-10-CM is public domain (CMS/NCHS). ICD-11 is WHO's, CC BY-ND 3.0 IGO: the file is kept
// unchanged and is never committed or redistributed by this project.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ICD11_LANGUAGES, RELEASES } from '../src/lib/codesets/releases.ts';
import { extractEntry } from '../src/lib/server/unzip.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
let dir = join(root, 'codes');
const sets = [];
const langs = [];
const known = ICD11_LANGUAGES.map((l) => l.lang);
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--dir') dir = resolve(args[++i] ?? '');
	else if (args[i] === '--lang') {
		for (const l of (args[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
			if (l === 'all') langs.push(...known);
			else if (l === 'en') continue; // English is the icd11 set itself
			else if (known.includes(l)) langs.push(l);
			else {
				console.error(`Unknown ICD-11 language ${l}. WHO languages: ${known.join(', ')}.`);
				process.exit(2);
			}
		}
	} else if (args[i] in RELEASES) sets.push(args[i]);
	else {
		console.error(`Unknown argument ${args[i]}. Sets: ${Object.keys(RELEASES).join(', ')}; --lang <codes>; --dir <folder>.`);
		process.exit(2);
	}
}
if (!sets.length) sets.push(...Object.keys(RELEASES));
mkdirSync(dir, { recursive: true });

/** What to fetch: each set's release, then each WHO language file asked for. */
const jobs = [
	...sets.map((set) => ({ name: set, rel: RELEASES[set] })),
	...[...new Set(langs)].map((l) => ({ name: `icd11 ${l}`, rel: ICD11_LANGUAGES.find((x) => x.lang === l) }))
];

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
let failed = false;
for (const { name: set, rel } of jobs) {
	const target = join(dir, rel.file);
	if (existsSync(target)) {
		try {
			if (sha256(gunzipSync(readFileSync(target))) === rel.sha256) {
				console.log(`${set} ${rel.release}: already in ${target}`);
				continue;
			}
		} catch {
			// unreadable: fetch again
		}
	}
	try {
		process.stdout.write(`${set} ${rel.release}: downloading ${rel.url} ... `);
		const res = await fetch(rel.url, { signal: AbortSignal.timeout(120_000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const zip = new Uint8Array(await res.arrayBuffer());
		const text = extractEntry(zip, rel.entry);
		const hash = sha256(text);
		if (hash !== rel.sha256) throw new Error(`not the expected release (SHA-256 ${hash}, expected ${rel.sha256})`);
		const tmp = `${target}.tmp`;
		writeFileSync(tmp, gzipSync(text));
		renameSync(tmp, target);
		console.log(`ok, ${text.length} bytes -> ${target}`);
	} catch (e) {
		failed = true;
		console.log('failed');
		console.error(`  ${e instanceof Error ? e.message : e}`);
	}
}
process.exit(failed ? 1 : 0);
