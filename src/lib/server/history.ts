// Patient history (PMSFH): issues (POH, POS, eye meds, PMH, meds, surgery, allergies), the
// "No known allergies" confirmation, and versioned family/social history.
// Every function is scoped by patient id; the API route also checks the visit via getEncounter.
// Spec: docs/spec/BEHAVIOR.md §1.3, §2.4, §7.2, §7.4-7.7.
import type { DB } from './db.ts';
import {
	activeAllergies,
	clearNoKnownAllergies,
	isRealDate,
	localToday,
	PatientValidationError,
	readAllergyStatus,
	setNoKnownAllergies,
	type FieldErrors
} from './patients.ts';
import { getEncounter } from './exam.ts';
import { currentCodeSet } from './settings.ts';
import { icd11Loaded, resolveIcd11Code } from './icd11.ts';
import { codeTextFor, isCodeSetId, type CodeSetId } from '#lib/codesets/index.ts';
import {
	BUILTIN_TITLES,
	FH_KEYS,
	ISSUE_TYPE_DEF,
	OCCURRENCES,
	OUTCOMES,
	SOCIAL_HABITS,
	SOCIAL_KEYS,
	SOCIAL_STATUSES
} from '#lib/history/lists.ts';
import { splitAllergy, splitIssueText } from '#lib/history/summary.ts';
import {
	ISSUE_TYPES,
	type FamilyHistory,
	type Issue,
	type IssueType,
	type Pmsfh,
	type ShorthandIssueResult,
	type SocialHistory,
	type TitlePick
} from '#lib/history/types.ts';

export { PatientValidationError as HistoryValidationError, setNoKnownAllergies, activeAllergies };

const TITLE_MAX = 120;
const CODES_MAX = 200;
const REACTION_MAX = 120;
const PROVIDER_MAX = 80;
const COMMENTS_MAX = 2000;
const HISTORY_VALUE_MAX = 200;
/** Control characters other than tab and newline (comments may have line breaks). */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const LINE_CONTROL = /[\u0000-\u001f\u007f]/;

type IssueRow = {
	id: number;
	type: IssueType;
	title: string;
	codes: string;
	begin_date: string;
	end_date: string;
	occurrence: string;
	reaction: string;
	outcome: string;
	provider: string;
	comments: string;
	code_system: string;
};

/** An issue is active while its end date is blank or still in the future. */
function toIssue(r: IssueRow, today: string): Issue {
	return {
		id: r.id,
		type: r.type,
		title: r.title,
		codes: r.codes,
		codeSystem: isCodeSetId(r.code_system) ? r.code_system : 'icd10cm',
		begin: r.begin_date,
		end: r.end_date,
		occurrence: r.occurrence,
		reaction: r.reaction,
		outcome: r.outcome,
		provider: r.provider,
		comments: r.comments,
		active: !r.end_date || r.end_date > today
	};
}

export function listIssues(db: DB, patientId: number, today = localToday()): Issue[] {
	const rows = db
		.prepare(
			`SELECT id, type, title, codes, begin_date, end_date, occurrence, reaction, outcome, provider, comments, code_system
			   FROM issues WHERE patient_id = ? ORDER BY title COLLATE NOCASE, id`
		)
		.all(patientId) as IssueRow[];
	return rows.map((r) => toIssue(r, today));
}

/** Latest saved version of family or social history ({} when never saved). */
function latestHistory(db: DB, patientId: number, kind: 'family' | 'social'): Record<string, string> {
	const row = db
		.prepare('SELECT data FROM patient_history WHERE patient_id = ? AND kind = ? ORDER BY id DESC LIMIT 1')
		.get(patientId, kind) as { data: string } | undefined;
	if (!row) return {};
	try {
		const parsed = JSON.parse(row.data);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
	} catch {
		return {};
	}
}

/** Everything the PMSFH panel, banner and report need for one patient. */
export function getPmsfh(db: DB, patientId: number, today = localToday()): Pmsfh {
	return {
		issues: listIssues(db, patientId, today),
		allergyStatus: readAllergyStatus(db, patientId, today),
		family: latestHistory(db, patientId, 'family'),
		social: latestHistory(db, patientId, 'social')
	};
}

// ---------- issues ----------

function clean(v: unknown): string {
	return typeof v === 'string' ? v.trim().replace(/[ \t]+/g, ' ') : '';
}

function line(key: string, label: string, v: unknown, max: number, errors: FieldErrors): string {
	const s = clean(v).replace(/\s+/g, ' ');
	if (s.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
	else if (LINE_CONTROL.test(s)) errors[key] = `${label} contains characters that are not allowed.`;
	return s;
}

function date(key: string, label: string, v: unknown, errors: FieldErrors): string {
	const s = clean(v);
	if (s && !isRealDate(s)) errors[key] = `${label} must be a real date (YYYY-MM-DD).`;
	return s;
}

export interface CleanIssue {
	id: number | null;
	type: IssueType;
	title: string;
	codes: string;
	begin: string;
	end: string;
	occurrence: string;
	reaction: string;
	outcome: string;
	provider: string;
	comments: string;
}

/**
 * Validates an editor post (§7.2 with FIX: the save is validated server-side too).
 * Fields the type does not show are stored blank. Throws PatientValidationError with one message per field.
 */
export function validateIssue(input: unknown): CleanIssue {
	const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
	const errors: FieldErrors = {};
	const type = o.type as IssueType;
	const def = ISSUE_TYPE_DEF.get(type);
	if (!def) throw new PatientValidationError({ type: 'Choose a history type.' });
	const id = o.id === undefined || o.id === null || o.id === '' ? null : Number(o.id);
	if (id !== null && (!Number.isSafeInteger(id) || id < 1)) errors.id = 'Unknown issue.';

	const title = line('title', def.titleLabel, o.title, TITLE_MAX, errors);
	if (!title && !errors.title) errors.title = `${def.titleLabel} is required.`;
	const codes = def.codes ? line('codes', 'Diagnosis code', o.codes, CODES_MAX, errors) : '';
	const begin = def.begin ? date('begin', def.begin, o.begin, errors) : '';
	const end = def.end ? date('end', def.end, o.end, errors) : '';
	if (begin && end && !errors.begin && !errors.end && end < begin) {
		errors.end = `${def.end} cannot be before ${def.begin?.toLowerCase()}.`;
	}
	const occurrence = def.occurrence ? clean(o.occurrence) : '';
	if (!OCCURRENCES.some((x) => x.value === occurrence)) errors.occurrence = 'Choose a course from the list.';
	const outcome = def.outcome ? clean(o.outcome) : '';
	if (!OUTCOMES.some((x) => x.value === outcome)) errors.outcome = 'Choose an outcome from the list.';
	const reaction = def.reaction ? line('reaction', 'Reaction', o.reaction, REACTION_MAX, errors) : '';
	const provider = def.provider ? line('provider', def.provider, o.provider, PROVIDER_MAX, errors) : '';
	const comments = typeof o.comments === 'string' ? o.comments.trim() : '';
	if (comments.length > COMMENTS_MAX) errors.comments = `Comments must be ${COMMENTS_MAX} characters or fewer.`;
	else if (CONTROL.test(comments)) errors.comments = 'Comments contain characters that are not allowed.';
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	return { id, type, title, codes, begin, end, occurrence, reaction, outcome, provider, comments };
}

/**
 * The code set and WHO data stored with an issue's codes (D44). ICD-10-CM: as typed, as before.
 * ICD-11 (lenient, like ICD-10 history codes): the typed text is kept; each code the ICD-11 set accepts
 * is stored normalised with its WHO title (code_text) and URIs (WHO licence: code, title and URI together).
 */
type IssueCodeData = { codes: string; codeSystem: CodeSetId; codeUris: string; codeText: string; titleLang: string };

/** issueCodeData with WHO's titles in `lang` when every code has one (D50); else English. */
function issueCodeDataIn(db: DB, codes: string, set: CodeSetId, lang: string): IssueCodeData {
	if (lang !== 'en') {
		const local = issueCodeData(db, codes, set, lang);
		if (!local.codeText || local.titleLang === lang) return local;
	}
	return issueCodeData(db, codes, set, 'en');
}

function issueCodeData(db: DB, codes: string, set: CodeSetId, lang: string): IssueCodeData {
	if (set !== 'icd11' || !codes || !icd11Loaded(db)) return { codes, codeSystem: set, codeUris: '', codeText: '', titleLang: '' };
	const parts = codes.replace(/\s*&\s*/g, '&').split(/([;,\s]+)/);
	const found: { code: string; description: string; uris: string; titleLang: string }[] = [];
	const out = parts.map((part) => {
		if (!part || /^[;,\s]+$/.test(part)) return part;
		const r = resolveIcd11Code(db, part, lang);
		if ('error' in r) return part;
		if (!found.some((f) => f.code === r.code)) found.push({ code: r.code, description: r.description, uris: r.uris, titleLang: r.titleLang ?? 'en' });
		return r.code;
	});
	return {
		codes: out.join(''),
		codeSystem: 'icd11',
		codeUris: found.map((f) => f.uris).join(', '),
		codeText: codeTextFor('icd11', found),
		titleLang: !found.length ? '' : found.every((f) => f.titleLang === lang) ? lang : 'en'
	};
}

function findDuplicate(db: DB, patientId: number, type: IssueType, title: string, exceptId: number | null): number | null {
	const hit = db
		.prepare('SELECT id FROM issues WHERE patient_id = ? AND type = ? AND title = ? COLLATE NOCASE AND id IS NOT ? ORDER BY id LIMIT 1')
		.get(patientId, type, title, exceptId) as { id: number } | undefined;
	return hit?.id ?? null;
}

/**
 * Inserts or updates an issue. A new issue whose title and type already exist updates that issue in place
 * (§7.2: the type includes the eye subtype, so a PMH never overwrites a POH). New issues are linked to
 * the visit they were added in. Returns null when the patient (or the edited issue) is not theirs.
 */
export function saveIssue(
	db: DB,
	patientId: number,
	userId: number,
	input: unknown,
	opts: { encounterId?: number | null; now?: Date; lang?: string } = {}
): { id: number; created: boolean } | null {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return null;
	const c = validateIssue(input);
	const now = opts.now ?? new Date();
	const at = now.toISOString();
	let id = c.id;
	if (id !== null) {
		if (!db.prepare('SELECT 1 FROM issues WHERE id = ? AND patient_id = ?').get(id, patientId)) return null;
		if (findDuplicate(db, patientId, c.type, c.title, id) !== null) {
			throw new PatientValidationError({ title: `"${c.title}" is already on this list.` });
		}
	} else {
		id = findDuplicate(db, patientId, c.type, c.title, null);
		// Updating in place keeps the stored spelling of the title.
		if (id !== null) c.title = (db.prepare('SELECT title FROM issues WHERE id = ?').get(id) as { title: string }).title;
	}
	const created = id === null;
	// Medication start left blank: today for eye meds, the visit date for other meds (§7.2).
	if (created && !c.begin && (c.type === 'EYEMED' || c.type === 'MED')) {
		const visit = opts.encounterId ? getEncounter(db, patientId, opts.encounterId) : null;
		c.begin = c.type === 'MED' && visit ? visit.date : localToday(now);
	}
	// Unchanged codes keep the set they were saved with; new or edited codes use the practice's set (D44).
	const old = created
		? undefined
		: (db.prepare('SELECT codes, code_system, code_uris, code_text, title_lang FROM issues WHERE id = ?').get(id) as
				| { codes: string; code_system: string; code_uris: string; code_text: string; title_lang: string }
				| undefined);
	const cd =
		old && old.codes === c.codes && isCodeSetId(old.code_system)
			? { codes: old.codes, codeSystem: old.code_system, codeUris: old.code_uris, codeText: old.code_text, titleLang: old.title_lang }
			: issueCodeDataIn(db, c.codes, currentCodeSet(db), opts.lang ?? 'en');
	if (created) {
		const { lastInsertRowid } = db
			.prepare(
				`INSERT INTO issues (patient_id, type, title, codes, code_system, code_uris, code_text, title_lang, begin_date, end_date, occurrence,
				                     reaction, outcome, provider, comments, encounter_id, created_at, created_by, updated_at, updated_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(patientId, c.type, c.title, cd.codes, cd.codeSystem, cd.codeUris, cd.codeText, cd.titleLang, c.begin, c.end, c.occurrence, c.reaction,
				c.outcome, c.provider, c.comments, opts.encounterId ?? null, at, userId, at, userId);
		id = Number(lastInsertRowid);
	} else {
		db.prepare(
			`UPDATE issues SET type = ?, title = ?, codes = ?, code_system = ?, code_uris = ?, code_text = ?, title_lang = ?, begin_date = ?, end_date = ?,
			                   occurrence = ?, reaction = ?, outcome = ?, provider = ?, comments = ?, updated_at = ?, updated_by = ?
			  WHERE id = ? AND patient_id = ?`
		).run(c.type, c.title, cd.codes, cd.codeSystem, cd.codeUris, cd.codeText, cd.titleLang, c.begin, c.end, c.occurrence, c.reaction, c.outcome,
			c.provider, c.comments, at, userId, id, patientId);
	}
	if (c.type === 'ALLERGY' && (!c.end || c.end > localToday(now))) clearNoKnownAllergies(db, patientId);
	return { id: id!, created };
}

/** Deletes an issue only if it belongs to this patient. */
export function deleteIssue(db: DB, patientId: number, issueId: number): boolean {
	if (!Number.isSafeInteger(issueId)) return false;
	return Number(db.prepare('DELETE FROM issues WHERE id = ? AND patient_id = ?').run(issueId, patientId).changes) > 0;
}

// ---------- shorthand (§2.4) ----------

/**
 * POH:/PMH:/POS:/SURG:/MEDS:/ALL: text -> issues. One issue per period-separated piece; allergies split at the
 * last space into title + reaction. An existing title of the same type is updated (and made active again)
 * instead of duplicated. Medications start on the visit date; other dates stay blank (FIX).
 * Returns null when the visit does not belong to the patient.
 */
export function addIssuesFromShorthand(
	db: DB,
	patientId: number,
	encounterId: number,
	userId: number,
	type: IssueType,
	text: string,
	now = new Date()
): ShorthandIssueResult | null {
	const enc = getEncounter(db, patientId, encounterId);
	if (!enc) return null;
	if (!ISSUE_TYPES.includes(type)) throw new PatientValidationError({ type: 'Unknown history type.' });
	const at = now.toISOString();
	const result: ShorthandIssueResult = { type, added: [], updated: [] };
	const insert = db.prepare(
		`INSERT INTO issues (patient_id, type, title, begin_date, reaction, encounter_id, created_at, created_by, updated_at, updated_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	db.exec('BEGIN');
	try {
		for (const piece of splitIssueText(typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ') : '').slice(0, 50)) {
			const { title: rawTitle, reaction: rawReaction } = type === 'ALLERGY' ? splitAllergy(piece) : { title: piece, reaction: '' };
			const title = rawTitle.slice(0, TITLE_MAX);
			const reaction = rawReaction.slice(0, REACTION_MAX);
			if (!title) continue;
			const dup = findDuplicate(db, patientId, type, title, null);
			if (dup !== null) {
				db.prepare(
					`UPDATE issues SET end_date = '', reaction = CASE WHEN ? <> '' THEN ? ELSE reaction END, updated_at = ?, updated_by = ?
					  WHERE id = ? AND patient_id = ?`
				).run(reaction, reaction, at, userId, dup, patientId);
				result.updated.push(title);
			} else {
				insert.run(patientId, type, title, type === 'MED' ? enc.date : '', reaction, encounterId, at, userId, at, userId);
				result.added.push(title);
			}
		}
		if (type === 'ALLERGY' && (result.added.length || result.updated.length)) clearNoKnownAllergies(db, patientId);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return result;
}

// ---------- family and social history (§7.5, §7.6) ----------

function insertVersion(db: DB, patientId: number, userId: number, kind: 'family' | 'social', patch: Record<string, string>, now: Date) {
	const latest = latestHistory(db, patientId, kind);
	// Merge onto the latest version: keys the editor did not send are kept, never blanked (§7.5 FIX).
	const merged = { ...latest, ...patch };
	for (const k of Object.keys(merged)) if (merged[k] === '') delete merged[k];
	if (JSON.stringify(merged) !== JSON.stringify(latest)) {
		db.prepare('INSERT INTO patient_history (patient_id, kind, data, saved_at, saved_by) VALUES (?, ?, ?, ?, ?)').run(
			patientId,
			kind,
			JSON.stringify(merged),
			now.toISOString(),
			userId
		);
	}
	return merged;
}

function historyObject(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PatientValidationError({ data: 'Expected an object of fields.' });
	return input as Record<string, unknown>;
}

/** Saves family history rows as a new version. Returns the merged history, or null for an unknown patient. */
export function saveFamily(db: DB, patientId: number, userId: number, input: unknown, now = new Date()): FamilyHistory | null {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return null;
	const errors: FieldErrors = {};
	const patch: Record<string, string> = {};
	for (const [k, v] of Object.entries(historyObject(input))) {
		if (!FH_KEYS.has(k)) {
			errors[k] = `Unknown family history row ${k}.`;
			continue;
		}
		patch[k] = line(k, 'Family history', v, HISTORY_VALUE_MAX, errors);
	}
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	return insertVersion(db, patientId, userId, 'family', patch, now);
}

const HABIT_LABEL = new Map(SOCIAL_HABITS.map((h) => [h.key, h.label]));

/**
 * Saves social history fields as a new version (FIX: stored dates are kept, and occupation can be cleared
 * by sending ''). Returns the merged history, or null for an unknown patient.
 */
export function saveSocial(db: DB, patientId: number, userId: number, input: unknown, now = new Date()): SocialHistory | null {
	if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(patientId)) return null;
	const errors: FieldErrors = {};
	const patch: Record<string, string> = {};
	for (const [k, v] of Object.entries(historyObject(input))) {
		if (!SOCIAL_KEYS.has(k)) {
			errors[k] = `Unknown social history field ${k}.`;
			continue;
		}
		const habit = HABIT_LABEL.get(k.replace(/_(status|date)$/, ''));
		if (k.endsWith('_status')) {
			const s = clean(v);
			if (s && !SOCIAL_STATUSES.some((x) => x.value === s)) errors[k] = `Choose a status for ${habit}.`;
			patch[k] = s;
		} else if (k.endsWith('_date')) {
			patch[k] = date(k, `${habit} date`, v, errors);
		} else {
			patch[k] = line(k, habit ?? 'Social history', v, HISTORY_VALUE_MAX, errors);
		}
	}
	if (Object.keys(errors).length) throw new PatientValidationError(errors);
	return insertVersion(db, patientId, userId, 'social', patch, now);
}

// ---------- quick-pick titles (§7.2) ----------

function daysBefore(day: string, n: number): string {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

/**
 * Most frequent titles of each type among patients this provider saw in the last 30 days
 * (top 20 for PMH, top 10 otherwise); fewer than 4 falls back to the built-in list.
 */
export function quickPickTitles(db: DB, providerId: number, today = localToday()): Record<IssueType, TitlePick[]> {
	// Codes only of the practice's current set (D44): an ICD-11 practice never gets an ICD-10-CM code here.
	const set = currentCodeSet(db);
	const q = db.prepare(
		`SELECT MIN(i.title) AS title, COALESCE(MAX(CASE WHEN i.code_system = ? THEN i.codes END), '') AS codes, COUNT(*) AS n FROM issues i
		  WHERE i.type = ? AND i.patient_id IN (SELECT e.patient_id FROM encounters e WHERE e.provider_id = ? AND e.date >= ? AND e.date <= ?)
		  GROUP BY i.title COLLATE NOCASE ORDER BY n DESC, MIN(i.title) COLLATE NOCASE LIMIT ?`
	);
	const since = daysBefore(today, 30);
	const out = {} as Record<IssueType, TitlePick[]>;
	for (const type of ISSUE_TYPES) {
		const rows = q.all(set, type, providerId, since, today, type === 'PMH' ? 20 : 10) as { title: string; codes: string }[];
		// The built-in list's codes are ICD-10-CM: an ICD-11 practice gets the titles only.
		const builtin = set === 'icd10cm' ? BUILTIN_TITLES[type] : BUILTIN_TITLES[type].map((t) => ({ title: t.title, codes: '' }));
		out[type] = rows.length >= 4 ? rows.map((r) => ({ title: r.title, codes: r.codes })) : builtin;
	}
	return out;
}
