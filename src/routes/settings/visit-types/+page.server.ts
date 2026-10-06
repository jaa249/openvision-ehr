import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { securityAudit } from '#lib/server/security_audit.ts';
import { addVisitType, listVisitTypes, moveVisitType, PatientValidationError, renameVisitType, setVisitTypeActive } from '#lib/server/patients.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin only: the list offered when starting a visit. Past visits keep the name they were saved with.
export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals, 'admin');
	return { types: listVisitTypes(getDb()) };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

async function run(locals: App.Locals, request: Request, section: string, fn: (f: FormData, id: number) => Record<string, unknown> | void) {
	requireRole(locals, 'admin');
	const f = await request.formData();
	const id = Number(str(f.get('id')));
	try {
		const detail = fn(f, id) ?? {};
		securityAudit(getDb(), { action: 'settings.visit_types', userId: locals.userId, detail: { change: section, ...detail } });
	} catch (e) {
		if (e instanceof PatientValidationError) return fail(400, { section, id, errors: e.errors, name: str(f.get('name')) });
		throw e;
	}
	return { section, id, ok: true };
}

export const actions: Actions = {
	add: ({ locals, request }) =>
		run(locals, request, 'add', (f) => {
			const id = addVisitType(getDb(), str(f.get('name')));
			return { id, name: str(f.get('name')).trim() };
		}),
	rename: ({ locals, request }) =>
		run(locals, request, 'rename', (f, id) => {
			const before = listVisitTypes(getDb()).find((t) => t.id === id)?.name;
			if (!renameVisitType(getDb(), id, str(f.get('name')))) throw new PatientValidationError({ form: 'That visit type was not found.' });
			return { id, from: before, to: str(f.get('name')).trim() };
		}),
	hide: ({ locals, request }) =>
		run(locals, request, 'hide', (_f, id) => {
			if (!setVisitTypeActive(getDb(), id, false)) throw new PatientValidationError({ form: 'That visit type was not found.' });
			return { id };
		}),
	show: ({ locals, request }) =>
		run(locals, request, 'show', (_f, id) => {
			if (!setVisitTypeActive(getDb(), id, true)) throw new PatientValidationError({ form: 'That visit type was not found.' });
			return { id };
		}),
	up: ({ locals, request }) =>
		run(locals, request, 'up', (_f, id) => {
			moveVisitType(getDb(), id, -1);
			return { id };
		}),
	down: ({ locals, request }) =>
		run(locals, request, 'down', (_f, id) => {
			moveVisitType(getDb(), id, 1);
			return { id };
		})
};
