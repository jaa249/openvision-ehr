import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { requireRole, shownDemoAccounts } from '#lib/server/auth.ts';
import { createUser, listUsers, resetPassword, setUserActive, setUserRole, UserError } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

// Admin only. One account per person (no shared logins). Emergency access: any admin can reset any
// user's password here; if no admin can sign in, run `node scripts/reset-admin.mjs <username>` on the server.
export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals, 'admin');
	const db = getDb();
	return { users: listUsers(db), meId: locals.userId, demoStillOpen: (await shownDemoAccounts(db)).map((d) => d.username) };
};

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const idOf = (f: FormData) => Number(str(f.get('id')));

function failWith(e: unknown, section: string, id: number | null, values?: Record<string, string>) {
	if (e instanceof UserError) return fail(400, { section, id, errors: e.errors, values });
	throw e;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const f = await request.formData();
		const values = { username: str(f.get('username')), displayName: str(f.get('displayName')), role: str(f.get('role')) };
		try {
			await createUser(getDb(), { ...values, password: str(f.get('password')) }, { actorId: locals.userId });
		} catch (e) {
			return failWith(e, 'create', null, values);
		}
		return { section: 'create', ok: true, message: `Added ${values.username}. Give them the temporary password; they choose their own at first sign-in.` };
	},

	deactivate: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const id = idOf(await request.formData());
		try {
			setUserActive(getDb(), locals.userId, id, false);
		} catch (e) {
			return failWith(e, 'row', id);
		}
		return { section: 'row', id, ok: true, message: 'Deactivated and signed out everywhere.' };
	},

	reactivate: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const id = idOf(await request.formData());
		try {
			setUserActive(getDb(), locals.userId, id, true);
		} catch (e) {
			return failWith(e, 'row', id);
		}
		return { section: 'row', id, ok: true, message: 'Reactivated.' };
	},

	role: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const f = await request.formData();
		const id = idOf(f);
		try {
			setUserRole(getDb(), locals.userId, id, str(f.get('role')));
		} catch (e) {
			return failWith(e, 'row', id);
		}
		return { section: 'row', id, ok: true, message: 'Role changed.' };
	},

	reset: async ({ request, locals }) => {
		requireRole(locals, 'admin');
		const f = await request.formData();
		const id = idOf(f);
		try {
			await resetPassword(getDb(), locals.userId, id, str(f.get('password')));
		} catch (e) {
			return failWith(e, 'row', id);
		}
		return { section: 'row', id, ok: true, message: 'Temporary password set; they must change it at next sign-in. Their sessions were ended.' };
	}
};
