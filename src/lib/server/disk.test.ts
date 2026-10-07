import { describe, expect, it } from 'vitest';
import { diskEncryption } from './disk.ts';

describe('disk encryption state for the Settings warning (D51)', () => {
	it('browser build (no OPENVISION_DESKTOP): never shown', () => {
		expect(diskEncryption({})).toBeNull();
		expect(diskEncryption({ OPENVISION_DISK_ENCRYPTION: 'off' })).toBeNull();
	});
	it('desktop: on / off / unknown pass through; not checked yet or garbage → nothing', () => {
		const d = (v?: string) => diskEncryption({ OPENVISION_DESKTOP: '1', OPENVISION_DISK_ENCRYPTION: v });
		expect(d('on')).toBe('on');
		expect(d('off')).toBe('off');
		expect(d('unknown')).toBe('unknown');
		expect(d(undefined)).toBeNull();
		expect(d('OFF')).toBeNull();
	});
});
