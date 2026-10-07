'use strict';
// electron-builder settings for the Windows installer (D51). `npm run desktop:dist` from the repo root
// builds the web app first (../build), generates the legal texts (scripts/legal-text.mjs), then this.
//
// The version comes from the root package.json, so the app, the installer
// (file properties, latest.yml) and the About box always match the web app.
//
// Code signing (needed before a public release, or Windows SmartScreen warns on every install) is
// configured only through environment variables, never in the repo:
//   - a .pfx certificate: CSC_LINK (path or base64) + CSC_KEY_PASSWORD (electron-builder reads these itself)
//   - Azure Trusted Signing: AZURE_SIGN_ENDPOINT, AZURE_SIGN_ACCOUNT, AZURE_SIGN_PROFILE, AZURE_SIGN_PUBLISHER
//     (+ AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET for the signing identity)
const path = require('node:path');
const root = require('../package.json');

const azure = process.env.AZURE_SIGN_ENDPOINT && process.env.AZURE_SIGN_ACCOUNT && process.env.AZURE_SIGN_PROFILE;

/** @type {import('electron-builder').Configuration} */
module.exports = {
	appId: 'org.openvision.desktop',
	productName: 'OpenVision',
	copyright: 'Copyright 2026 Jamal Adrien and OpenVision contributors. Apache License 2.0.',
	extraMetadata: { version: root.version },
	directories: { output: 'dist', buildResources: 'build' },
	files: ['main.cjs', 'preload.cjs', 'server.cjs', 'lib/**/*.cjs', '!lib/**/*.test.*', 'package.json'],
	extraResources: [
		// The built web app (adapter-node output). Its own package.json marks the .js files as ES modules.
		{ from: '../build', to: 'web', filter: ['**/*', '!**/*.map'] },
		{ from: 'web-package.json', to: 'web/package.json' },
		{ from: '../LICENSE', to: 'LICENSE.txt' },
		{ from: '../NOTICE', to: 'NOTICE.txt' },
		{ from: 'build/legal', to: 'legal' }
	],
	asar: true,
	win: {
		target: [{ target: 'nsis', arch: ['x64'] }],
		icon: 'build/icon.png',
		...(azure
			? {
					azureSignOptions: {
						endpoint: process.env.AZURE_SIGN_ENDPOINT,
						codeSigningAccountName: process.env.AZURE_SIGN_ACCOUNT,
						certificateProfileName: process.env.AZURE_SIGN_PROFILE,
						publisherName: process.env.AZURE_SIGN_PUBLISHER
					}
				}
			: {})
	},
	nsis: {
		// A fixed name so the README's "Download for Windows" link (releases/latest/download/OpenVision-Setup.exe)
		// never changes; the version is in the file's properties, the release and latest.yml.
		artifactName: 'OpenVision-Setup.${ext}',
		oneClick: false,
		perMachine: true,
		allowElevation: true,
		allowToChangeInstallationDirectory: false,
		// The acceptance page: the data safety notice followed by the Terms of Use (scripts/legal-text.mjs).
		license: path.join('build', 'legal', 'INSTALL-ACCEPT.txt'),
		include: 'installer.nsh',
		createDesktopShortcut: true,
		createStartMenuShortcut: true,
		shortcutName: 'OpenVision',
		uninstallDisplayName: 'OpenVision',
		deleteAppDataOnUninstall: false
	},
	publish: [{ provider: 'github', owner: 'jaa249', repo: 'openvision-ehr', releaseType: 'draft' }]
};
