// Route-level checks for the coding API: scoping by patient + encounter, the role check, the lock (423).
import { beforeAll, describe, expect, it, vi } from 'vitest';

const lock = vi.hoisted(() => ({ locked: false }));
vi.mock('#lib/server/signing.ts', async (orig) => {
	const real = await orig<typeof import('#lib/server/signing.ts')>();
	return {
		...real,
		assertEditable: () => {
			if (lock.locked) throw new real.EncounterLockedError('This exam is signed.', 'signed');
		}
	};
});

type Handler = (event: unknown) => Promise<Response> | Response;
let GET: Handler, PUT: Handler, POST: Handler;

beforeAll(async () => {
	process.env.OPENVISION_DB = ':memory:';
	const mod = await import('./+server.ts');
	({ GET, PUT, POST } = mod as unknown as { GET: Handler; PUT: Handler; POST: Handler });
});

const STATE = { family: 'eye', visitCode: '92014', modifiers: [], justifiersOff: [], tests: [], include92060: false };

function event(pid: number, eid: number, opts: { role?: 'admin' | 'provider' | 'tech'; method?: string; body?: unknown } = {}) {
	const role = opts.role ?? 'provider';
	return {
		params: { pid: String(pid), eid: String(eid) },
		locals: { userId: 1, user: { id: 1, displayName: 'Dr. Example', role } },
		request: new Request('http://localhost/api', {
			method: opts.method ?? 'GET',
			headers: { 'content-type': 'application/json' },
			body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
		})
	};
}

/** Runs a handler; SvelteKit's error() throws an HttpError with a status. */
async function call(h: Handler, ev: unknown): Promise<{ status: number; body: unknown }> {
	try {
		const res = await h(ev);
		return { status: res.status, body: await res.json() };
	} catch (e) {
		const err = e as { status?: number; body?: { message?: string } };
		if (typeof err.status === 'number') return { status: err.status, body: err.body };
		throw e;
	}
}

describe('coding API', () => {
	it('GET returns state, suggestion and canEdit; techs can view', async () => {
		const r = await call(GET, event(1, 1, { role: 'tech' }));
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ canEdit: false, state: { family: 'eye' } });
		expect(r.body).not.toHaveProperty('status'); // no visit status workflow (D46)
		expect(r.body).not.toHaveProperty('lines'); // no saved billing lines (D46)
		expect((r.body as { suggestion: { code: string } }).suggestion.code).toMatch(/^920(02|04|12|14)$/);
	});

	it('is scoped: the wrong patient for an encounter is 404 for every method', async () => {
		expect((await call(GET, event(2, 1))).status).toBe(404);
		expect((await call(PUT, event(2, 1, { method: 'PUT', body: { state: STATE } }))).status).toBe(404);
		expect((await call(POST, event(2, 1, { method: 'POST', body: { action: 'status' } }))).status).toBe(404);
		expect((await call(GET, event(1, 9999))).status).toBe(404);
	});

	it('techs cannot save the coding state (403); providers and admins can', async () => {
		expect((await call(PUT, event(1, 1, { role: 'tech', method: 'PUT', body: { state: STATE } }))).status).toBe(403);
		const ok = await call(PUT, event(1, 1, { method: 'PUT', body: { state: STATE } }));
		expect(ok.status).toBe(200);
		expect((ok.body as { state: { visitCode: string } }).state.visitCode).toBe('92014');
		expect((await call(PUT, event(1, 1, { role: 'admin', method: 'PUT', body: { state: STATE } }))).status).toBe(200);
	});

	it('has no visit status or saveLines action any more (D46): 400 for every role', async () => {
		const lines = { dx: [{ letter: 'A', code: 'H40.003', title: 'Glaucoma suspect' }], cpt: [] };
		for (const role of ['tech', 'provider', 'admin'] as const) {
			for (const body of [{ action: 'status', status: 'checked_out' }, { action: 'saveLines', ...lines }]) {
				const r = await call(POST, event(1, 1, { role, method: 'POST', body }));
				expect(r.status).toBe(400);
				expect((r.body as { message: string }).message).toBe('Unknown action');
			}
		}
	});

	it('validation errors are 400', async () => {
		expect((await call(PUT, event(1, 1, { method: 'PUT', body: { state: { ...STATE, visitCode: '99013' } } }))).status).toBe(400);
		expect((await call(POST, event(1, 1, { method: 'POST', body: { action: 'nope' } }))).status).toBe(400);
	});

	it('a signed exam refuses changes with 423', async () => {
		lock.locked = true;
		try {
			const r = await call(PUT, event(1, 1, { method: 'PUT', body: { state: STATE } }));
			expect(r.status).toBe(423);
			expect((r.body as { message: string }).message).toBe('This exam is signed.');
		} finally {
			lock.locked = false;
		}
	});

	it('US code suggestions off (D45): every method is 404; nothing is deleted', async () => {
		const { getDb } = await import('#lib/server/db.ts');
		const { updateCodeSettings } = await import('#lib/server/settings.ts');
		updateCodeSettings(getDb(), { usBilling: false }, 1);
		try {
			expect((await call(GET, event(1, 1))).status).toBe(404);
			expect((await call(PUT, event(1, 1, { method: 'PUT', body: { state: STATE } }))).status).toBe(404);
			expect((await call(POST, event(1, 1, { method: 'POST', body: { action: 'status' } }))).status).toBe(404);
		} finally {
			updateCodeSettings(getDb(), { usBilling: true }, 1);
		}
		const back = await call(GET, event(1, 1));
		expect(back.status).toBe(200);
		expect((back.body as { state: { visitCode: string } }).state.visitCode).toBe('92014'); // the chosen code was kept
	});
});
