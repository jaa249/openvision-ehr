// Per-user prefs storage (spec §1.7 FIX). Only whitelisted keys with the right type are stored;
// reads merge the stored values over the new-user defaults, so every key always has a value.
import type { DB } from './db.ts';
import { PREF_DEFS, checkPref, defaultPrefs, isPrefKey, type PrefKey, type Prefs } from '#lib/prefs/keys.ts';

export class PrefError extends Error {}

const MAX_KEYS_PER_SAVE = 50;

function encode(key: PrefKey, value: unknown): string {
	return PREF_DEFS[key].type === 'boolean' ? (value ? '1' : '0') : String(value);
}

function decode(key: PrefKey, raw: string): unknown {
	return PREF_DEFS[key].type === 'boolean' ? (raw === '1' ? true : raw === '0' ? false : undefined) : raw;
}

export function getPrefs(db: DB, userId: number): Prefs {
	const out = defaultPrefs() as Record<PrefKey, unknown>;
	const rows = db.prepare('SELECT key, value FROM user_prefs WHERE user_id = ?').all(userId) as { key: string; value: string }[];
	for (const r of rows) {
		if (!isPrefKey(r.key)) continue; // a key retired from the whitelist is ignored, not served
		const v = checkPref(r.key, decode(r.key, r.value));
		if (v !== undefined) out[r.key] = v;
	}
	return out as Prefs;
}

/** Validates the whole patch first (all-or-nothing), then upserts. Throws PrefError naming the bad key. */
export function setPrefs(db: DB, userId: number, patch: unknown): Prefs {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new PrefError('Expected an object of prefs');
	const entries = Object.entries(patch);
	if (entries.length === 0) throw new PrefError('No prefs given');
	if (entries.length > MAX_KEYS_PER_SAVE) throw new PrefError('Too many prefs in one save');
	const clean: [PrefKey, string][] = [];
	for (const [k, v] of entries) {
		if (!isPrefKey(k)) throw new PrefError(`Unknown pref ${k.slice(0, 40)}`);
		if (checkPref(k, v) === undefined) throw new PrefError(`Wrong value for ${k}`);
		clean.push([k, encode(k, v)]);
	}
	const up = db.prepare(
		'INSERT INTO user_prefs (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value'
	);
	db.exec('BEGIN');
	try {
		for (const [k, v] of clean) up.run(userId, k, v);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return getPrefs(db, userId);
}
