// A save whose request passed the early checks but whose body arrives after the exam was signed is
// refused with 423 and changes nothing (D36): the routes check the lock and signature after reading
// the body, inside the write's transaction.
import { beforeAll, describe, expect, it } from 'vitest';
import type { DB } from '#lib/server/db.ts';

process.env.OPENVISION_DB = ':memory:';

type Handler = (event: unknown) => Promise<Response> | Response;
let db: DB;
let findingsPut: Handler, drawingPut: Handler, planPost: Handler, staffPut: Handler, docPatch: Handler, docPost: Handler;
let signing: typeof import('#lib/server/signing.ts');
let exam: typeof import('#lib/server/exam.ts');
let documents: typeof import('#lib/server/documents.ts');
let plan: typeof import('#lib/server/plan.ts');

const TOKEN = 'page-token-aaaaaaaaaaaa';
const DR = { id: 1, displayName: 'Dr. Example', role: 'provider' as const };

beforeAll(async () => {
	db = (await import('#lib/server/db.ts')).getDb();
	signing = await import('#lib/server/signing.ts');
	exam = await import('#lib/server/exam.ts');
	documents = await import('#lib/server/documents.ts');
	plan = await import('#lib/server/plan.ts');
	findingsPut = (await import('./findings/+server.ts')).PUT as unknown as Handler;
	drawingPut = (await import('./drawings/[zone]/+server.ts')).PUT as unknown as Handler;
	planPost = (await import('./plan/+server.ts')).POST as unknown as Handler;
	staffPut = (await import('./staff/+server.ts')).PUT as unknown as Handler;
	docPatch = (await import('../../documents/[id]/+server.ts')).PATCH as unknown as Handler;
	docPost = (await import('../../documents/+server.ts')).POST as unknown as Handler;
});

/** A request whose body is held back until send() is called (a slow upload). */
function lateRequest(method: string, contentType: string) {
	let ctl!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctl = c) });
	const request = new Request('http://localhost/api', {
		method,
		headers: { 'content-type': contentType, 'x-lock-token': TOKEN },
		body,
		duplex: 'half'
	} as RequestInit);
	return {
		request,
		send(bytes: Uint8Array | string) {
			ctl.enqueue(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
			ctl.close();
		}
	};
}

const event = (request: Request, params: Record<string, string>, url = 'http://localhost/api') => ({
	params,
	request,
	url: new URL(url),
	locals: { userId: 1, user: { id: 1, displayName: 'Dr. Example', role: 'provider' }, locale: 'en' }
});

async function call(h: Handler, ev: unknown): Promise<number> {
	try {
		return (await h(ev)).status;
	} catch (e) {
		const status = (e as { status?: number }).status;
		if (typeof status === 'number') return status;
		throw e;
	}
}

function png(tag = 0): Uint8Array {
	const b = new Uint8Array(64);
	b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	b[40] = tag;
	return b;
}

const flushIo = () => new Promise((r) => setTimeout(r, 10));

describe('a body that arrives after signing (D36)', () => {
	it('is refused with 423 on every exam write route, and nothing changes', async () => {
		// Unsigned and this page holds the lock: a normal save works.
		signing.acquireLock(db, 1, 1, 1, TOKEN);
		const ok = lateRequest('PUT', 'application/json');
		const okStatus = call(findingsPut, event(ok.request, { pid: '1', eid: '1' }));
		ok.send(JSON.stringify({ changes: [{ field: 'ODIOPTARGET', value: '17' }] }));
		expect(await okStatus).toBe(200);
		const item = plan.addItem(db, 1, 1, 1, { kind: 'free', title: 'Glaucoma suspect' })!;
		const doc = documents.uploadDocument(db, 1, { category: 'FUNDUS_PHOTO', filename: 'f.png', bytes: png(1), encounterId: 1 }, 1)!;

		// Every request starts (early checks pass) while the exam is still unsigned ...
		const f = lateRequest('PUT', 'application/json');
		const d = lateRequest('PUT', 'image/png');
		const p = lateRequest('POST', 'application/json');
		const s = lateRequest('PUT', 'application/json');
		const dp = lateRequest('PATCH', 'application/json');
		const up = lateRequest('POST', 'application/octet-stream');
		const statuses = [
			call(findingsPut, event(f.request, { pid: '1', eid: '1' })),
			call(drawingPut, event(d.request, { pid: '1', eid: '1', zone: 'RETINA' })),
			call(planPost, event(p.request, { pid: '1', eid: '1' })),
			call(staffPut, event(s.request, { pid: '1', eid: '1' })),
			call(docPatch, event(dp.request, { pid: '1', id: String(doc.id) })),
			call(docPost, event(up.request, { pid: '1' }, 'http://localhost/api?category=FUNDUS_PHOTO&encounter=1&filename=g.png'))
		];
		await flushIo();
		// ... then the provider signs before the bodies arrive.
		signing.signExam(db, 1, 1, DR, TOKEN);
		const hash = signing.getSignedHash(db, 1);
		f.send(JSON.stringify({ changes: [{ field: 'ODIOPTARGET', value: '30' }] }));
		d.send(png(9));
		p.send(JSON.stringify({ action: 'update', id: item.id, plan: 'changed after signing' }));
		s.send(JSON.stringify({ providerId: 1, technicianId: 2 }));
		dp.send(JSON.stringify({ notes: 'changed after signing' }));
		up.send(png(7));

		expect(await Promise.all(statuses)).toEqual([423, 423, 423, 423, 423, 423]);
		expect(exam.getFindings(db, 1, 1)!.ODIOPTARGET?.value).toBe('17');
		expect(db.prepare('SELECT COUNT(*) AS n FROM drawings WHERE encounter_id = 1').get()).toEqual({ n: 0 });
		expect(plan.listItems(db, 1, 1)![0].plan).toBe('');
		expect(exam.getEncounter(db, 1, 1)!.technicianId).toBeNull();
		expect(documents.getDocumentMeta(db, 1, doc.id)!.notes).toBe('');
		expect(documents.listDocuments(db, 1, { encounterId: 1 })).toHaveLength(1);
		expect(signing.examContentHash(db, 1)).toBe(hash);
	});
});
