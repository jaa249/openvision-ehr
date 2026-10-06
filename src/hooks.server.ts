import type { Handle } from '@sveltejs/kit/hooks';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle: Handle = async ({ event, resolve }) => {
	// SvelteKit's built-in origin check only covers form posts. Our API takes JSON,
	// so every state-changing request must come from this app's own origin.
	if (MUTATING.has(event.request.method)) {
		// Compare hosts, not full origins: behind plain-http local installs the adapter
		// reports https, but another site can never forge our host in the Origin header.
		const origin = event.request.headers.get('origin');
		let originHost: string | null = null;
		try {
			originHost = origin ? new URL(origin).host : null;
		} catch {
			originHost = null;
		}
		if (!originHost || originHost !== event.url.host) {
			return new Response('Cross-site request blocked', { status: 403 });
		}
	}

	// Single-user build: sign-in arrives in a later release. Until then every request
	// acts as the seeded provider, and the server should only listen on localhost.
	event.locals.userId = 1;

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	return response;
};
