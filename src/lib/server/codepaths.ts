// Where diagnosis code files live (D49). OpenVision ships no code files: the practice downloads them
// (Settings › Code sets) and the server keeps the original text, gzip-compressed and unchanged, in the
// code cache folder:
//   OPENVISION_CODES_DIR when set (then the only place looked in), else
//   <folder of OPENVISION_DB>/codes (default data/codes).
// Development only: without OPENVISION_CODES_DIR, a git checkout's codes/ folder (filled by
// `npm run codes:fetch`, git-ignored, never in a package) is looked in last, so tests and the demo work.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folder downloads and imports are written to. */
export function codesCacheDir(): string {
	if (process.env.OPENVISION_CODES_DIR) return resolve(process.env.OPENVISION_CODES_DIR);
	const db = process.env.OPENVISION_DB;
	if (!db || db === ':memory:') return resolve('data', 'codes');
	return join(dirname(resolve(db)), 'codes');
}

/** The folders searched for a code file, in order. */
export function codeSearchDirs(): string[] {
	const dirs = [codesCacheDir()];
	if (process.env.OPENVISION_CODES_DIR) return dirs;
	// Development fallback: codes/ in the working directory, then up from this module (dev and `node build`).
	dirs.push(resolve(process.cwd(), 'codes'));
	try {
		let d = dirname(fileURLToPath(import.meta.url));
		for (let i = 0; i < 6; i++) {
			dirs.push(join(d, 'codes'));
			const up = dirname(d);
			if (up === d) break;
			d = up;
		}
	} catch {
		// import.meta.url is not a file URL (bundled elsewhere): the other places still apply.
	}
	return [...new Set(dirs)];
}

/** Path of a code file (e.g. "icd10cm_codes_2027.txt.gz"), or null when it has not been downloaded. */
export function findCodeFile(name: string): string | null {
	for (const dir of codeSearchDirs()) {
		const p = join(dir, name);
		if (existsSync(p)) return p;
	}
	return null;
}
