import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { getSuperbill } from '#lib/server/coding.ts';
import { usBillingOn } from '#lib/server/settings.ts';
import type { PageServerLoad } from './$types';

// Read-only: the superbill prints the coding lines the provider saved in the Coding panel.
// No superbill while US billing is off (D45); saved lines stay in the database.
export const load: PageServerLoad = ({ params }) => {
	if (!usBillingOn(getDb())) error(404, 'Not found');
	const pid = Number(params.pid);
	const eid = Number(params.eid);
	if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(eid)) error(404, 'Not found');
	const bill = getSuperbill(getDb(), pid, eid);
	if (!bill) error(404, 'Not found');
	return bill;
};
