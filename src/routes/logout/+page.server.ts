import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.ts';
import { deleteSession, resolveSession, SESSION_COOKIE } from '#lib/server/auth.ts';
import { securityAudit } from '#lib/server/security_audit.ts';
import type { Actions, PageServerLoad } from './$types';

// Signing out is a POST (the header's "Sign out" form), so a link or prefetch can never sign anyone out.
export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		const db = getDb();
		const token = cookies.get(SESSION_COOKIE);
		const user = resolveSession(db, token, Date.now(), { touch: false });
		if (user) securityAudit(db, { action: 'auth.logout', userId: user.id });
		deleteSession(db, token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
