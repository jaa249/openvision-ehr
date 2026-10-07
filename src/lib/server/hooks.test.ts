// The sign-in gate in hooks.server.ts, driven with fake request events against an in-memory database.
process.env.OPENVISION_DB = ':memory:';

import { describe, expect, it } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { getDb } from './db.ts';
import { createSession, SESSION_COOKIE, touchSession } from './auth.ts';
import { searchAudit } from './security_audit.ts';
import { SHELL_HEADER, shellTokenOk } from './shell.ts';
import { handle } from '../../hooks.server.ts';
import { actions as usersActions, load as usersLoad } from '../../routes/settings/users/+page.server.ts';
import { load as practiceLoad, actions as practiceActions } from '../../routes/settings/practice/+page.server.ts';
import { load as normalsLoad } from '../../routes/settings/normals/+page.server.ts';
import { load as qpLoad } from '../../routes/settings/quick-picks/+page.server.ts';
import { load as auditLoad } from '../../routes/settings/audit/+page.server.ts';
import { load as meLoad } from '../../routes/settings/me/+page.server.ts';

type Ev = Parameters<typeof handle>[0]['event'];

function event(path: string, { method = 'GET', token, headers = {} }: { method?: string; token?: string; headers?: Record<string, string> } = {}) {
	const url = new URL(`http://localhost:5214${path}`);
	const jar = new Map<string, string>(token ? [[SESSION_COOKIE, token]] : []);
	const deleted: string[] = [];
	const h = new Headers(headers);
	if (method !== 'GET' && !h.has('origin')) h.set('origin', url.origin);
	const ev = {
		url,
		request: new Request(url, { method, headers: h }),
		cookies: { get: (n: string) => jar.get(n), set: () => {}, delete: (n: string) => deleted.push(n), getAll: () => [], serialize: () => '' },
		locals: {} as App.Locals,
		isDataRequest: false,
		getClientAddress: () => '127.0.0.1'
	};
	return { ev: ev as unknown as Ev, deleted };
}

async function run(path: string, opts: Parameters<typeof event>[1] = {}, status = 200) {
	const { ev, deleted } = event(path, opts);
	let seenLocals: App.Locals | null = null;
	try {
		const res = await handle({
			event: ev,
			resolve: async (e) => {
				seenLocals = e.locals;
				return new Response('ok', { status });
			}
		});
		return { res, locals: seenLocals as App.Locals | null, deleted, redirect: null as string | null };
	} catch (e) {
		if (isRedirect(e)) return { res: null, locals: null, deleted, redirect: e.location };
		throw e;
	}
}

describe('hooks gate', () => {
	it('pages redirect to /login with next; data stays out', async () => {
		const r = await run('/patients/1?tab=x');
		expect(r.redirect).toBe('/login?next=%2Fpatients%2F1%3Ftab%3Dx');
	});

	it('API and export answer 401 JSON', async () => {
		for (const p of ['/api/prefs', '/export/csv']) {
			const r = await run(p);
			expect(r.res?.status).toBe(401);
			expect(await r.res?.json()).toEqual({ error: 'Sign in first' });
		}
	});

	it('public routes pass without a session', async () => {
		for (const p of ['/login', '/setup', '/_app/immutable/app.js', '/robots.txt']) expect((await run(p)).res?.status).toBe(200);
	});

	it('a valid session sets locals.userId and locals.user; headers are secured', async () => {
		const token = createSession(getDb(), 3);
		const r = await run('/encounters', { token });
		expect(r.locals?.userId).toBe(3);
		expect(r.locals?.user).toMatchObject({ id: 3, role: 'admin', displayName: 'Office Admin (demo)' });
		expect(r.res?.headers.get('x-frame-options')).toBe('DENY');
		expect(r.res?.headers.get('cache-control')).toBe('no-store');
	});

	it('a stale cookie is cleared and treated as signed out', async () => {
		const r = await run('/encounters', { token: 'A'.repeat(43) });
		expect(r.redirect).toMatch(/^\/login/);
		expect(r.deleted).toContain(SESSION_COOKIE);
	});

	it('cross-site writes are still blocked before anything else', async () => {
		const token = createSession(getDb(), 1);
		const r = await run('/api/prefs', { method: 'PUT', token, headers: { origin: 'http://evil.example' } });
		expect(r.res?.status).toBe(403);
	});

	it('background requests do not extend the session', async () => {
		const db = getDb();
		const t0 = Date.now() - 10 * 60_000 - 7;
		const token = createSession(db, 1, t0);
		touchSession(db, token, t0);
		const seen = () => (db.prepare('SELECT last_seen FROM sessions WHERE created_at = ?').get(t0) as { last_seen: number }).last_seen;
		const before = seen();
		await run('/api/patients/1/encounters/1/lock', { method: 'POST', token });
		await run('/api/session', { token, headers: { 'x-background': '1' } });
		expect(seen()).toBe(before);
		await run('/encounters', { token });
		expect(seen()).toBeGreaterThan(before);
	});

	it('chart and exam page views are audited (pages only, successful only)', async () => {
		const db = getDb();
		const token = createSession(db, 1);
		await run('/patients/2', { token });
		await run('/patients/1/encounters/1', { token });
		await run('/patients/999', { token }, 404);
		await run('/api/patients/1/encounters/1/findings', { token });
		expect(searchAudit(db, { action: 'view_patient', userId: 1 }).rows.map((r) => r.patientId)).toEqual([2]);
		expect(searchAudit(db, { action: 'view_exam', userId: 1 }).rows[0]).toMatchObject({ patientId: 1, encounterId: 1 });
	});

	it('a temporary password sends pages to /settings/me first', async () => {
		const db = getDb();
		db.prepare('UPDATE users SET must_change_password = 1 WHERE id = 2').run();
		const token = createSession(db, 2);
		expect((await run('/', { token })).redirect).toBe('/settings/me?required=1');
		expect((await run('/settings/me', { token })).res?.status).toBe(200);
		db.prepare('UPDATE users SET must_change_password = 0 WHERE id = 2').run();
	});

	it('sets locals.locale and the html lang/dir of the page (D48)', async () => {
		const db = getDb();
		const token = createSession(db, 1);
		db.prepare("INSERT INTO user_prefs (user_id, key, value) VALUES (1, 'locale', 'es') ON CONFLICT (user_id, key) DO UPDATE SET value = 'es'").run();
		const { ev } = event('/', { token });
		let html = '';
		await handle({
			event: ev,
			resolve: async (e, opts) => {
				html = (await opts?.transformPageChunk?.({ html: '<html lang="en"><body></body></html>', done: true })) ?? '';
				return new Response(html, { status: 200 });
			}
		});
		expect(ev.locals.locale).toBe('es');
		expect(html).toBe('<html lang="es" dir="ltr"><body></body></html>');
		db.prepare("DELETE FROM user_prefs WHERE user_id = 1 AND key = 'locale'").run();
		expect((await run('/login')).locals?.locale).toBe('en');
	});
});

describe('settings routes check roles on the server', () => {
	const as = (id: number, role: 'admin' | 'provider' | 'tech') =>
		({ userId: id, user: { id, displayName: 'x', role }, sessionToken: undefined }) as App.Locals;
	const status = async (fn: () => unknown) => {
		try {
			await fn();
		} catch (e) {
			if (isHttpError(e)) return e.status;
			throw e;
		}
		return 200;
	};
	const url = new URL('http://localhost/settings');
	type AnyLoad = (e: unknown) => unknown;
	const call = (load: unknown, locals: App.Locals) => (load as AnyLoad)({ locals, url });

	it('admin-only pages refuse providers and techs', async () => {
		for (const load of [usersLoad, practiceLoad, auditLoad]) {
			expect(await status(() => call(load, as(1, 'provider')))).toBe(403);
			expect(await status(() => call(load, as(2, 'tech')))).toBe(403);
			expect(await status(() => call(load, as(3, 'admin')))).toBe(200);
		}
	});

	it('admin-only actions refuse others even when posted directly', async () => {
		const req = () => new Request('http://localhost/x', { method: 'POST', body: new URLSearchParams({ id: '3', name: 'Hacked' }) });
		expect(await status(() => (usersActions.deactivate as unknown as AnyLoad)({ locals: as(1, 'provider'), request: req() }))).toBe(403);
		expect(await status(() => (practiceActions.default as unknown as AnyLoad)({ locals: as(2, 'tech'), request: req() }))).toBe(403);
	});

	it('normals and quick picks: providers and admins, not techs; My settings: everyone', async () => {
		for (const load of [normalsLoad, qpLoad]) {
			expect(await status(() => call(load, as(2, 'tech')))).toBe(403);
			expect(await status(() => call(load, as(1, 'provider')))).toBe(200);
		}
		expect(await status(() => call(meLoad, as(2, 'tech')))).toBe(200);
	});
});

describe('desktop shell token (D51)', () => {
	const TOKEN = 'k3Y-0f_this-launch_only_aaaaaaaaaaaaaaaaaaaa';
	const withToken = async <T>(fn: () => Promise<T>): Promise<T> => {
		const before = process.env.OPENVISION_SHELL_TOKEN;
		process.env.OPENVISION_SHELL_TOKEN = TOKEN;
		try {
			return await fn();
		} finally {
			if (before === undefined) delete process.env.OPENVISION_SHELL_TOKEN;
			else process.env.OPENVISION_SHELL_TOKEN = before;
		}
	};

	it('unset: requests pass exactly as before (development, tests, node build)', async () => {
		expect((await run('/login')).res?.status).toBe(200);
		expect(shellTokenOk(null, undefined)).toBe(true);
		expect(shellTokenOk(null, '')).toBe(true);
	});

	it('set: a request without the header, or with a wrong one, gets 403 plain text before anything else', async () => {
		await withToken(async () => {
			for (const headers of [{} as Record<string, string>, { [SHELL_HEADER]: 'wrong' }, { [SHELL_HEADER]: TOKEN + 'x' }, { [SHELL_HEADER]: '' }]) {
				const r = await run('/login', { headers });
				expect(r.res?.status).toBe(403);
				expect(r.res?.headers.get('content-type')).toMatch(/^text\/plain/);
				expect(await r.res?.text()).toBe('Open OpenVision from its desktop app.');
			}
			// Even signed-in API calls and public routes are refused without it.
			const token = createSession(getDb(), 1);
			expect((await run('/api/prefs', { token })).res?.status).toBe(403);
			expect((await run('/setup')).res?.status).toBe(403);
		});
	});

	it('set: the right header passes through to the normal gate', async () => {
		await withToken(async () => {
			expect((await run('/login', { headers: { [SHELL_HEADER]: TOKEN } })).res?.status).toBe(200);
			const r = await run('/patients/1', { headers: { [SHELL_HEADER]: TOKEN } });
			expect(r.redirect).toBe('/login?next=%2Fpatients%2F1');
		});
	});

	it('compares in constant time over equal-length digests (any length is safe)', () => {
		expect(shellTokenOk(TOKEN, TOKEN)).toBe(true);
		expect(shellTokenOk('a', TOKEN)).toBe(false);
		expect(shellTokenOk('x'.repeat(10_000), TOKEN)).toBe(false);
		expect(shellTokenOk(undefined, TOKEN)).toBe(false);
	});
});
