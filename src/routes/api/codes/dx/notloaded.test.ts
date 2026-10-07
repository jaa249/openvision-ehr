// The code finder APIs before the practice has downloaded its code set (D49): empty, with a flag.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Handler = (event: unknown) => Promise<Response> | Response;
let dx: Handler;
let icd10: Handler;
let dir: string;
const saved = process.env.OPENVISION_CODES_DIR;

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), 'ov-nocodes-'));
	process.env.OPENVISION_CODES_DIR = dir;
	process.env.OPENVISION_DB = ':memory:';
	({ GET: dx } = (await import('./+server.ts')) as unknown as { GET: Handler });
	({ GET: icd10 } = (await import('../icd10/+server.ts')) as unknown as { GET: Handler });
});
afterAll(() => {
	if (saved === undefined) delete process.env.OPENVISION_CODES_DIR;
	else process.env.OPENVISION_CODES_DIR = saved;
	rmSync(dir, { recursive: true, force: true });
});

const get = (h: Handler, path: string) => h({ url: new URL(`http://localhost${path}`) });

describe('no code set downloaded', () => {
	it('GET /api/codes/dx answers no codes and notLoaded, for either set', async () => {
		expect(await (await get(dx, '/api/codes/dx?q=glaucoma')).json()).toEqual({ system: 'icd10cm', codes: [], notLoaded: true });
		const { getDb } = await import('#lib/server/db.ts');
		const { updateCodeSettings } = await import('#lib/server/settings.ts');
		updateCodeSettings(getDb(), { codeSet: 'icd11' }, 1);
		expect(await (await get(dx, '/api/codes/dx?q=glaucoma')).json()).toEqual({ system: 'icd11', codes: [], notLoaded: true });
	});

	it('the older GET /api/codes/icd10 stays an array, with a header', async () => {
		const res = await get(icd10, '/api/codes/icd10?q=H40');
		expect(await res.json()).toEqual([]);
		expect(res.headers.get('x-codes-not-loaded')).toBe('1');
	});
});
