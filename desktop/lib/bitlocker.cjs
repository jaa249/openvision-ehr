'use strict';
// Is the Windows system drive encrypted (BitLocker)? Asked without admin rights through the Shell's
// System.Volume.BitLockerProtection property (manage-bde needs an elevated prompt). The result goes
// to the server as OPENVISION_DISK_ENCRYPTION=on|off|unknown; admins see a warning in Settings when
// it is off (D51). Nothing leaves the computer.
const { execFile } = require('node:child_process');

/**
 * Property values (Windows Shell): 1 on, 2 off, 3 encrypting, 4 decrypting, 5 protection suspended,
 * 6 on (locked). Suspended or decrypting counts as off: the data is readable without a key.
 * Anything else (0, empty, not supported, an error) is unknown.
 */
function parseBitLockerProtection(stdout) {
	const v = String(stdout ?? '').trim();
	if (!/^\d+$/.test(v)) return 'unknown';
	const n = Number(v);
	if (n === 1 || n === 3 || n === 6) return 'on';
	if (n === 2 || n === 4 || n === 5) return 'off';
	return 'unknown';
}

/** The system drive letter, e.g. "C:" (from SystemDrive; defaults to C:). */
function systemDrive(env = process.env) {
	const d = String(env.SystemDrive || env.SYSTEMDRIVE || 'C:').trim();
	return /^[A-Za-z]:$/.test(d) ? d.toUpperCase() : 'C:';
}

/** Resolves 'on' | 'off' | 'unknown'; never rejects. Windows only; elsewhere 'unknown'. */
function checkDiskEncryption({ env = process.env, timeoutMs = 15000 } = {}) {
	if (process.platform !== 'win32') return Promise.resolve('unknown');
	const drive = systemDrive(env);
	const script = `(New-Object -ComObject Shell.Application).NameSpace('${drive}').Self.ExtendedProperty('System.Volume.BitLockerProtection')`;
	return new Promise((resolve) => {
		execFile(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
			{ windowsHide: true, timeout: timeoutMs },
			(err, stdout) => resolve(err ? 'unknown' : parseBitLockerProtection(stdout))
		);
	});
}

module.exports = { parseBitLockerProtection, systemDrive, checkDiskEncryption };
