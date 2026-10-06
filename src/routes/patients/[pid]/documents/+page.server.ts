import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getPatientHeader } from '#lib/server/exam.ts';
import { listCategories, listDocuments } from '#lib/server/documents.ts';
import { localToday } from '#lib/server/patients.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const pid = Number(params.pid);
	if (!Number.isSafeInteger(pid) || pid < 1) error(404, 'Not found');
	const db = getDb();
	const patient = getPatientHeader(db, pid);
	if (!patient) error(404, 'Not found');
	return {
		patient: { id: patient.id, name: patient.name, mrn: patient.mrn, dob: patient.dob },
		documents: listDocuments(db, pid) ?? [],
		categories: listCategories(db),
		visits: (
			db.prepare('SELECT id, date, visit_type FROM encounters WHERE patient_id = ?').all(pid) as { id: number; date: string; visit_type: string }[]
		).map((v) => ({ id: v.id, date: v.date, visitType: v.visit_type })),
		today: localToday()
	};
};
