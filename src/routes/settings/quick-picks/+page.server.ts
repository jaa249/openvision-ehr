import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import {
	addPick,
	deletePick,
	isQpZone,
	listZone,
	movePick,
	QuickPickError,
	reorderZone,
	resetZone,
	updatePick,
	zoneRows
} from '#lib/server/quickpicks.ts';
import { QP_ZONES, type QpZone } from '#lib/exam/quickpicks.ts';
import { SECTION_DEF, type SectionId } from '#lib/exam/catalog.ts';
import type { Actions, PageServerLoad } from './$types';

// Providers (and admins): their own quick-pick lists per zone (spec §4.1 "pencil" editor).
const zoneOf = (raw: string | null): QpZone => (isQpZone(raw) ? raw : 'EXT');

export const load: PageServerLoad = ({ locals, url }) => {
	requireRole(locals, 'provider', 'admin');
	const zone = zoneOf(url.searchParams.get('zone'));
	return {
		zone,
		zones: QP_ZONES.map((z) => ({ id: z, label: SECTION_DEF.get(z as SectionId)?.title ?? z })),
		rows: zoneRows(zone),
		picks: listZone(getDb(), locals.userId, zone)
	};
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

async function read(request: Request) {
	const f = await request.formData();
	const zone = str(f.get('zone'));
	return {
		f,
		zone: isQpZone(zone) ? zone : null,
		id: Number(str(f.get('id'))),
		input: { row: str(f.get('row')), label: str(f.get('label')), text: str(f.get('text')), mode: str(f.get('mode')) }
	};
}

const badZone = () => fail(400, { section: 'form', id: null, errors: { form: 'Unknown list.' } as Record<string, string> });

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone, input } = await read(request);
		if (!zone) return badZone();
		try {
			addPick(getDb(), locals.userId, zone, input);
		} catch (e) {
			if (e instanceof QuickPickError) return fail(400, { section: 'add', id: null, errors: e.errors, values: input });
			throw e;
		}
		return { section: 'add', id: null, ok: true, message: `Added "${input.label.trim()}".` };
	},
	update: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone, id, input } = await read(request);
		if (!zone) return badZone();
		try {
			if (!updatePick(getDb(), locals.userId, zone, id, input)) return fail(404, { section: 'row', id, errors: { form: 'That pick was not found.' } as Record<string, string> });
		} catch (e) {
			if (e instanceof QuickPickError) return fail(400, { section: 'row', id, errors: e.errors, values: input });
			throw e;
		}
		return { section: 'row', id, ok: true, message: 'Saved.' };
	},
	delete: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone, id } = await read(request);
		if (!zone) return badZone();
		deletePick(getDb(), locals.userId, zone, id);
		return { section: 'list', id: null, ok: true, message: 'Deleted.' };
	},
	up: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone, id } = await read(request);
		if (!zone) return badZone();
		movePick(getDb(), locals.userId, zone, id, -1);
		return { section: 'move', id, ok: true };
	},
	down: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone, id } = await read(request);
		if (!zone) return badZone();
		movePick(getDb(), locals.userId, zone, id, 1);
		return { section: 'move', id, ok: true };
	},
	reorder: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone, f } = await read(request);
		if (!zone) return badZone();
		const ids = str(f.get('ids')).split(',').map(Number);
		if (!reorderZone(getDb(), locals.userId, zone, ids)) {
			return fail(409, { section: 'list', id: null, errors: { form: 'The list changed elsewhere. The page has been refreshed; try again.' } as Record<string, string> });
		}
		return { section: 'list', id: null, ok: true, message: 'Order saved.' };
	},
	reset: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const { zone } = await read(request);
		if (!zone) return badZone();
		resetZone(getDb(), locals.userId, zone);
		return { section: 'list', id: null, ok: true, message: 'Starter list restored.' };
	}
};
