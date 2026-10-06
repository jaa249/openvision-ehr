// Browser side of per-user prefs (spec §1.7): one GET per page load, a PUT per change.
// If the API cannot be reached, prefs fall back to a copy in localStorage so layout choices
// still stick on this device; the server copy wins again as soon as it answers.
import { defaultPrefs, sanitizePrefs, type PrefKey, type Prefs } from './keys.ts';

const FALLBACK_KEY = 'openvision.prefs.fallback.v1';
let loading: Promise<void> | null = null;
let loadedAt = 0;
const SHARE_MS = 3000;
let current: Prefs | null = null;
/** Changes made while a load is in flight win over the loaded copy. */
let edits: Partial<Prefs> | null = null;

function readFallback(): Partial<Prefs> {
	try {
		return sanitizePrefs(JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? 'null'));
	} catch {
		return {};
	}
}

function writeFallback(patch: Partial<Prefs>): void {
	try {
		localStorage.setItem(FALLBACK_KEY, JSON.stringify({ ...readFallback(), ...patch }));
	} catch {
		/* private window or blocked storage: the choice lasts until reload */
	}
}

/**
 * The user's prefs (defaults merged). Panels mounting together share one request; a later mount
 * (e.g. after changing prefs in My settings) fetches again, so it never sees a stale copy.
 */
export async function loadPrefs(): Promise<Prefs> {
	if (loading && Date.now() - loadedAt > SHARE_MS) loading = null;
	loading ??= (async () => {
		loadedAt = Date.now();
		edits = {};
		try {
			const res = await fetch('/api/prefs', { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { prefs?: unknown };
			current = { ...defaultPrefs(), ...sanitizePrefs(body.prefs), ...(edits ?? {}) };
		} catch {
			current = { ...defaultPrefs(), ...readFallback(), ...(edits ?? {}) };
		}
		edits = null;
	})();
	await loading;
	return { ...current! };
}

/** Saves one or more prefs for the signed-in user. Never throws; falls back to localStorage on failure. */
export async function savePrefs(patch: Partial<Prefs>): Promise<void> {
	const clean = sanitizePrefs(patch);
	if (!Object.keys(clean).length) return;
	if (edits) edits = { ...edits, ...clean };
	if (current) current = { ...current, ...clean };
	try {
		const res = await fetch('/api/prefs', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ prefs: clean })
		});
		if (!res.ok) throw new Error(String(res.status));
	} catch {
		writeFallback(clean);
	}
}

export function savePref<K extends PrefKey>(key: K, value: Prefs[K]): Promise<void> {
	return savePrefs({ [key]: value } as Partial<Prefs>);
}

/** Test hook: forget the cached copy. */
export function resetPrefsCache(): void {
	loading = null;
	current = null;
}
