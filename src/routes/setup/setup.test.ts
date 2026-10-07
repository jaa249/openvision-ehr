// First-run setup requires accepting the Terms of Use and the data safety notice (D51).
process.env.OPENVISION_DB = ':memory:';
process.env.OPENVISION_DEMO = '0';

import { describe, expect, it } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { needsSetup } from '#lib/server/auth.ts';
import { searchAudit } from '#lib/server/security_audit.ts';
import { APP_VERSION } from '#lib/server/version.ts';
import { actions, load } from './+page.server.ts';

const PW = 'a-long-enough-test-passphrase';

function call(fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const request = new Request('http://localhost/setup', { method: 'POST', body });
	const cookies = { set: () => {}, get: () => undefined, delete: () => {}, getAll: () => [], serialize: () => '' };
	return (actions.default as (e: unknown) => Promise<unknown>)({ request, cookies, url: new URL(request.url), locals: { locale: 'en' } });
}

describe('setup: terms acceptance', () => {
	it('shows the notice', () => {
		const data = (load as (e: unknown) => { noticeHtml: string })({ locals: { locale: 'en' } });
		expect(data.noticeHtml).toContain('BitLocker');
		expect(data.noticeHtml).not.toContain('<script');
	});

	it('refuses without the checkbox (and reports other problems at the same time)', async () => {
		const r = await call({ username: 'boss', displayName: 'Boss', password: PW, confirm: 'different' });
		expect(isActionFailure(r)).toBe(true);
		const errors = (r as { data: { errors: Record<string, string> } }).data.errors;
		expect(errors.acceptTerms).toMatch(/Terms of Use/);
		expect(errors.confirm).toBeTruthy();
		expect(needsSetup(getDb())).toBe(true);
	});

	it('creates the admin and audits setup.terms_accepted with the version', async () => {
		try {
			await call({ username: 'boss', displayName: 'Boss', password: PW, confirm: PW, acceptTerms: 'yes' });
			throw new Error('expected a redirect');
		} catch (e) {
			expect(isRedirect(e)).toBe(true);
		}
		expect(needsSetup(getDb())).toBe(false);
		const row = searchAudit(getDb(), { action: 'setup.terms_accepted' }).rows[0];
		expect(JSON.stringify(row)).toContain(APP_VERSION);
	});
});
