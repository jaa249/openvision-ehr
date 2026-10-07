'use strict';
// The only bridge between the web app and the desktop shell (D51). Runs sandboxed with context
// isolation: the page sees window.openvisionDesktop and nothing else of Electron or Node.
const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((a) => a.startsWith('--openvision-version='));
const version = versionArg ? versionArg.slice('--openvision-version='.length) : '';

contextBridge.exposeInMainWorld(
	'openvisionDesktop',
	Object.freeze({
		isDesktop: true,
		version,
		/** Renders the print view of these visits to a PDF file the user saves. Resolves { saved, canceled?, error? }. */
		savePdf: (ids, suggestedName) => ipcRenderer.invoke('openvision:save-pdf', ids, suggestedName),
		/** The same as Help › Check for updates. */
		checkForUpdates: () => ipcRenderer.invoke('openvision:check-updates')
	})
);
