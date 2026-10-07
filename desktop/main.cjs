'use strict';
// OpenVision for Windows (D51): an Electron window around the same web app the browser build serves.
//
// Start-up: one instance per Windows user → data folder check (C:\ProgramData\OpenVision, or
// OPENVISION_DATA_DIR) → log → environment for the server → the SvelteKit server inside this process
// on 127.0.0.1, random port (server.cjs) → the database is opened (migrations) → window.
// Every request from the app's windows carries the per-launch shell token, so other programs on the
// computer cannot use the port. Exit: windows close → server stops (≤ 3 s for open requests) →
// pre-update backup if an update is waiting → database checkpointed and closed → quit. A window kept
// open with "Wait" (changes still saving) calls the whole exit off (lib/shutdown.cjs).
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell, screen } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { resolveDataDir, dataLayout, prepareDataDir, clearTmp } = require('./lib/paths.cjs');
const { classifyNavigation, classifyWindowOpen, permissionAllowed } = require('./lib/navigation.cjs');
const { HEADER, makeToken } = require('./lib/shelltoken.cjs');
const { createLogger } = require('./lib/log.cjs');
const { pdfPageSize, pdfFileName, validIds } = require('./lib/pdf.cjs');
const { takePreUpdateBackup } = require('./lib/backups.cjs');
const windowState = require('./lib/windowstate.cjs');
const { createUpdates } = require('./lib/updates.cjs');
const { KEPT_OPEN, closeAll, shutdownDecision } = require('./lib/shutdown.cjs');
const { checkDiskEncryption } = require('./lib/bitlocker.cjs');
const { start } = require('./server.cjs');

const PACKAGED = app.isPackaged;
const DEV_TOOLS = !PACKAGED || process.env.OPENVISION_DEVTOOLS === '1';
const VERSION = app.getVersion();
const BACKGROUND = '#f4f5f7';

let layout = null;
let log = null;
let srv = null;
let appOrigin = '';
let mainWindow = null;
let updates = null;
let stopUpdateChecks = () => {}; // the periodic update checks (updates.schedule)
let shutdownPromise = null;
let shutdownDone = false;

// ---------------------------------------------------------------- helpers

function resourcePath(...parts) {
	return PACKAGED ? path.join(process.resourcesPath, ...parts) : path.join(__dirname, ...parts);
}
function handlerPath() {
	return PACKAGED ? path.join(process.resourcesPath, 'web', 'handler.js') : path.join(__dirname, '..', 'build', 'handler.js');
}
function iconPath() {
	const p = path.join(__dirname, 'build', 'icon.png');
	return fs.existsSync(p) ? p : undefined;
}
/** The database functions db.ts registers for the shell (open, backup, close); null before the server loaded. */
function dbHook() {
	return globalThis[Symbol.for('openvision.db')] ?? null;
}
function owner() {
	return BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
}
function message(opts) {
	const win = owner();
	return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
}

function webPreferences(extra = {}) {
	return {
		preload: path.join(__dirname, 'preload.cjs'),
		contextIsolation: true,
		sandbox: true,
		nodeIntegration: false,
		webSecurity: true,
		devTools: DEV_TOOLS,
		navigateOnDragDrop: false,
		additionalArguments: [`--openvision-version=${VERSION}`],
		...extra
	};
}

// ---------------------------------------------------------------- windows and their rules

/** Navigation, new windows, context menu and dev tools rules for every page the app shows. */
function guard(wc) {
	wc.on('will-navigate', (e, url) => {
		const kind = classifyNavigation(url, appOrigin);
		if (kind === 'app') return;
		e.preventDefault();
		if (kind === 'external') void shell.openExternal(url);
		else log.warn('blocked a navigation away from the app');
	});
	wc.on('will-redirect', (e, url) => {
		if (classifyNavigation(url, appOrigin) !== 'app') {
			e.preventDefault();
			log.warn('blocked a redirect away from the app');
		}
	});
	wc.setWindowOpenHandler(({ url }) => {
		const kind = classifyWindowOpen(url, appOrigin);
		if (kind === 'child') {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					width: 1100,
					height: 850,
					minWidth: 600,
					minHeight: 500,
					title: 'OpenVision',
					backgroundColor: BACKGROUND,
					icon: iconPath(),
					autoHideMenuBar: true,
					webPreferences: webPreferences()
				}
			};
		}
		if (kind === 'external') void shell.openExternal(url);
		else log.warn('blocked a window that was not part of the app');
		return { action: 'deny' };
	});
	wc.on('did-create-window', (child) => {
		child.on('page-title-updated', (e) => e.preventDefault()); // titles carry patient names; the taskbar shows only "OpenVision"
		guard(child.webContents);
	});
	// An exam still saving asks before the page goes away (its beforeunload). Electron would just refuse silently.
	wc.on('will-prevent-unload', (e) => {
		const win = BrowserWindow.fromWebContents(wc);
		const choice = dialog.showMessageBoxSync(win ?? undefined, {
			type: 'warning',
			title: 'OpenVision',
			message: 'Some changes are still being saved.',
			detail: 'Wait a moment, then close again. Close anyway and the last few seconds of typing may be lost.',
			buttons: ['Wait', 'Close anyway'],
			defaultId: 0,
			cancelId: 0,
			noLink: true
		});
		if (choice === 1) e.preventDefault(); // preventDefault here means: ignore beforeunload and close
		else win?.emit(KEPT_OPEN); // "Wait": a quit or "Restart now" in progress is called off (closeAll)
	});
	wc.on('context-menu', (_e, params) => {
		const items = [];
		for (const s of params.dictionarySuggestions || []) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
		if (items.length) items.push({ type: 'separator' });
		const f = params.editFlags;
		if (params.isEditable) items.push({ role: 'cut', enabled: f.canCut });
		if (params.isEditable || params.selectionText) items.push({ role: 'copy', enabled: f.canCopy });
		if (params.isEditable) items.push({ role: 'paste', enabled: f.canPaste });
		if (params.isEditable) items.push({ type: 'separator' }, { role: 'selectAll' });
		if (items.length) Menu.buildFromTemplate(items).popup();
	});
	if (!DEV_TOOLS) wc.on('devtools-opened', () => wc.closeDevTools());
	wc.on('render-process-gone', (_e, d) => log.error(`page process ended: ${d.reason}`));
}

function createMainWindow() {
	const userData = app.getPath('userData');
	const b = windowState.restoreBounds(
		windowState.load(userData),
		screen.getAllDisplays().map((d) => d.workArea)
	);
	mainWindow = new BrowserWindow({
		width: b.width,
		height: b.height,
		x: b.x,
		y: b.y,
		minWidth: windowState.MIN.width,
		minHeight: windowState.MIN.height,
		title: 'OpenVision',
		show: false,
		backgroundColor: BACKGROUND,
		icon: iconPath(),
		webPreferences: webPreferences()
	});
	if (b.maximized) mainWindow.maximize();
	mainWindow.on('page-title-updated', (e) => e.preventDefault());
	mainWindow.once('ready-to-show', () => mainWindow?.show());
	mainWindow.on('close', () => windowState.save(userData, mainWindow));
	mainWindow.on('closed', () => {
		mainWindow = null;
		app.quit(); // closing the main window ends the app, print windows included
	});
	guard(mainWindow.webContents);
	void mainWindow.loadURL(`${srv.url}/`);
}

/** Opens one of the app's own pages (terms, privacy, notice) in a child window. */
function openAppPage(pathname) {
	const win = new BrowserWindow({
		width: 900,
		height: 800,
		minWidth: 500,
		minHeight: 400,
		title: 'OpenVision',
		parent: mainWindow ?? undefined,
		backgroundColor: BACKGROUND,
		icon: iconPath(),
		autoHideMenuBar: true,
		webPreferences: webPreferences()
	});
	win.on('page-title-updated', (e) => e.preventDefault());
	guard(win.webContents);
	void win.loadURL(`${srv.url}${pathname}`);
}

// ---------------------------------------------------------------- print and PDF

// The exam page answers Ctrl+P by printing its report (not the editing screen). Other pages have no
// handler, so they get the normal print dialog.
const PRINT_PROBE = `(() => {
	const t = document.activeElement || document.body;
	const e = new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, bubbles: true, cancelable: true });
	t.dispatchEvent(e);
	return e.defaultPrevented;
})()`;

async function printFocused() {
	const win = owner();
	if (!win) return;
	try {
		const handled = await win.webContents.executeJavaScript(PRINT_PROBE, true);
		if (!handled) void win.webContents.executeJavaScript('window.print()', true);
	} catch (e) {
		log.error('print failed:', e);
	}
}

// Help › Keyboard shortcuts: the same event as the page's F1 / ? keys (openKeyboardHelp, D56).
async function keyboardHelp() {
	const win = owner();
	if (!win) return;
	try {
		await win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('openvision:keyboard-help', { detail: {} }))`, true);
	} catch (e) {
		log.error('keyboard help failed:', e);
	}
}

// Waits until the report's images (drawings) are decoded, at most 15 s, like the print page does.
const WAIT_IMAGES = `(async () => {
	const imgs = [...document.querySelectorAll('.sheets img')];
	await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 15000))]);
	return true;
})()`;

/** Renders /print?ids=… in a hidden window to PDF, asks where to save it, writes it, and audit-logs the print. */
async function savePdf(parent, ids, suggestedName) {
	const win = new BrowserWindow({
		show: false,
		webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, devTools: false }
	});
	guard(win.webContents);
	try {
		await win.loadURL(`${srv.url}/print?ids=${ids.join(',')}`);
		if (new URL(win.webContents.getURL()).pathname !== '/print') return { saved: false, error: 'not-available' }; // signed out meanwhile
		await win.webContents.executeJavaScript(WAIT_IMAGES);
		// Margins match the print page's @page rule (0.6in top/bottom, 0.7in sides).
		const pdf = await win.webContents.printToPDF({
			pageSize: pdfPageSize(app.getLocaleCountryCode()),
			printBackground: true,
			margins: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 }
		});
		const r = await dialog.showSaveDialog(parent, {
			title: 'Save PDF',
			defaultPath: path.join(app.getPath('documents'), pdfFileName(suggestedName)),
			filters: [{ name: 'PDF', extensions: ['pdf'] }]
		});
		if (r.canceled || !r.filePath) return { saved: false, canceled: true };
		fs.writeFileSync(r.filePath, pdf);
		// Same audit entry as a print (spec §12.4). Logged by the page itself, so it is the signed-in user's.
		const logged = await win.webContents
			.executeJavaScript(
				`fetch('/api/print-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ ids }))} }).then((r) => r.ok)`
			)
			.catch(() => false);
		if (!logged) log.warn('PDF saved but the print log entry failed');
		log.info(`PDF saved (${ids.length} visit${ids.length === 1 ? '' : 's'})`);
		return { saved: true };
	} catch (e) {
		log.error('PDF failed:', e);
		return { saved: false, error: 'failed' };
	} finally {
		win.destroy();
	}
}

// ---------------------------------------------------------------- downloads (CSV / FHIR exports)

// The file is written into data\tmp first (inside the protected folder), then moved where the user
// chooses in a normal Save dialog. Exports are already audit-logged by the server.
function handleDownloads(ses) {
	ses.on('will-download', (event, item, wc) => {
		if (classifyNavigation(item.getURL(), appOrigin) !== 'app') {
			event.preventDefault();
			log.warn('blocked a download from outside the app');
			return;
		}
		const tmp = path.join(layout.tmp, `${crypto.randomUUID()}.part`);
		const name = item.getFilename() || 'openvision-export';
		item.setSavePath(tmp);
		item.once('done', async (_e, state) => {
			const drop = () => fs.rmSync(tmp, { force: true });
			if (state !== 'completed') {
				drop();
				log.warn(`download ${state}`);
				return;
			}
			try {
				let parent = mainWindow ?? undefined;
				try {
					parent = (!wc.isDestroyed() && BrowserWindow.fromWebContents(wc)) || parent;
				} catch {
					// the page that started it is gone
				}
				const ext = path.extname(name).slice(1);
				const r = await dialog.showSaveDialog(parent, {
					title: 'Save',
					defaultPath: path.join(app.getPath('documents'), name),
					filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : []
				});
				if (r.canceled || !r.filePath) return drop();
				try {
					fs.renameSync(tmp, r.filePath);
				} catch {
					fs.copyFileSync(tmp, r.filePath); // another drive
					drop();
				}
				log.info('download saved');
			} catch (e) {
				drop();
				log.error('download could not be saved:', e);
				dialog.showErrorBox('OpenVision', 'The file could not be saved. Choose another folder and try again.');
			}
		});
	});
}

// ---------------------------------------------------------------- menu

function licenceFiles() {
	const exeDir = path.dirname(process.execPath);
	return {
		openvision: PACKAGED ? path.join(process.resourcesPath, 'LICENSE.txt') : path.join(__dirname, '..', 'LICENSE'),
		chromium: path.join(exeDir, 'LICENSES.chromium.html'),
		electron: path.join(exeDir, 'LICENSE' + (PACKAGED ? '.electron.txt' : ''))
	};
}

async function showLicences() {
	const f = licenceFiles();
	const r = await message({
		type: 'info',
		title: 'Licence notices',
		message: 'OpenVision is free software under the Apache License 2.0.',
		detail: 'It is built with Electron (MIT licence) and Chromium, whose notices list every included component.',
		buttons: ['OpenVision licence', 'Electron licence', 'Chromium notices', 'Close'],
		defaultId: 3,
		cancelId: 3,
		noLink: true
	});
	const file = [f.openvision, f.electron, f.chromium][r.response];
	if (file) {
		const err = await shell.openPath(file);
		if (err) log.warn('could not open a licence file:', err);
	}
}

function about() {
	return message({
		type: 'info',
		title: 'About OpenVision',
		message: `OpenVision ${VERSION}`,
		detail: [
			'Eye exam records for optometry and ophthalmology.',
			'Pre-release: not for real patient data until a clinical review.',
			'Free, open-source software (Apache License 2.0).',
			'https://github.com/jaa249/openvision-ehr',
			'',
			`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node.js ${process.versions.node}`,
			`Data folder: ${layout.root}`
		].join('\n'),
		buttons: ['OK']
	});
}

// Menu labels are English for now (follow-up: the user's app language). Edit shortcuts are shown but
// not registered, so Ctrl+Z / Ctrl+C … reach the page: text fields handle them natively and the exam
// keeps its own Ctrl+Z (bulk undo). Ctrl+P is registered and handed to the page (see printFocused).
function buildMenu() {
	const edit = (role, accelerator) => ({ role, accelerator, registerAccelerator: false });
	const template = [
		{
			label: '&File',
			submenu: [
				{ label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => void printFocused() },
				{ type: 'separator' },
				{ label: 'Close', accelerator: 'CmdOrCtrl+W', click: () => owner()?.close() }
			]
		},
		{
			label: '&Edit',
			submenu: [
				edit('undo', 'CmdOrCtrl+Z'),
				edit('redo', 'CmdOrCtrl+Y'),
				{ type: 'separator' },
				edit('cut', 'CmdOrCtrl+X'),
				edit('copy', 'CmdOrCtrl+C'),
				edit('paste', 'CmdOrCtrl+V'),
				edit('selectAll', 'CmdOrCtrl+A')
			]
		},
		{
			label: '&View',
			submenu: [
				{ role: 'zoomIn' },
				{ role: 'zoomOut' },
				{ role: 'resetZoom' },
				{ type: 'separator' },
				{ role: 'togglefullscreen' },
				...(DEV_TOOLS ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : [])
			]
		},
		{
			label: '&Help',
			submenu: [
				{ label: 'About OpenVision', click: () => void about() },
				// F1 is shown, not registered: the page gets the key itself (any page that has the help sheet).
				{ label: 'Keyboard shortcuts', accelerator: 'F1', registerAccelerator: false, click: () => void keyboardHelp() },
				{ type: 'separator' },
				{ label: 'Terms of Use', click: () => openAppPage('/legal/terms') },
				{ label: 'Privacy Policy', click: () => openAppPage('/legal/privacy') },
				{ label: 'Data safety notice', click: () => openAppPage('/legal/notice') },
				{ label: 'View licence notices', click: () => void showLicences() },
				{ type: 'separator' },
				{ label: 'Open data folder', click: () => void shell.openPath(layout.root) },
				{ label: 'Check for updates', click: () => updates?.check(true) }
			]
		}
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- IPC (preload.cjs)

function fromApp(event) {
	const frame = event.senderFrame;
	return !!frame && classifyNavigation(frame.url, appOrigin) === 'app';
}

function registerIpc() {
	ipcMain.handle('openvision:save-pdf', async (event, ids, suggestedName) => {
		if (!fromApp(event)) throw new Error('Not allowed');
		const list = validIds(ids);
		if (!list) return { saved: false, error: 'invalid' };
		const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
		return savePdf(parent, list, typeof suggestedName === 'string' ? suggestedName : undefined);
	});
	ipcMain.handle('openvision:check-updates', (event) => {
		if (!fromApp(event)) throw new Error('Not allowed');
		updates?.check(true);
	});
}

// ---------------------------------------------------------------- start and stop

function fatal(title, detail) {
	log?.error(`${title}: ${detail}`);
	dialog.showErrorBox(title, detail);
	shutdownDone = true;
	app.exit(1);
}

async function boot() {
	layout = dataLayout(resolveDataDir({ env: process.env, packaged: PACKAGED, appDir: __dirname }));
	const mustExist = PACKAGED && !process.env.OPENVISION_DATA_DIR;
	const ready = prepareDataDir(layout, { mustExist });
	if (!ready.ok) {
		const what =
			ready.reason === 'missing'
				? `The OpenVision data folder does not exist:\n${ready.path}\n\nRun the OpenVision installer again (it creates the folder).`
				: `OpenVision cannot write to its data folder:\n${ready.path}\n\nYour Windows account must be a member of the "OpenVision Users" group. Ask an administrator to add it (Computer Management › Local Users and Groups › Groups › OpenVision Users, or in an administrator command prompt: net localgroup "OpenVision Users" <your Windows user name> /add), then sign out of Windows and back in.`;
		dialog.showErrorBox('OpenVision cannot start', what);
		shutdownDone = true;
		app.exit(1);
		return;
	}
	log = createLogger(layout.logFile, { echo: !PACKAGED });
	log.info(`OpenVision ${VERSION} starting (Electron ${process.versions.electron}, ${PACKAGED ? 'installed' : 'development'})`);
	// Only leftovers older than a day: data\tmp is shared with other Windows users' running copies.
	const cleared = clearTmp(layout).length;
	if (cleared) log.info(`deleted ${cleared} old file${cleared === 1 ? '' : 's'} from data\\tmp`);
	// The server's own warnings and errors go to the log too (they never contain request bodies).
	console.error = (...a) => log.error(...a);
	console.warn = (...a) => log.warn(...a);

	// Environment for the server (read when the handler loads, and per request).
	const token = makeToken();
	Object.assign(process.env, {
		OPENVISION_DB: layout.db,
		OPENVISION_BACKUP_DIR: layout.backups, // pre-migration backups go next to the pre-update ones (db.ts)
		OPENVISION_DEMO: '0', // first run goes to /setup
		BODY_SIZE_LIMIT: '20M',
		NODE_ENV: 'production',
		OPENVISION_SHELL_TOKEN: token,
		OPENVISION_DESKTOP: '1',
		OPENVISION_APP_VERSION: VERSION
	});
	delete process.env.ORIGIN; // hooks compare the Origin host with Host
	delete process.env.OPENVISION_CODES_DIR; // code files go next to the database (data\codes, D49)
	delete process.env.OPENVISION_DISK_ENCRYPTION; // filled in below once known

	try {
		srv = await start({ handlerPath: handlerPath(), host: '127.0.0.1', port: 0, token, log });
		appOrigin = new URL(srv.url).origin;
		const hook = dbHook();
		if (!hook) throw new Error('the database module did not load');
		hook.open(); // runs migrations now, so a failure is a dialog rather than a broken page
	} catch (e) {
		fatal('OpenVision could not start', `${e && e.message ? e.message : e}\n\nSee the log:\n${layout.logFile}`);
		return;
	}

	// Disk encryption, for the admin warning in Settings (no admin rights needed; results only on/off/unknown).
	void checkDiskEncryption().then((state) => {
		process.env.OPENVISION_DISK_ENCRYPTION = state;
		log.info(`system drive encryption: ${state}`);
	});

	const ses = session.defaultSession;
	ses.webRequest.onBeforeSendHeaders((details, cb) => {
		try {
			if (new URL(details.url).origin === appOrigin) details.requestHeaders[HEADER] = token;
		} catch {
			// not a URL we care about
		}
		cb({ requestHeaders: details.requestHeaders });
	});
	ses.setPermissionRequestHandler((_wc, permission, cb, details) => cb(permissionAllowed(permission, details?.requestingUrl, appOrigin)));
	ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => permissionAllowed(permission, requestingOrigin, appOrigin));
	handleDownloads(ses);
	// Every start begins signed out: a sign-in cookie left by the last run (cookies ignore the port) is dropped.
	await forgetSignIn();

	updates = createUpdates({
		app,
		dialog,
		log,
		getWindow: () => mainWindow,
		enabled: PACKAGED && process.env.OPENVISION_UPDATES !== 'off',
		backup: () =>
			takePreUpdateBackup({
				dir: layout.backups,
				version: VERSION,
				backup: (file) => {
					const hook = dbHook();
					if (!hook) throw new Error('database not available');
					hook.backup(file);
				}
			}),
		shutdown,
		markShutdownDone: () => (shutdownDone = true)
	});

	registerIpc();
	buildMenu();
	createMainWindow();
	stopUpdateChecks = updates.schedule(); // 10 s after start, then every 4 hours
}

/** Removes the app's sign-in cookie, so closing OpenVision signs the user out of this Windows account's app profile. */
async function forgetSignIn() {
	try {
		const ses = session.defaultSession;
		await ses.cookies.remove('http://127.0.0.1/', 'ov_session');
		await ses.cookies.flushStore();
	} catch (e) {
		log?.warn('could not clear the sign-in cookie:', e);
	}
}

/**
 * Stops everything in order. Resolves { cancelled, backedUp }: cancelled when a window was kept open
 * with "Wait" (then nothing else is touched: server, database and sign-in stay, and a waiting update
 * installs on the next normal close); backedUp is false only when a needed pre-update backup failed.
 */
function shutdown() {
	if (shutdownPromise) return shutdownPromise;
	shutdownPromise = (async () => {
		log?.info('shutting down');
		// Pages release exam locks on the way out; at most 3 s unless a page asks to wait.
		const closed = await closeAll(BrowserWindow.getAllWindows(), 3000);
		if (shutdownDecision(closed) === 'cancel') {
			log?.info('shutdown called off: a window still has changes being saved');
			shutdownPromise = null; // the next close starts over
			return { cancelled: true, backedUp: false };
		}
		stopUpdateChecks();
		await forgetSignIn();
		try {
			await srv?.close(3000);
		} catch (e) {
			log?.error('stopping the server failed:', e);
		}
		const backedUp = updates ? updates.backupBeforeInstall() : true;
		try {
			dbHook()?.close();
			log?.info('database closed');
		} catch (e) {
			log?.error('closing the database failed:', e);
		}
		return { cancelled: false, backedUp };
	})();
	return shutdownPromise;
}

// ---------------------------------------------------------------- app lifecycle

if (!app.requestSingleInstanceLock()) {
	// Already running for this Windows user: that instance comes to the front (second-instance below).
	app.quit();
} else {
	app.setAppUserModelId('org.openvision.desktop');
	app.on('second-instance', () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});
	app.on('before-quit', (e) => {
		if (shutdownDone) return;
		e.preventDefault();
		void shutdown()
			.then((r) => r.cancelled !== true, () => true)
			.then((go) => {
				if (!go) return; // "Wait": the app keeps running
				shutdownDone = true;
				app.quit();
			});
	});
	app.on('window-all-closed', () => app.quit());
	app.on('web-contents-created', (_e, wc) => {
		// No <webview> tags, ever.
		wc.on('will-attach-webview', (ev) => ev.preventDefault());
	});
	app.whenReady().then(boot, (e) => fatal('OpenVision could not start', String(e)));
}
