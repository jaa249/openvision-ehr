// The desktop shell token (D51). The Windows app runs this server inside its own process on a random
// 127.0.0.1 port and adds a per-launch random token to every request it makes (header
// X-OpenVision-Shell). When OPENVISION_SHELL_TOKEN is set, a request without that token is refused,
// so another program or a browser on the same computer cannot use the app's port. Unset (development,
// tests, `node build`), nothing changes.
//
// The desktop server (desktop/server.cjs) applies the same check before static files, which never
// reach hooks.server.ts; this copy keeps every SvelteKit route covered on its own.
import { createHash, timingSafeEqual } from 'node:crypto';

export const SHELL_HEADER = 'x-openvision-shell';
export const SHELL_REFUSED = 'Open OpenVision from its desktop app.';

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** True when no token is configured, or the request carries the configured one (constant-time compare). */
export function shellTokenOk(sent: string | null | undefined, expected: string | undefined = process.env.OPENVISION_SHELL_TOKEN): boolean {
	if (!expected) return true;
	if (typeof sent !== 'string' || sent.length === 0) return false;
	// Hashing first gives equal-length buffers, so neither the length nor the content leaks through timing.
	return timingSafeEqual(digest(sent), digest(expected));
}
