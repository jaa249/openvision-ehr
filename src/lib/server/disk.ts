// Is this computer's system drive encrypted? Only the Windows desktop app knows: at start it asks
// Windows (BitLocker, without admin rights) and sets OPENVISION_DISK_ENCRYPTION=on|off|unknown (D51).
// The browser build never sets OPENVISION_DESKTOP, so nothing is shown there.
export type DiskEncryption = 'on' | 'off' | 'unknown';

/** The state for the admin warning in Settings, or null when there is nothing to show (not the desktop app, or not checked yet). */
export function diskEncryption(env: Record<string, string | undefined> = process.env): DiskEncryption | null {
	if (env.OPENVISION_DESKTOP !== '1') return null;
	const v = env.OPENVISION_DISK_ENCRYPTION;
	if (v === 'on' || v === 'off' || v === 'unknown') return v;
	return null;
}

/** Microsoft's "Device encryption in Windows" page (BitLocker; checked 2026-10-07), opened in the normal browser. */
export const BITLOCKER_HELP_URL = 'https://support.microsoft.com/windows/device-encryption-in-windows-cf7e2b6f-3e70-4882-9532-18633605b7df';
