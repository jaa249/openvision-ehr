// Browser side of the code-set admin API (D49): download, import, remove. Each returns the new
// status or the server's translated message.
import type { CodeSetId } from './index.ts';

export interface CodeSetState {
	set: CodeSetId;
	current: boolean;
	rows: number;
	loadedAt: string | null;
	upToDate: boolean;
}

export type CodeSetResult = { ok: true; state: CodeSetState } | { ok: false; status: number; message: string };

async function call(set: CodeSetId, method: 'POST' | 'DELETE', path: string, body?: Blob): Promise<CodeSetResult> {
	let res: Response;
	try {
		res = await fetch(`/api/admin/codesets/${set}${path}`, {
			method,
			body,
			headers: body ? { 'content-type': body.type || 'application/octet-stream' } : undefined
		});
	} catch {
		return { ok: false, status: 0, message: '' };
	}
	let data: unknown = null;
	try {
		data = await res.json();
	} catch {
		// a proxy or the Node server answered with text (e.g. 413 before our code ran)
	}
	if (res.ok && data) return { ok: true, state: data as CodeSetState };
	return { ok: false, status: res.status, message: (data as { message?: string } | null)?.message ?? '' };
}

export const downloadSet = (set: CodeSetId) => call(set, 'POST', '/download');
/** The file goes as the raw request body. */
export const importSet = (set: CodeSetId, file: File) => call(set, 'POST', '/import', file);
export const removeSet = (set: CodeSetId) => call(set, 'DELETE', '');

// ---------- WHO ICD-11 titles in other languages (D50) ----------

export interface Icd11LanguageState {
	lang: string;
	rows: number;
	loadedAt: string | null;
	upToDate: boolean;
}

export type Icd11LanguageResult = { ok: true; state: Icd11LanguageState } | { ok: false; status: number; message: string };

const languageCall = (lang: string, method: 'POST' | 'DELETE', path: string, body?: Blob) =>
	call('icd11', method, `/languages/${encodeURIComponent(lang)}${path}`, body) as Promise<Icd11LanguageResult>;

export const downloadLanguage = (lang: string) => languageCall(lang, 'POST', '/download');
/** The file goes as the raw request body. */
export const importLanguage = (lang: string, file: File) => languageCall(lang, 'POST', '/import', file);
export const removeLanguage = (lang: string) => languageCall(lang, 'DELETE', '');
