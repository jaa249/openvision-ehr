import { describe, expect, it } from 'vitest';
import { makeZip } from './zip.fixture.ts';
import { crc32, extractEntry, findEntry, listZip, looksLikeZip, MAX_ZIP_BYTES, readEntry, ZipError } from './unzip.ts';

const TEXT = 'Z0000   Fictional test line one\nZ0001   Fictional test line two\n'.repeat(50);

describe('zip reader', () => {
	it('lists entries and reads stored and deflated ones, by path or unique file name', () => {
		const zip = makeZip([
			{ name: 'Folder/', data: '' },
			{ name: 'Folder/codes.txt', data: TEXT, deflate: true },
			{ name: 'readme.txt', data: 'Fictional readme' }
		]);
		expect(looksLikeZip(zip)).toBe(true);
		expect(looksLikeZip(Buffer.from(TEXT))).toBe(false);
		const entries = listZip(zip);
		expect(entries.map((e) => [e.name, e.method])).toEqual([
			['Folder/', 0],
			['Folder/codes.txt', 8],
			['readme.txt', 0]
		]);
		expect(extractEntry(zip, 'Folder/codes.txt').toString('utf8')).toBe(TEXT);
		expect(extractEntry(zip, 'codes.txt').toString('utf8')).toBe(TEXT);
		expect(readEntry(zip, findEntry(entries, 'readme.txt')!).toString('utf8')).toBe('Fictional readme');
		expect(() => extractEntry(zip, 'missing.txt')).toThrow(ZipError);
	});

	it('CRC-32 matches the zip polynomial', () => {
		expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});

	it('refuses a wrong checksum, a lying size (bomb), junk and oversize input', () => {
		expect(() => extractEntry(makeZip([{ name: 'a.txt', data: TEXT, deflate: true, crc: 1 }]), 'a.txt')).toThrow(/checksum/);
		// Declares 10 bytes but inflates to much more: stopped at the declared size.
		expect(() => extractEntry(makeZip([{ name: 'a.txt', data: TEXT, deflate: true, size: 10 }]), 'a.txt')).toThrow(ZipError);
		expect(() => extractEntry(makeZip([{ name: 'a.txt', data: 'x', size: 300 * 1024 * 1024 }]), 'a.txt')).toThrow(/200 MB/);
		expect(() => listZip(Buffer.from('not a zip at all, just some fictional words'))).toThrow(/Not a zip/);
		const big = Buffer.alloc(MAX_ZIP_BYTES + 1);
		expect(() => listZip(big)).toThrow(/50 MB/);
	});

	it('refuses an archive claiming more than 10,000 entries', () => {
		const zip = makeZip([{ name: 'a.txt', data: 'x' }]);
		zip.writeUInt16LE(20000, zip.length - 22 + 10);
		expect(() => listZip(zip)).toThrow(/too many/);
	});
});
