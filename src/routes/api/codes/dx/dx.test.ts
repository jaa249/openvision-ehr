// GET /api/codes/dx follows the practice's code set (D44).
import { beforeAll, describe, expect, it } from 'vitest';
import { HAVE_ICD10_FILE, HAVE_ICD11_FILE, needsCodes } from '#lib/codesets/icd11.fixture.ts';

type Handler = (event: unknown) => Promise<Response> | Response;
let GET: Handler;

beforeAll(async () => {
	process.env.OPENVISION_DB = ':memory:';
	({ GET } = (await import('./+server.ts')) as unknown as { GET: Handler });
});

const search = async (q: string) => (await GET({ url: new URL(`http://localhost/api/codes/dx?q=${encodeURIComponent(q)}`) })).json();

const HAVE = HAVE_ICD10_FILE && HAVE_ICD11_FILE;
describe.skipIf(!HAVE)(needsCodes('code finder API (downloaded code files)', HAVE), () => {
	it('ICD-10-CM by default, ICD-11 with WHO title, URI and leaf flag after the switch', async () => {
		const a = await search('H25.13');
		expect(a).toMatchObject({ system: 'icd10cm', codes: [{ code: 'H25.13', leaf: true }] });
		const { getDb } = await import('#lib/server/db.ts');
		const { updateCodeSettings } = await import('#lib/server/settings.ts');
		updateCodeSettings(getDb(), { codeSet: 'icd11' }, 1);
		const b = await search('9C61.0Z');
		expect(b).toEqual({
			system: 'icd11',
			codes: [
				{
					code: '9C61.0Z',
					description: 'Primary open-angle glaucoma, unspecified',
					uri: 'http://id.who.int/icd/release/11/mms/1849071057/unspecified',
					leaf: true
				}
			]
		});
		expect((await search('right')).codes.some((c: { code: string }) => c.code.startsWith('X'))).toBe(false);
	});
});
