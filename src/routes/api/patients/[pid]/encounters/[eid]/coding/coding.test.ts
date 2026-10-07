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
		expect(r.body).toMatchObject({ canEdit: false, status: 'in_progress', state: { family: 'eye' } });
		expect((r.body as { suggestion: { code: string } }).suggestion.code).toMatch(/^920(02|04|12|14)$/);
	});

	it('is scoped: the wrong patient for an encounter is 404 for every method', async () => {
		expect((await call(GET, event(2, 1))).status).toBe(404);
		expect((await call(PUT, event(2, 1, { method: 'PUT', body: { state: STATE } }))).status).toBe(404);
		expect((await call(POST, event(2, 1, { method: 'POST', body: { action: 'status', status: 'checked_out' } }))).status).toBe(404);
		expect((await call(GET, event(1, 9999))).status).toBe(404);
	});

	it('techs cannot save coding state or lines (403); providers and admins can', async () => {
		expect((await call(PUT, event(1, 1, { role: 'tech', method: 'PUT', body: { state: STATE } }))).status).toBe(403);
		expect((await call(POST, event(1, 1, { role: 'tech', method: 'POST', body: { action: 'saveLines', dx: [], cpt: [] } }))).status).toBe(403);
		const ok = await call(PUT, event(1, 1, { method: 'PUT', body: { state: STATE } }));
		expect(ok.status).toBe(200);
		expect((ok.body as { state: { visitCode: string } }).state.visitCode).toBe('92014');
		expect((await call(PUT, event(1, 1, { role: 'admin', method: 'PUT', body: { state: STATE } }))).status).toBe(200);
	});

	it('techs can still change the visit status, recorded under their name', async () => {
		const r = await call(POST, event(1, 1, { role: 'tech', method: 'POST', body: { action: 'status', status: 'checked_out' } }));
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ status: 'checked_out', history: [{ status: 'checked_out', changedBy: 'Dr. Example' }] });
	});

	it('validation errors are 400', async () => {
		expect((await call(PUT, event(1, 1, { method: 'PUT', body: { state: { ...STATE, visitCode: '99013' } } }))).status).toBe(400);
		expect((await call(POST, event(1, 1, { method: 'POST', body: { action: 'saveLines', dx: [], cpt: [{ kind: 'visit', code: '92014', modifiers: [], pointers: ['A'], units: 1 }] } }))).status).toBe(400);
		expect((await call(POST, event(1, 1, { method: 'POST', body: { action: 'nope' } }))).status).toBe(400);
	});

	it('saves lines, and a signed exam refuses changes with 423', async () => {
		const lines = {
			action: 'saveLines',
			dx: [{ letter: 'A', code: 'H40.003', title: 'Glaucoma suspect' }],
			cpt: [{ kind: 'visit', code: '92014', description: 'Eye exam', modifiers: ['25'], pointers: ['A'], units: 1 }]
		};
		const ok = await call(POST, event(1, 1, { method: 'POST', body: lines }));
		expect(ok.status).toBe(200);
		expect(ok.body).toMatchObject({ lines: { dx: [{ code: 'H40.003' }], cpt: [{ code: '92014', modifiers: ['25'] }] } });
		lock.locked = true;
		try {
			expect((await call(PUT, event(1, 1, { method: 'PUT', body: { state: STATE } }))).status).toBe(423);
			const r = await call(POST, event(1, 1, { method: 'POST', body: lines }));
			expect(r.status).toBe(423);
			expect((r.body as { message: string }).message).toBe('This exam is signed.');
			// Status is workflow, not exam content: still allowed after signing.
			expect((await call(POST, event(1, 1, { method: 'POST', body: { action: 'status', status: 'send_notes' } }))).status).toBe(200);
		} finally {
			lock.locked = false;
		}
	});

	it('accepts ICD-11 diagnosis codes on the lines (justifiers only point at items)', async () => {
		const lines = {
			action: 'saveLines',
			dx: [{ letter: 'A', code: '9C61.0Z&XK9J', title: 'POAG' }],
			cpt: [{ kind: 'visit', code: '92014', description: 'Eye exam', modifiers: [], pointers: ['A'], units: 1 }]
		};
		const ok = await call(POST, event(1, 1, { method: 'POST', body: lines }));
		expect(ok.status).toBe(200);
	});

	it('US billing off (D45): every method is 404, the superbill too; nothing is deleted', async () => {
		const { getDb } = await import('#lib/server/db.ts');
		const { updateCodeSettings } = await import('#lib/server/settings.ts');
		const { load } = await import('../../../../../../patients/[pid]/encounters/[eid]/superbill/+page.server.ts');
		const superbill = () => (load as unknown as (e: unknown) => unknown)({ params: { pid: '1', eid: '1' } });
		const status = async (fn: () => unknown) => {
			try {
				await fn();
				return 200;
			} catch (e) {
				return (e as { status?: number }).status ?? 500;
			}
		};
		expect(await status(superbill)).toBe(200);
		updateCodeSettings(getDb(), { usBilling: false }, 1);
		try {
			expect((await call(GET, event(1, 1))).status).toBe(404);
			expect((await call(PUT, event(1, 1, { method: 'PUT', body: { state: STATE } }))).status).toBe(404);
			expect((await call(POST, event(1, 1, { method: 'POST', body: { action: 'status', status: 'checked_out' } }))).status).toBe(404);
			expect(await status(superbill)).toBe(404);
		} finally {
			updateCodeSettings(getDb(), { usBilling: true }, 1);
		}
		const back = await call(GET, event(1, 1));
		expect(back.status).toBe(200);
		expect((back.body as { lines: { dx: unknown[] } }).lines.dx.length).toBeGreaterThan(0);
	});
});
