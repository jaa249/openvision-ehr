#!/usr/bin/env node
// Emergency access (HIPAA 164.312(a)(2)(ii)): when no admin can sign in, run this on the server
// console to give an admin account a new temporary password.
//
//   node scripts/reset-admin.mjs <username>
//   OPENVISION_DB=/path/to/openvision.sqlite node scripts/reset-admin.mjs <username>
//
// It refuses non-admin accounts, reactivates the account if it was deactivated, forces a password
// change at the next sign-in, ends the account's sessions, and writes auth.emergency_reset to the
// audit log. Anyone who can run this already controls the server and its database file.
// The hash format must match src/lib/server/auth.ts: scrypt$N$r$p$salt$hash (base64url).
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { randomBytes, scryptSync } from 'node:crypto';

const username = process.argv[2];
if (!username || username.startsWith('-')) {
	console.error('Usage: node scripts/reset-admin.mjs <admin username>');
	process.exit(2);
}
const path = process.env.OPENVISION_DB ?? 'data/openvision.sqlite';
if (!existsSync(path)) {
	console.error(`Database not found: ${path} (set OPENVISION_DB)`);
	process.exit(1);
}

const N = 32768, r = 8, p = 1, keylen = 32;
// 4 groups of 5 from an unambiguous alphabet: 20 characters, about 100 bits.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const bytes = randomBytes(20);
const temp = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('').replace(/(.{5})(?=.)/g, '$1-');
const salt = randomBytes(16);
const key = scryptSync(temp.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;

const db = new DatabaseSync(path);
db.exec('PRAGMA busy_timeout = 5000');
const user = db.prepare('SELECT id, username, role, active FROM users WHERE username = ? COLLATE NOCASE').get(username);
if (!user) {
	console.error(`No user named ${username}.`);
	process.exit(1);
}
if (user.role !== 'admin') {
	console.error(`${user.username} is not an admin. Sign in as an admin and reset it in Settings > Users.`);
	process.exit(1);
}
db.exec('BEGIN');
try {
	db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?').run(hash, user.id);
	db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
	db.prepare("INSERT INTO audit_log (at, user_id, action, patient_id, encounter_id, detail) VALUES (?, ?, 'auth.emergency_reset', NULL, NULL, ?)").run(
		new Date().toISOString(),
		user.id,
		JSON.stringify({ username: user.username, via: 'console', host: hostname(), osUser: userInfo().username, reactivated: user.active === 0 })
	);
	db.exec('COMMIT');
} catch (e) {
	db.exec('ROLLBACK');
	throw e;
}
console.log(`Temporary password for ${user.username}: ${temp}`);
console.log('They must choose a new password at the next sign-in. This reset is in the audit log.');
