// GET: acuity values of this patient's visits BEFORE this exam (spec §8.2; same scoping as priors §6.1).
// The panel adds the current exam's live values itself and builds the table with buildVaHistory.
import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getEncounter, getPriors } from '#lib/server/exam.ts';
import { VA_HISTORY_FIELDS } from '#lib/exam/va_history.ts';
import type { Findings } from '#lib/shorthand/parse.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid) || pid <= 0 || eid <= 0) error(404, 'Not found');
	const db = getDb();
	const current = getEncounter(db, pid, eid);
	const priors = current ? getPriors(db, pid, eid, 200) : null;
	if (!current || !priors) error(404, 'Not found');
	return json({
		current: { id: current.id, date: current.date, visitType: current.visitType },
		visits: priors.map((p) => {
			const findings: Findings = {};
			for (const id of VA_HISTORY_FIELDS) if (p.findings[id]?.value?.trim()) findings[id] = p.findings[id];
			return { id: p.id, date: p.date, visitType: p.visitType, findings };
		})
	});
};
