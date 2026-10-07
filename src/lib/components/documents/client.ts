// Browser-side calls for patient documents (spec §15.4). Errors come back as plain sentences, in the
// page language when the caller passes its translator (D48; English otherwise). Server messages stay as sent.
import { DOC_MIMES, MAX_DOCUMENT_BYTES, formatBytes, type DocMeta } from './types.ts';
import { english, type Translate } from '#lib/coding/english.ts';

export interface UploadOptions {
	category: string;
	encounterId?: number | null;
	takenOn?: string;
	notes?: string;
	/** Exam lock headers (lockHeaders()) when the file belongs to a visit. */
	headers?: Record<string, string>;
	/** Translator for the messages made here. */
	t?: Translate;
}

/** Checks we can do before sending; the server decides the type from the bytes regardless. */
export function precheck(file: File, t: Translate = english): string | null {
	if (file.size === 0) return t('documents.fileEmpty', { name: file.name });
	if (file.size > MAX_DOCUMENT_BYTES) return t('documents.fileTooLarge', { name: file.name, size: formatBytes(file.size) });
	if (file.type && !(DOC_MIMES as readonly string[]).includes(file.type)) {
		return t('documents.fileWrongType', { name: file.name });
	}
	return null;
}

async function message(res: Response, t: Translate): Promise<string> {
	let text = '';
	try {
		const ct = res.headers.get('content-type') ?? '';
		text = ct.includes('json') ? ((await res.json()) as { message?: string }).message ?? '' : await res.text();
	} catch {
		/* keep the generic text */
	}
	if (res.status === 413 && !/15 MB|BODY_SIZE_LIMIT/.test(text)) {
		return t('documents.serverTooLarge', { setting: 'BODY_SIZE_LIMIT=20M' });
	}
	if (res.status === 423) return text || t('documents.visitLocked');
	return text || t('documents.serverAnsweredSentence', { status: res.status });
}

export async function uploadDocumentFile(patientId: number, file: File, opts: UploadOptions): Promise<DocMeta> {
	const t = opts.t ?? english;
	const bad = precheck(file, t);
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
	if (!res.ok) throw new Error(await message(res, t));
	return (await res.json()) as DocMeta;
}

export async function updateDocumentMeta(
	patientId: number,
	id: number,
	edit: { notes?: string; takenOn?: string; category?: string },
	headers: Record<string, string> = {},
	t: Translate = english
): Promise<DocMeta> {
	const res = await fetch(`/api/patients/${patientId}/documents/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(edit)
	});
	if (!res.ok) throw new Error(await message(res, t));
	return (await res.json()) as DocMeta;
}

export async function deleteDocumentFile(patientId: number, id: number, headers: Record<string, string> = {}, t: Translate = english): Promise<void> {
	const res = await fetch(`/api/patients/${patientId}/documents/${id}`, { method: 'DELETE', headers });
	if (!res.ok) throw new Error(await message(res, t));
}
