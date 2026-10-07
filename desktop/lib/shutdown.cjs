'use strict';
// Closing the app's windows on quit or "Restart now" (D51). A page with changes still being saved asks
// "Wait" / "Close anyway" (main.cjs, will-prevent-unload). "Wait" must win: the shutdown is called off
// and the server, the database and the sign-in stay as they were. A downloaded update then waits for
// the next normal close (its backup is taken then).

/** Event a window emits when its page was kept open by "Wait" (main.cjs emits it on the BrowserWindow). */
const KEPT_OPEN = 'openvision-kept-open';

/**
 * Asks every window to close and waits at most `ms`. Resolves { refused, open }: `refused` is true as
 * soon as any window was kept open (it does not wait for the others then); `open` counts the windows
 * not yet closed. Windows are EventEmitters with close() and isDestroyed() (BrowserWindow, or fakes).
 */
function closeAll(wins, ms = 3000) {
	const list = wins.filter((w) => !w.isDestroyed());
	if (!list.length) return Promise.resolve({ refused: false, open: 0 });
	return new Promise((resolve) => {
		let left = list.length;
		let settled = false;
		const cleanups = [];
		const finish = (refused) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			for (const off of cleanups) off();
			resolve({ refused, open: list.filter((w) => !w.isDestroyed()).length });
		};
		const timer = setTimeout(() => finish(false), ms);
		for (const w of list) {
			const onClosed = () => {
				if (--left === 0) finish(false);
			};
			const onKept = () => finish(true);
			w.once('closed', onClosed);
			w.once(KEPT_OPEN, onKept);
			cleanups.push(() => {
				w.removeListener('closed', onClosed);
				w.removeListener(KEPT_OPEN, onKept);
			});
		}
		for (const w of list) {
			if (settled) break; // a "Wait" answered synchronously: leave the remaining windows alone
			w.close();
		}
	});
}

/**
 * Whether the shutdown goes on after the windows were asked to close. Pure.
 * A window kept open by "Wait" cancels it. A window that is merely slow (a hung page, no answer within
 * the grace time) does not: it is closed with the app, as before.
 */
function shutdownDecision({ refused }) {
	return refused ? 'cancel' : 'proceed';
}

/**
 * What "Restart now" does with shutdown()'s result { cancelled, backedUp }. Pure.
 *   'stay'          a window was kept open: nothing stopped, the update installs on the next normal close
 *   'backup-failed' everything stopped, but the update must not install; the app quits
 *   'install'       quit and install
 */
function restartAction({ cancelled, backedUp }) {
	if (cancelled) return 'stay';
	return backedUp ? 'install' : 'backup-failed';
}

module.exports = { KEPT_OPEN, closeAll, shutdownDecision, restartAction };
