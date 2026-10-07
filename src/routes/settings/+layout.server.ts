import { BITLOCKER_HELP_URL, diskEncryption } from '#lib/server/disk.ts';
import type { LayoutServerLoad } from './$types';

/** Admins in the desktop app see whether the drive is encrypted (D51); everyone else, nothing. */
export const load: LayoutServerLoad = ({ locals }) => ({
	disk: locals.user?.role === 'admin' ? diskEncryption() : null,
	bitlockerHelpUrl: BITLOCKER_HELP_URL
});
