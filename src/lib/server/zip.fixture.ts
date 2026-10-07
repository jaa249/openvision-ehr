// Test-only: a tiny zip writer (stored or deflated entries, no ZIP64) for the zip reader and code-set
// tests. Never import it from app code.
import { deflateRawSync } from 'node:zlib';
import { crc32 } from './unzip.ts';

/** A tiny zip writer for the tests (fictional content): stored or deflated entries, no ZIP64. */
export function makeZip(files: { name: string; data: string | Uint8Array; deflate?: boolean; crc?: number; size?: number }[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const f of files) {
		const data = typeof f.data === 'string' ? Buffer.from(f.data, 'utf8') : Buffer.from(f.data);
		const body = f.deflate ? deflateRawSync(data) : data;
		const name = Buffer.from(f.name, 'utf8');
		const crc = f.crc ?? crc32(data);
		const size = f.size ?? data.length;
		const loc = Buffer.alloc(30);
		loc.writeUInt32LE(0x04034b50, 0);
		loc.writeUInt16LE(20, 4);
		loc.writeUInt16LE(0x800, 6);
		loc.writeUInt16LE(f.deflate ? 8 : 0, 8);
		loc.writeUInt32LE(crc, 14);
		loc.writeUInt32LE(body.length, 18);
		loc.writeUInt32LE(size, 22);
		loc.writeUInt16LE(name.length, 26);
		locals.push(loc, name, body);
		const cen = Buffer.alloc(46);
		cen.writeUInt32LE(0x02014b50, 0);
		cen.writeUInt16LE(20, 4);
		cen.writeUInt16LE(20, 6);
		cen.writeUInt16LE(0x800, 8);
		cen.writeUInt16LE(f.deflate ? 8 : 0, 10);
		cen.writeUInt32LE(crc, 16);
		cen.writeUInt32LE(body.length, 20);
		cen.writeUInt32LE(size, 24);
		cen.writeUInt16LE(name.length, 28);
		cen.writeUInt32LE(offset, 42);
		centrals.push(cen, name);
		offset += 30 + name.length + body.length;
	}
	const cd = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(cd.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, cd, end]);
}
