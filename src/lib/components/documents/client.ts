// Browser-side calls for patient documents (spec §15.4). Errors come back as plain sentences.
import { DOC_MIMES, MAX_DOCUMENT_BYTES, formatBytes, type DocMeta } from './types.ts';

export interface UploadOptions {
	category: string;
	encounterId?: number | null;
	takenOn?: string;
	notes?: string;
	/** Exam lock headers (lockHeaders()) when the file belongs to a visit. */
	headers?: Record<string, string>;
}

/** Checks we can do before sending; the server decides the type from the bytes regardless. */
export function precheck(file: File): string | null {
	if (file.size === 0) return `${file.name} is empty.`;
	if (file.size > MAX_DOCUMENT_BYTES) return `${file.name} is ${formatBytes(file.size)}. The limit is 15 MB.`;
	if (file.type && !(DOC_MIMES as readonly string[]).includes(file.type)) {
		return `${file.name} is not a PNG, JPEG or PDF. Phone photos in HEIC format must be saved as JPEG first.`;
	}
	return null;
}

async function message(res: Response): Promise<string> {
	let text = '';
	try {
		const ct = res.headers.get('content-type') ?? '';
		text = ct.includes('json') ? ((await res.json()) as { message?: string }).message ?? '' : await res.text();
	} catch {
		/* keep the generic text */
	}
	if (res.status === 413 && !/15 MB|BODY_SIZE_LIMIT/.test(text)) {
		return 'This file is larger than the server accepts. Files up to 15 MB are supported when the server runs with BODY_SIZE_LIMIT=20M (ask your administrator).';
	}
	if (res.status === 423) return text || 'This visit is signed or being edited elsewhere, so its documents cannot change.';
	return text || `The server answered ${res.status}.`;
}

export async function uploadDocumentFile(patientId: number, file: File, opts: UploadOptions): Promise<DocMeta> {
	const bad = precheck(file);
	if (bad) throw new Error(bad);
	const q = new URLSearchParams({ category: opts.category, filename: file.name });
	if (opts.encounterId) q.set('encounter', String(opts.encounterId));
	if (opts.takenOn) q.set('takenOn', opts.takenOn);
	if (opts.notes?.trim()) q.set('notes', opts.notes.trim());
	const res = await fetch(`/api/patients/${patientId}/documents?${q}`, {
		method: 'POST',
		headers: { 'content-type': file.type || 'application/octet-stream', ...(opts.headers ?? {}) },
		body: file
	});
	if (!res.ok) throw new Error(await message(res));
	return (await res.json()) as DocMeta;
}

export async function updateDocumentMeta(
	patientId: number,
	id: number,
	edit: { notes?: string; takenOn?: string; category?: string },
	headers: Record<string, string> = {}
): Promise<DocMeta> {
	const res = await fetch(`/api/patients/${patientId}/documents/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(edit)
	});
	if (!res.ok) throw new Error(await message(res));
	return (await res.json()) as DocMeta;
}

export async function deleteDocumentFile(patientId: number, id: number, headers: Record<string, string> = {}): Promise<void> {
	const res = await fetch(`/api/patients/${patientId}/documents/${id}`, { method: 'DELETE', headers });
	if (!res.ok) throw new Error(await message(res));
}
