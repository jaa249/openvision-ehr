import { json, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { getDb } from '#lib/server/db.ts';
import { SESSION_COOKIE, isBackgroundRequest, needsSetup, resolveSession, routeKind } from '#lib/server/auth.ts';
import { securityAudit } from '#lib/server/security_audit.ts';
import { SHELL_HEADER, SHELL_REFUSED, shellTokenOk } from '#lib/server/shell.ts';
import { LANG_COOKIE, resolveLocale } from '#lib/server/i18n.ts';
import { localeDir, localeTag } from '#lib/i18n/locales.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CHART_PAGE = /^\/patients\/(\d+)$/;
const EXAM_PAGE = /^\/patients\/(\d+)\/encounters\/(\d+)$/;

/** Chart access audit (164.312(b)): a successful GET of a chart or exam page (full load or client navigation). */
function auditChartView(db: ReturnType<typeof getDb>, userId: number, path: string): void {
	const exam = EXAM_PAGE.exec(path);
	const chart = exam ? null : CHART_PAGE.exec(path);
	if (!exam && !chart) return;
	try {
		if (exam) securityAudit(db, { action: 'view_exam', userId, patientId: Number(exam[1]), encounterId: Number(exam[2]) });
		else if (chart) securityAudit(db, { action: 'view_patient', userId, patientId: Number(chart[1]) });
	} catch (e) {
		console.error('audit: could not record chart view', e);
	}
}

function secure(response: Response, signedIn: boolean): Response {
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	// Signed-in pages carry patient data: keep them out of shared caches and the back-forward disk cache.
	if (signedIn && !response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store');
	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	// Desktop app (D51): only the app's own window may use its local port. A no-op unless OPENVISION_SHELL_TOKEN is set.
	if (!shellTokenOk(event.request.headers.get(SHELL_HEADER))) {
		return new Response(SHELL_REFUSED, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
	}

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

	// Sign-in: the ov_session cookie resolves to a user (or nothing). Every non-public route needs one.
	const db = getDb();
	const token = event.cookies.get(SESSION_COOKIE);
	const path = event.url.pathname;
	// Background requests (lock heartbeat, session-status poll) read the session without extending it.
	const user = resolveSession(db, token, Date.now(), { touch: !isBackgroundRequest(event.request, path) });
	if (user) {
		event.locals.userId = user.id;
		event.locals.user = { id: user.id, displayName: user.displayName, role: user.role, username: user.username };
		event.locals.sessionToken = token;
		event.locals.mustChangePassword = user.mustChangePassword;
	}
	// The page language (D48): signed in, the user's choice, else the practice default; signed out, the
	// ov_lang cookie, else the browser's language during first-run setup, else the practice default.
	const locale = resolveLocale(db, user ? user.id : null, event.request.headers.get('accept-language'), event.cookies.get(LANG_COOKIE));
	event.locals.locale = locale;

	const kind = routeKind(path);
	if (!user && kind !== 'public') {
		if (token) event.cookies.delete(SESSION_COOKIE, { path: '/' }); // expired or revoked
		if (kind === 'api') return secure(json({ error: 'Sign in first' }, { status: 401 }), false);
		// Pages (and their data requests) go to sign-in and come back afterwards.
		redirect(303, needsSetup(db) ? '/setup' : `/login?next=${encodeURIComponent(path + event.url.search)}`);
	}

	// A temporary password (new account or admin reset) must be changed before anything else.
	if (user?.mustChangePassword && kind === 'page' && event.request.method === 'GET' && path !== '/settings/me') {
		redirect(303, '/settings/me?required=1');
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${localeTag(locale)}" dir="${localeDir(locale)}">`)
	});
	if (user && kind === 'page' && event.request.method === 'GET' && response.status === 200) auditChartView(db, user.id, path);
	return secure(response, !!user);
};
