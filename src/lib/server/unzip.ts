// A minimal zip reader for code-set downloads (D49), no dependencies: it reads the central directory,
// finds one entry by name and returns its bytes (stored or deflated), checking the CRC-32.
// Hard limits stop zip bombs and junk: the zip at most 50 MB, an entry at most 200 MB uncompressed,
// at most 10,000 entries. No ZIP64, encryption or multi-disk archives (the official files use none).
import * as zlib from 'node:zlib';

export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
export const MAX_ENTRIES = 10_000;

export class ZipError extends Error {}

export interface ZipEntry {
	name: string;
	method: number;
	crc32: number;
	compressedSize: number;
	size: number;
	/** Offset of the local file header. */
	offset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/** True when the bytes start like a zip file (local header or an empty archive). */
export const looksLikeZip = (buf: Uint8Array) =>
	buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && ((buf[2] === 3 && buf[3] === 4) || (buf[2] === 5 && buf[3] === 6));

function view(buf: Uint8Array): DataView {
	return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Every entry in the central directory. Throws ZipError for anything we do not read. */
export function listZip(buf: Uint8Array): ZipEntry[] {
	if (buf.length > MAX_ZIP_BYTES) throw new ZipError('The zip file is larger than 50 MB.');
	if (buf.length < 22) throw new ZipError('Not a zip file.');
	const dv = view(buf);
	// End of central directory: 22 bytes plus a comment of up to 65,535 bytes, at the end.
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
		if (dv.getUint32(i, true) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new ZipError('Not a zip file.');
	const count = dv.getUint16(eocd + 10, true);
	const cdSize = dv.getUint32(eocd + 12, true);
	const cdOffset = dv.getUint32(eocd + 16, true);
	if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 archives are not supported.');
	if (count > MAX_ENTRIES) throw new ZipError('The zip file has too many entries.');
	if (cdOffset + cdSize > eocd) throw new ZipError('The zip file is damaged.');
	const out: ZipEntry[] = [];
	let p = cdOffset;
	for (let n = 0; n < count; n++) {
		if (p + 46 > eocd || dv.getUint32(p, true) !== CEN_SIG) throw new ZipError('The zip file is damaged.');
		const flags = dv.getUint16(p + 8, true);
		const method = dv.getUint16(p + 10, true);
		const crc32 = dv.getUint32(p + 16, true);
		const compressedSize = dv.getUint32(p + 20, true);
		const size = dv.getUint32(p + 24, true);
		const nameLen = dv.getUint16(p + 28, true);
		const extraLen = dv.getUint16(p + 30, true);
		const commentLen = dv.getUint16(p + 32, true);
		const offset = dv.getUint32(p + 42, true);
		if (p + 46 + nameLen > eocd) throw new ZipError('The zip file is damaged.');
		// Bit 11: UTF-8 name; otherwise CP437, which equals ASCII for the names we look for.
		const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
		const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1').decode(nameBytes);
		if (flags & 0x1) throw new ZipError('Encrypted zip files are not supported.');
		out.push({ name, method, crc32, compressedSize, size, offset });
		p += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

/** Finds an entry by its exact path, else by a unique file name (folders ignored); null when absent. */
export function findEntry(entries: ZipEntry[], name: string): ZipEntry | null {
	const exact = entries.find((e) => e.name === name);
	if (exact) return exact;
	const base = name.split('/').pop()!;
	const byBase = entries.filter((e) => e.name.split('/').pop() === base);
	return byBase.length === 1 ? byBase[0] : null;
}

let table: Uint32Array | null = null;
/** CRC-32 (zip polynomial): Node's zlib.crc32 when there is one (Node 22.2+), else a small table. */
export function crc32(data: Uint8Array): number {
	const native = (zlib as unknown as { crc32?: (d: Uint8Array) => number }).crc32;
	if (typeof native === 'function') return native(data) >>> 0;
	if (!table) {
		table = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			table[i] = c >>> 0;
		}
	}
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** The uncompressed bytes of one entry, CRC-checked. */
export function readEntry(buf: Uint8Array, entry: ZipEntry): Buffer {
	if (entry.size > MAX_ENTRY_BYTES) throw new ZipError('The file in the zip is larger than 200 MB.');
	const dv = view(buf);
	const p = entry.offset;
	if (p + 30 > buf.length || dv.getUint32(p, true) !== LOC_SIG) throw new ZipError('The zip file is damaged.');
	const start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
	const end = start + entry.compressedSize;
	if (end > buf.length) throw new ZipError('The zip file is damaged.');
	const raw = buf.subarray(start, end);
	let data: Buffer;
	if (entry.method === 0) {
		data = Buffer.from(raw);
	} else if (entry.method === 8) {
		try {
			// maxOutputLength stops a bomb even when the declared size lies.
			data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(entry.size, 1) });
		} catch {
			throw new ZipError('The zip file is damaged.');
		}
	} else {
		throw new ZipError('The zip file uses a compression method that is not supported.');
	}
	if (data.length !== entry.size || crc32(data) !== entry.crc32) throw new ZipError('The zip file is damaged (checksum).');
	return data;
}

/** Shortcut: the bytes of the entry named `name` (exact path, or a unique file name). */
export function extractEntry(buf: Uint8Array, name: string): Buffer {
	const entry = findEntry(listZip(buf), name);
	if (!entry) throw new ZipError(`The zip file does not contain ${name}.`);
	return readEntry(buf, entry);
}
