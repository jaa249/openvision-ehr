'use strict';
// Where the app window may go (D51). Pure functions; main.cjs wires them to will-navigate and
// setWindowOpenHandler.
//
//   the app's own origin            stays in the app (same window, or a child window for window.open)
//   https: anywhere else            opens in the default browser (shell.openExternal), never in the app
//   anything else                   denied (http elsewhere, file:, javascript:, data:, custom protocols)
//
// window.open('about:blank') is allowed as a child window: the exam opens the print view that way
// (an empty window first, while the click still counts, then it sets the address). The child window
// has the same navigation rules, so it can only ever show the app or nothing.

/** 'app' | 'external' | 'deny' for a navigation of an existing window. */
function classifyNavigation(target, appOrigin) {
	let u;
	try {
		u = new URL(target);
	} catch {
		return 'deny';
	}
	if (u.origin === appOrigin) return 'app';
	if (u.protocol === 'https:' && u.hostname) return 'external';
	return 'deny';
}

/** 'child' | 'external' | 'deny' for window.open / target=_blank links. */
function classifyWindowOpen(target, appOrigin) {
	if (target === 'about:blank') return 'child';
	const kind = classifyNavigation(target, appOrigin);
	return kind === 'app' ? 'child' : kind;
}

/** Permissions the app may use. None today; writing to the clipboard (sanitized) is harmless. */
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']);
function permissionAllowed(permission, requestingUrl, appOrigin) {
	return ALLOWED_PERMISSIONS.has(permission) && classifyNavigation(requestingUrl || '', appOrigin) === 'app';
}

module.exports = { classifyNavigation, classifyWindowOpen, permissionAllowed };
