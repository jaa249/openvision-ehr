import type { LayoutServerLoad } from './$types';

/** The signed-in user for the header (null on /login and /setup). */
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user ? { id: locals.user.id, displayName: locals.user.displayName, role: locals.user.role } : null
});
