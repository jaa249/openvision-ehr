// Client calls for the Impression/Plan panel. Writes carry the exam lock headers (spec §15.1).
import { lockHeaders } from '#lib/exam/lock.svelte.ts';
import type { Translator } from '#lib/i18n/translate.ts';

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string; body: Record<string, unknown> };

/**
 * POSTs JSON; turns HTTP errors into a message the panel can show (423 locked, 409 duplicate, 400 invalid).
 * `t` is the caller's translator, for the messages made here (the server's own messages come as sent).
 */
export async function postJson<T>(t: Translator['t'], url: string, body: unknown, exam = true): Promise<Result<T>> {
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(exam ? lockHeaders() : {}) },
			body: JSON.stringify(body)
		});
		if (res.ok) return { ok: true, data: (await res.json()) as T };
		const text = await res.text();
		let parsed: Record<string, unknown> = {};
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = {};
		}
		const message =
			typeof parsed.message === 'string'
				? parsed.message
				: res.status === 423
					? t('plan.errLocked')
					: res.status === 404
						? t('plan.errGone')
						: t('plan.errServer');
		return { ok: false, status: res.status, message, body: parsed };
	} catch {
		return { ok: false, status: 0, message: t('plan.errConnection'), body: {} };
	}
}
