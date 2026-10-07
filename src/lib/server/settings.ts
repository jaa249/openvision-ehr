// Settings data: the practice header (printed reports and Rx, spec §13.3) and each provider's
// normal values (the list the "Normal"/"D" commands write, spec §3.1).
import type { DB } from './db.ts';
import { securityAudit } from './security_audit.ts';
import { EXAM_SECTIONS, FIELDS, FIELD_BY_ID, SECTIONS, SECTION_DEF, SEED_DEFAULTS, type SectionId } from '#lib/exam/catalog.ts';
import { isCodeSetId, type CodeSetId } from '#lib/codesets/index.ts';
import { DEFAULT_LOCALE, isLocale, type LocaleCode } from '#lib/i18n/locales.ts';

export type FieldErrors = Record<string, string>;

export class SettingsError extends Error {
	errors: FieldErrors;
	constructor(errors: FieldErrors) {
		super(Object.values(errors)[0] ?? 'Invalid input');
		this.errors = errors;
	}
}

const CONTROL = /[\u0000-\u001f\u007f]/;
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// ---------------------------------------------------------------- practice

export interface Practice {
	name: string;
	address: string;
	phone: string;
	fax: string;
}

const PRACTICE_LIMITS: Record<keyof Practice, number> = { name: 100, address: 200, phone: 30, fax: 30 };
const PRACTICE_LABEL: Record<keyof Practice, string> = { name: 'Practice name', address: 'Address', phone: 'Phone', fax: 'Fax' };
const PHONE_RE = /^[0-9 ()+.\-x#]*$/i;

export function getPractice(db: DB): Practice {
	return db.prepare('SELECT name, address, phone, fax FROM practice WHERE id = 1').get() as unknown as Practice;
}

/** Saves the practice header; `actorId` is recorded in the audit log with the old and new values. */
export function updatePractice(db: DB, input: Partial<Record<keyof Practice, unknown>>, actorId: number): Practice {
	const errors: FieldErrors = {};
	const out = {} as Practice;
	for (const k of Object.keys(PRACTICE_LIMITS) as (keyof Practice)[]) {
		const v = clean(input[k]);
		if (k === 'name' && !v) errors.name = 'Practice name is required.';
		else if (v.length > PRACTICE_LIMITS[k]) errors[k] = `${PRACTICE_LABEL[k]} must be ${PRACTICE_LIMITS[k]} characters or fewer.`;
		else if (CONTROL.test(v)) errors[k] = `${PRACTICE_LABEL[k]} contains characters that are not allowed.`;
		else if ((k === 'phone' || k === 'fax') && !PHONE_RE.test(v)) errors[k] = `${PRACTICE_LABEL[k]} may use digits, spaces and ( ) + - . x only.`;
		out[k] = v;
	}
	if (Object.keys(errors).length) throw new SettingsError(errors);
	const before = getPractice(db);
	securityAudit(db, { action: 'settings.practice', userId: actorId, detail: { before, after: out } });
	db.prepare('UPDATE practice SET name = ?, address = ?, phone = ?, fax = ? WHERE id = 1').run(out.name, out.address, out.phone, out.fax);
	return out;
}

// ---------------------------------------------------------------- diagnosis codes and US code suggestions (D44, D45)

export interface CodeSettings {
	/** The set new diagnosis codes come from; coded items keep the set they were saved with. */
	codeSet: CodeSetId;
	/**
	 * "US code suggestions (CPT)": the Codes section (key 0), the coding API and the codes on the report.
	 * A billing aid only (D46). The key keeps its historical name.
	 */
	usBilling: boolean;
}

/** US code suggestions start on with ICD-10-CM and off with ICD-11 (at setup; afterwards the two are independent). */
export const defaultUsBilling = (codeSet: CodeSetId) => codeSet === 'icd10cm';

export function getCodeSettings(db: DB): CodeSettings {
	const r = db.prepare('SELECT diagnosis_code_set, us_billing FROM practice WHERE id = 1').get() as
		| { diagnosis_code_set: string; us_billing: number }
		| undefined;
	return { codeSet: isCodeSetId(r?.diagnosis_code_set) ? r.diagnosis_code_set : 'icd10cm', usBilling: (r?.us_billing ?? 1) === 1 };
}

/** The practice's current diagnosis code set (search, New Dx, builder and validation use it). */
export const currentCodeSet = (db: DB): CodeSetId => getCodeSettings(db).codeSet;
export const usBillingOn = (db: DB): boolean => getCodeSettings(db).usBilling;

/**
 * Changes the code set and/or US code suggestions; audited with the old and new values. Nothing already
 * saved changes: coded items keep their own code set, and turning suggestions off deletes no coding data.
 * `actorId` null = first-run setup (no signed-in user yet; the setup itself is audited).
 */
export function updateCodeSettings(db: DB, input: { codeSet?: unknown; usBilling?: unknown }, actorId: number | null): CodeSettings {
	const before = getCodeSettings(db);
	const errors: FieldErrors = {};
	const codeSet = input.codeSet === undefined ? before.codeSet : input.codeSet;
	if (!isCodeSetId(codeSet)) errors.codeSet = 'Choose ICD-10-CM or ICD-11.';
	const usBilling = input.usBilling === undefined ? before.usBilling : input.usBilling;
	if (typeof usBilling !== 'boolean') errors.usBilling = 'US code suggestions must be on or off.';
	if (Object.keys(errors).length) throw new SettingsError(errors);
	const after: CodeSettings = { codeSet: codeSet as CodeSetId, usBilling: usBilling as boolean };
	if (after.codeSet === before.codeSet && after.usBilling === before.usBilling) return after;
	if (actorId !== null) securityAudit(db, { action: 'settings.coding', userId: actorId, detail: { before, after } });
	db.prepare('UPDATE practice SET diagnosis_code_set = ?, us_billing = ? WHERE id = 1').run(after.codeSet, after.usBilling ? 1 : 0);
	return after;
}

// ---------------------------------------------------------------- default language (D48)

/** The practice's language for users who keep "Practice default", and for the sign-in page. Unknown stored values read as English. */
export function getDefaultLocale(db: DB): LocaleCode {
	const r = db.prepare('SELECT default_locale FROM practice WHERE id = 1').get() as { default_locale: string } | undefined;
	return isLocale(r?.default_locale) ? r.default_locale : DEFAULT_LOCALE;
}

/** Saves the default language; audited with the old and new values. `actorId` null = first-run setup (audited as the setup). */
export function setDefaultLocale(db: DB, code: unknown, actorId: number | null): LocaleCode {
	if (!isLocale(code)) throw new SettingsError({ locale: 'Choose a language.' });
	const before = getDefaultLocale(db);
	if (code === before) return code;
	if (actorId !== null) securityAudit(db, { action: 'settings.practice', userId: actorId, detail: { before: { defaultLocale: before }, after: { defaultLocale: code } } });
	db.prepare('UPDATE practice SET default_locale = ? WHERE id = 1').run(code);
	return code;
}

// ---------------------------------------------------------------- normal values (user_defaults)

export interface NormalField {
	id: string;
	label: string;
	value: string;
	/** The starter value, or null when the field has none. */
	seed: string | null;
	maxLength: number;
}
export interface NormalsSection {
	id: SectionId;
	label: string;
	fields: NormalField[];
}

function userDefaults(db: DB, userId: number): Record<string, string> {
	const rows = db.prepare('SELECT field, value FROM user_defaults WHERE user_id = ?').all(userId) as { field: string; value: string }[];
	return Object.fromEntries(rows.map((r) => [r.field, r.value]));
}

/**
 * Fields editable per section: every text-grid row of External / Slit lamp / Fundus (so a provider can
 * add a normal for e.g. gonioscopy), plus any field that has a starter value or a saved value.
 */
function editableIds(section: SectionId, saved: Record<string, string>): string[] {
	const rowIds = new Set((SECTION_DEF.get(section)?.rows ?? []).flatMap((r) => [r.od, r.os]));
	return FIELDS.filter((f) => f.section === section && (rowIds.has(f.id) || f.id in SEED_DEFAULTS || f.id in saved)).map((f) => f.id);
}

const sectionLabel = (id: SectionId) =>
	SECTIONS.find((s) => s.id === id)?.label ?? EXAM_SECTIONS.find((s) => s.id === id)?.title ?? id;

export function normalsSections(db: DB, userId: number): NormalsSection[] {
	const saved = userDefaults(db, userId);
	return SECTIONS.map((s) => ({
		id: s.id,
		label: sectionLabel(s.id),
		fields: editableIds(s.id, saved).map((id) => {
			const def = FIELD_BY_ID.get(id)!;
			return { id, label: def.label, value: saved[id] ?? '', seed: SEED_DEFAULTS[id] ?? null, maxLength: def.maxLength };
		})
	})).filter((s) => s.fields.length > 0);
}

export function isNormalsSection(db: DB, userId: number, section: unknown): section is SectionId {
	return typeof section === 'string' && normalsSections(db, userId).some((s) => s.id === section);
}

/**
 * Saves one section. Only catalogued fields of that section are accepted (anything else is refused,
 * never silently stored); a blank value removes the field from the normals.
 */
export function saveNormals(db: DB, userId: number, section: SectionId, values: Record<string, unknown>): number {
	const allowed = new Set(editableIds(section, userDefaults(db, userId)));
	const errors: FieldErrors = {};
	const writes: [string, string][] = [];
	for (const [id, raw] of Object.entries(values)) {
		const def = FIELD_BY_ID.get(id);
		if (!def || !allowed.has(id)) {
			errors.form = `Unknown field ${id.slice(0, 40)} for this section.`;
			continue;
		}
		const v = typeof raw === 'string' ? raw.trim() : '';
		if (v.length > def.maxLength) errors[id] = `${def.label} is limited to ${def.maxLength} characters.`;
		else if (CONTROL.test(v)) errors[id] = `${def.label} contains characters that are not allowed.`;
		else writes.push([id, v]);
	}
	if (Object.keys(errors).length) throw new SettingsError(errors);
	const up = db.prepare(
		'INSERT INTO user_defaults (user_id, field, value) VALUES (?, ?, ?) ON CONFLICT (user_id, field) DO UPDATE SET value = excluded.value'
	);
	const del = db.prepare('DELETE FROM user_defaults WHERE user_id = ? AND field = ?');
	db.exec('BEGIN');
	try {
		for (const [id, v] of writes) {
			if (v) up.run(userId, id, v);
			else del.run(userId, id);
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return writes.length;
}

/** "Reset to starter values": one section, or everything (which also drops fields no longer in the catalog). */
export function resetNormals(db: DB, userId: number, section?: SectionId): void {
	const ins = db.prepare('INSERT INTO user_defaults (user_id, field, value) VALUES (?, ?, ?)');
	db.exec('BEGIN');
	try {
		if (section) {
			const ids = FIELDS.filter((f) => f.section === section).map((f) => f.id);
			const del = db.prepare('DELETE FROM user_defaults WHERE user_id = ? AND field = ?');
			for (const id of ids) del.run(userId, id);
			for (const id of ids) if (id in SEED_DEFAULTS) ins.run(userId, id, SEED_DEFAULTS[id]);
		} else {
			db.prepare('DELETE FROM user_defaults WHERE user_id = ?').run(userId);
			for (const [id, v] of Object.entries(SEED_DEFAULTS)) ins.run(userId, id, v);
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}
