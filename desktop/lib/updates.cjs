'use strict';
// Updates (D41, D51): electron-updater against this project's GitHub Releases (publish settings in
// builder.config.cjs end up in resources\app-update.yml). Checked at start and from Help › Check for
// updates. A downloaded update is never installed behind anyone's back: the user picks "Restart now"
// or "Later" (installed when OpenVision closes). Either way a backup of the database is taken first;
// if the backup fails the update waits.
//
// Only the installed app checks (a development run has no app-update.yml). OPENVISION_UPDATES=off
// turns checking off (tests, or a practice that updates by hand).

/**
 * Before 1.0 every release is published as a GitHub pre-release, so a 0.x app must follow pre-releases or
 * it would never see the next version. From 1.0 on, the app follows full releases only.
 */
function followsPrereleases(version) {
	return /^0./.test(String(version));
}

/**
 * backup(): writes a pre-update backup and returns its path (throws on failure).
 * shutdown(): stops the server, calls backupBeforeInstall, closes the database; resolves to its result.
 */
function createUpdates({ app, dialog, log, getWindow, enabled, backup, shutdown, markShutdownDone }) {
	let updater = null;
	let ready = null; // the downloaded update's info
	let manualCheck = false;

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
		const backedUp = await shutdown();
		markShutdownDone();
		if (!backedUp) {
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
		/** Background check at start (quiet), or from the menu (says what happened). */
		check(manual = false) {
			if (!updater) {
				if (manual) info(enabled ? 'Updates are not available in this copy of OpenVision.' : 'Update checks are turned off (development copy, or OPENVISION_UPDATES=off).');
				return;
			}
			if (manual && ready) return void offerRestart();
			manualCheck = manual;
			updater.checkForUpdates().catch((e) => log.error('update check failed:', e));
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

module.exports = { createUpdates, followsPrereleases };
