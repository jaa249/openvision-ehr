'use strict';
// The per-launch shell token (D51). The app window's session adds it to every request to the app's
// own port; the in-process server refuses requests without it (here for static files, and again in
// hooks.server.ts for every SvelteKit route). Other programs and browsers on the computer never see it.
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const HEADER = 'x-openvision-shell';
const REFUSED = 'Open OpenVision from its desktop app.';

/** A new random 32-byte token, base64url. */
function makeToken() {
	return randomBytes(32).toString('base64url');
}

const digest = (s) => createHash('sha256').update(s, 'utf8').digest();

/** Constant-time check of a request's header value (string, array or undefined) against the token. */
function tokenMatches(sent, expected) {
	if (!expected) return true;
	if (Array.isArray(sent)) sent = sent.length === 1 ? sent[0] : undefined;
	if (typeof sent !== 'string' || sent.length === 0) return false;
	return timingSafeEqual(digest(sent), digest(expected));
}

module.exports = { HEADER, REFUSED, makeToken, tokenMatches };
