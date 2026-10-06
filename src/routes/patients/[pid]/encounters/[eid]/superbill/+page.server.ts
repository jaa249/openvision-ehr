import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getSuperbill } from '#lib/server/coding.ts';
import type { PageServerLoad } from './$types';

// Read-only: the superbill prints the coding lines the provider saved in the Coding panel.
export const load: PageServerLoad = ({ params }) => {
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const bill = getSuperbill(getDb(), pid, eid);
	if (!bill) error(404, 'Not found');
	return bill;
};
