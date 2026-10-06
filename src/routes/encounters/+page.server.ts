import { getDb } from '#lib/server/db.ts';
import { listEncounters } from '#lib/server/report.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const filter = {
		from: url.searchParams.get('from') ?? '',
		to: url.searchParams.get('to') ?? '',
		query: url.searchParams.get('q') ?? ''
	};
	return { filter, encounters: listEncounters(getDb(), filter) };
};
