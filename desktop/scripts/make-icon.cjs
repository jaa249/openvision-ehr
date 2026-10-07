// Renders the OpenVision logo (assets/icon.svg, a copy of docs/brand/logo.svg) to build/icon.png at 512 x 512
// with Electron itself (an offscreen window), so no image library is needed. electron-builder makes the .ico.
// Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const SIZE = 512;
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
	const svg = readFileSync(path.join(__dirname, '..', 'assets', 'icon.svg'), 'utf8');
	const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${SIZE}" height="${SIZE}" style="display:block"></body></html>`;
	const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
	await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
	await new Promise((r) => setTimeout(r, 300));
	const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
	const out = path.join(__dirname, '..', 'build', 'icon.png');
	mkdirSync(path.dirname(out), { recursive: true });
	writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG());
	console.log(`wrote ${out}`);
	app.quit();
});
