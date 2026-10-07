// GET of a patient document writes the audit row the Settings audit view lists (#14).
process.env.OPENVISION_DB = ':memory:';

import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db.ts';
import { uploadDocument } from '#lib/server/documents.ts';
import { searchAudit } from '#lib/server/security_audit.ts';
import { GET } from './+server.ts';

const png = () =>
	Uint8Array.from(
		Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
	);

async function get(id: number, userId: number, download: boolean) {
	const url = new URL(`http://localhost/api/patients/1/documents/${id}${download ? '?download=1' : ''}`);
	const locals = { userId, user: { id: userId, displayName: 'x', role: 'tech' } } as App.Locals;
	return (GET as unknown as (e: unknown) => Promise<Response>)({ params: { pid: '1', id: String(id) }, url, locals });
}

describe('document GET is audited', () => {
	it('records a view and a download with the user, patient and document id only', async () => {
		const db = getDb();
		const doc = uploadDocument(db, 1, { category: 'FUNDUS_PHOTO', filename: 'secret-name.png', bytes: png() }, 1)!;
		expect((await get(doc.id, 2, false)).status).toBe(200);
		expect((await get(doc.id, 2, true)).headers.get('content-disposition')).toContain('attachment');
		const view = searchAudit(db, { action: 'document.view' }).rows;
		const dl = searchAudit(db, { action: 'document.download' }).rows;
		expect(view).toHaveLength(1);
		expect(dl).toHaveLength(1);
		expect(dl[0]).toMatchObject({ userId: 2, patientId: 1 });
		expect(JSON.parse(dl[0].detail)).toEqual({ document: doc.id });
		expect(dl[0].detail).not.toContain('secret-name');
	});
});
