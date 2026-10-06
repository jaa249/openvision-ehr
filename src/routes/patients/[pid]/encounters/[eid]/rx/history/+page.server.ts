import { error, fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getPatientHeader } from '#lib/server/exam.ts';
import { deleteDispense, listDispensed } from '#lib/server/rx.ts';
import type { Actions, PageServerLoad } from './$types';

function scope(params: { pid: string; eid: string }) {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const db = getDb();
	const patient = getPatientHeader(db, pid);
	const encounter = patient ? getEncounter(db, pid, eid) : null;
	if (!patient || !encounter) error(404, 'Not found');
	return { db, pid, patient, encounter };
}

/** Every Rx printed for this patient, newest first (spec §12.6). */
export const load: PageServerLoad = ({ params }) => {
	const { db, pid, patient, encounter } = scope(params);
	return { patient, encounter, records: listDispensed(db, pid) };
};

export const actions: Actions = {
	/** Soft delete (FIX: delete works), only within this patient's records. */
	delete: async ({ params, request, locals }) => {
		const { db, pid } = scope(params);
		const id = Number((await request.formData()).get('id'));
		if (!Number.isSafeInteger(id) || id <= 0) return fail(400, { message: 'Unknown record' });
		if (!deleteDispense(db, pid, id, locals.userId)) return fail(404, { message: 'That record was not found or is already deleted.' });
		return { deleted: id };
	}
};
