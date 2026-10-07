// The IOP target answer must not depend on who asks (finding #12): the visit provider's defaults apply.
process.env.OPENVISION_DB = ':memory:';

import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db.ts';
import { GET } from './+server.ts';
import { load } from '../+page.server.ts';

const as = (id: number, role: 'provider' | 'tech') => ({ userId: id, user: { id, displayName: 'x', role } }) as App.Locals;

async function targets(locals: App.Locals) {
	const url = new URL('http://localhost/patients/1/flowsheet/targets?encounter=1');
	const res = await (GET as unknown as (e: unknown) => Promise<Response>)({ params: { pid: '1' }, url, locals });
	return res.json();
}

describe('flow sheet targets are the same for every viewer', () => {
	it('provider and technician get the same fallback, flags and sheet', async () => {
		const db = getDb();
		db.prepare("DELETE FROM user_defaults WHERE field IN ('ODIOPTARGET', 'OSIOPTARGET')").run();
		// The visit's provider (user 1) keeps 15; the technician (user 2) has 25 in their own list.
		db.prepare("INSERT INTO user_defaults (user_id, field, value) VALUES (1, 'ODIOPTARGET', '15'), (2, 'ODIOPTARGET', '25')").run();
		const asProvider = await targets(as(1, 'provider'));
		const asTech = await targets(as(2, 'tech'));
		expect(asTech).toEqual(asProvider);
		expect(asProvider.fallback.OD).toEqual({ value: 15, source: 'provider', by: 'Dr. Example' });

		const page = (locals: App.Locals) =>
			(load as unknown as (e: unknown) => { sheet: { visits: unknown[]; targets: unknown }; exam: { fallback: unknown } })({
				params: { pid: '1' },
				url: new URL('http://localhost/patients/1/flowsheet?encounter=1'),
				locals
			});
		const p = page(as(1, 'provider'));
		const t = page(as(2, 'tech'));
		expect(t.sheet.visits).toEqual(p.sheet.visits);
		expect(t.sheet.targets).toEqual(p.sheet.targets);
		expect(t.exam.fallback).toEqual(p.exam.fallback);
	});
});
