import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole } from '#lib/server/auth.ts';
import { isNormalsSection, normalsSections, resetNormals, saveNormals, SettingsError } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

// Providers (and admins): the values the "Normal" buttons and the D shorthand write (spec §3.1).
export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals, 'provider', 'admin');
	return { sections: normalsSections(getDb(), locals.userId) };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export const actions: Actions = {
	save: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const db = getDb();
		const f = await request.formData();
		const section = str(f.get('section'));
		if (!isNormalsSection(db, locals.userId, section)) return fail(400, { section, errors: { form: 'Unknown section.' } as Record<string, string>, values: {} as Record<string, string> });
		const values: Record<string, string> = {};
		for (const [k, v] of f.entries()) if (k.startsWith('f:')) values[k.slice(2)] = str(v);
		try {
			saveNormals(db, locals.userId, section, values);
		} catch (e) {
			if (e instanceof SettingsError) return fail(400, { section, errors: e.errors, values: values as Record<string, string> });
			throw e;
		}
		return { section, ok: true, message: 'Saved.' };
	},
	reset: async ({ request, locals }) => {
		requireRole(locals, 'provider', 'admin');
		const db = getDb();
		const section = str((await request.formData()).get('section'));
		if (section === 'all') resetNormals(db, locals.userId);
		else if (isNormalsSection(db, locals.userId, section)) resetNormals(db, locals.userId, section);
		else return fail(400, { section, errors: { form: 'Unknown section.' } as Record<string, string>, values: {} as Record<string, string> });
		return { section, ok: true, message: 'Starter values restored.' };
	}
};
