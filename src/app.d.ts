// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/**
			 * Set by hooks.server.ts from the ov_session cookie. Every route except the public ones
			 * (/login, /setup, /logout, static files) is only reached when these are set.
			 */
			userId: number;
			/** The signed-in user. Roles: admin (settings, users), provider (signs exams), tech (exam entry). */
			user: { id: number; displayName: string; role: 'admin' | 'provider' | 'tech'; username?: string };
			/** The raw session cookie value (for sign-out and "sign out other sessions" on password change). */
			sessionToken?: string;
			/** True while the user still has a temporary password; pages redirect to /settings/me until changed. */
			mustChangePassword?: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
