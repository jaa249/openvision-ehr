'use strict';
// Updates (D41, D51): electron-updater against this project's GitHub Releases (publish settings in
// builder.config.cjs end up in resources\app-update.yml). Checked 10 s after start, every 4 hours while
// the app runs, and from Help › Check for updates. A downloaded update is never installed behind anyone's back: the user picks "Restart now"
// or "Later" (installed when OpenVision closes). Either way a backup of the database is taken first;
// if the backup fails the update waits. A window kept open with "Wait" (changes still saving) calls
// "Restart now" off; the update then installs on the next normal close.
//
// Only the installed app checks (a development run has no app-update.yml). OPENVISION_UPDATES=off
// turns checking off (tests, or a practice that updates by hand).

const { restartAction } = require('./shutdown.cjs');

/**
 * Before 1.0 every release is published as a GitHub pre-release, so a 0.x app must follow pre-releases or
 * it would never see the next version. From 1.0 on, the app follows full releases only.
 */
function followsPrereleases(version) {
	return /^0\./.test(String(version));
}

/** How often a running app looks for a new version (a clinic computer may stay open for weeks). */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 10_000;

/**
 * Whether a scheduled (quiet) check should run now: not while one is already running, and not once an
 * update has been downloaded and is waiting for "Restart now" or the next close.
 */
function shouldCheckNow({ ready, checking }) {
	return !ready && !checking;
}

/**
 * Checks FIRST_CHECK_MS after start and then every CHECK_EVERY_MS while the app runs. Returns stop().
 * Timers are injectable for tests.
 */
function scheduleChecks(run, { setTimeoutFn = setTimeout, setIntervalFn = setInterval, clearTimeoutFn = clearTimeout, clearIntervalFn = clearInterval } = {}) {
	let interval = null;
	const first = setTimeoutFn(() => {
		run();
		interval = setIntervalFn(run, CHECK_EVERY_MS);
	}, FIRST_CHECK_MS);
	return () => {
		clearTimeoutFn(first);
		if (interval) clearIntervalFn(interval);
	};
}

/**
 * backup(): writes a pre-update backup and returns its path (throws on failure).
 * shutdown(): stops the server, calls backupBeforeInstall, closes the database; resolves
 *   { cancelled, backedUp } (cancelled: a window was kept open and nothing was stopped).
 */
function createUpdates({ app, dialog, log, getWindow, enabled, backup, shutdown, markShutdownDone }) {
	let updater = null;
	let ready = null; // the downloaded update's info
	let manualCheck = false;
	let checking = false; // a check is running

	if (enabled) {
		try {
			({ autoUpdater: updater } = require('electron-updater'));
			updater.autoDownload = true;
			updater.autoInstallOnAppQuit = false; // set to true on quit, after the backup
			updater.allowPrerelease = followsPrereleases(app.getVersion());
			updater.logger = { info: (m) => log.info('update:', m), warn: (m) => log.warn('update:', m), error: (m) => log.error('update:', m), debug() {} };
			updater.on('update-not-available', () => {
				if (manualCheck) info(`OpenVision is up to date (version ${app.getVersion()}).`);
				manualCheck = false;
			});
			updater.on('update-available', (i) => {
				log.info(`update ${i.version} available, downloading`);
				if (manualCheck) info(`Version ${i.version} is being downloaded. You will be asked before it is installed.`);
				manualCheck = false;
			});
			updater.on('error', (e) => {
				log.error('update check failed:', e);
				if (manualCheck) info('Could not check for updates. Check the internet connection and try again later.', 'warning');
				manualCheck = false;
			});
			updater.on('update-downloaded', (i) => {
				ready = i;
				log.info(`update ${i.version} downloaded`);
				void offerRestart();
			});
		} catch (e) {
			log.error('updater unavailable:', e);
			updater = null;
		}
	}

	function info(message, type = 'info') {
		const win = getWindow();
		const opts = { type, title: 'OpenVision', message, buttons: ['OK'] };
		return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
	}

	async function offerRestart() {
		const win = getWindow();
		const opts = {
			type: 'info',
			title: 'OpenVision',
			message: `Update ready: OpenVision ${ready.version}`,
			detail:
				'Restart now to install it. Make sure nobody is in the middle of an exam on this computer first.\n\nChoose Later to keep working; the update is installed when OpenVision is closed. A backup of the database is taken before installing.',
			buttons: ['Restart now', 'Later'],
			defaultId: 1,
			cancelId: 1,
			noLink: true
		};
		const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
		if (r.response === 0) await restartNow();
	}

	/** Stops the server, backs up (inside shutdown), then installs and restarts. */
	async function restartNow() {
		const action = restartAction(await shutdown());
		if (action === 'stay') {
			log.info('restart for the update called off; it installs when OpenVision is closed');
			await info(
				'The update was not installed yet because a window still has changes being saved. Keep working; the update is installed when OpenVision is closed.'
			);
			return;
		}
		markShutdownDone();
		if (action === 'backup-failed') {
			dialog.showErrorBox('OpenVision', `The update was not installed because the database backup failed. See the log:
${log.file}`);
			app.quit();
			return;
		}
		updater.quitAndInstall(false, true);
	}

	return {
		get available() {
			return !!updater;
		},
		get pending() {
			return ready;
		},
		/** Background check (quiet: at start and every few hours), or from the menu (says what happened). */
		check(manual = false) {
			if (!updater) {
				if (manual) info(enabled ? 'Updates are not available in this copy of OpenVision.' : 'Update checks are turned off (development copy, or OPENVISION_UPDATES=off).');
				return;
			}
			if (manual && ready) return void offerRestart();
			if (!manual && !shouldCheckNow({ ready, checking })) return;
			manualCheck = manual;
			checking = true;
			updater
				.checkForUpdates()
				.catch((e) => log.error('update check failed:', e))
				.finally(() => {
					checking = false;
				});
		},
		/** Quiet checks 10 s after start and every 4 hours while the app runs. Returns stop(). */
		schedule() {
			return updater ? scheduleChecks(() => this.check(false)) : () => {};
		},
		/**
		 * Called by shutdown after the server stopped and before the database closes: when an update is
		 * waiting, takes the pre-update backup and allows the install only if it worked. Returns false
		 * when the backup failed.
		 */
		backupBeforeInstall() {
			if (!updater || !ready) return true;
			let ok = false;
			try {
				const file = backup();
				log.info('pre-update backup written:', require('node:path').basename(file));
				ok = true;
			} catch (e) {
				log.error('pre-update backup failed; the update is not installed:', e);
			}
			updater.autoInstallOnAppQuit = ok;
			return ok;
		}
	};
}

module.exports = { createUpdates, followsPrereleases, shouldCheckNow, scheduleChecks, CHECK_EVERY_MS, FIRST_CHECK_MS };
