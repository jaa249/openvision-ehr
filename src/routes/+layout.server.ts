import type { LayoutServerLoad } from './$types';

/** The signed-in user for the header (null on /login and /setup), and the page language (D48). */
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user ? { id: locals.user.id, displayName: locals.user.displayName, role: locals.user.role } : null,
	locale: locals.locale
});
