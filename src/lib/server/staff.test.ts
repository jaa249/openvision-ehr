// Visit staff (decision D43): the authorizing provider and the technician who worked the visit up.
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, seedDemo, type DB } from './db.ts';
import { getEncounter } from './exam.ts';
import { toCsv, toFhirBundle } from './export.ts';
import { activeProviders, activeTechnicians, createEncounter, noteTechnician, PatientValidationError, setVisitStaff } from './patients.ts';
import { getPrintables, listEncounters } from './report.ts';
import { signExam } from './signing.ts';

const TODAY = '2026-10-06';
// Demo accounts: 1 provider (Dr. Example), 2 technician (Casey Tech), 3 admin.
const DR = 1;
const TECH = 2;
const ADMIN = 3;
let db: DB;
beforeEach(() => {
	db = openDatabase(':memory:');
	seedDemo(db, TODAY);
});

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof PatientValidationError) return e.errors;
		throw e;
	}
	return null;
};
const visit = { date: TODAY, visitType: 'Urgent' };

describe('starting a visit', () => {
	it('records the provider and the technician', () => {
		const id = createEncounter(db, 2, { providerId: DR, technicianId: TECH }, visit, TODAY)!;
		expect(getEncounter(db, 2, id)).toMatchObject({ providerId: DR, provider: 'Dr. Example', technicianId: TECH, technician: 'Casey Tech (demo)' });
	});

	it('a provider alone has no technician', () => {
		const id = createEncounter(db, 2, DR, visit, TODAY)!;
		expect(getEncounter(db, 2, id)).toMatchObject({ providerId: DR, technicianId: null, technician: null });
	});

	it('the provider must be an active provider account; the technician a technician', () => {
		expect(errorsOf(() => createEncounter(db, 2, { providerId: TECH }, visit, TODAY))?.provider).toMatch(/provider/);
		expect(errorsOf(() => createEncounter(db, 2, { providerId: ADMIN }, visit, TODAY))?.provider).toBeTruthy();
		expect(errorsOf(() => createEncounter(db, 2, { providerId: 0 }, visit, TODAY))?.provider).toBeTruthy();
		expect(errorsOf(() => createEncounter(db, 2, { providerId: DR, technicianId: ADMIN }, visit, TODAY))?.technician).toBeTruthy();
		db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(DR);
		expect(errorsOf(() => createEncounter(db, 2, { providerId: DR }, visit, TODAY))?.provider).toBeTruthy();
	});

	it('pickers list only active accounts of the role', () => {
		expect(activeProviders(db).map((u) => u.id)).toEqual([DR]);
		expect(activeTechnicians(db).map((u) => u.id)).toEqual([TECH]);
	});
});

describe('changing the staff before signing', () => {
	it('sets and clears the technician, scoped to the patient', () => {
		const id = createEncounter(db, 2, DR, visit, TODAY)!;
		expect(setVisitStaff(db, 2, id, { providerId: DR, technicianId: TECH })).toBe(true);
		expect(getEncounter(db, 2, id)?.technicianId).toBe(TECH);
		expect(setVisitStaff(db, 2, id, { providerId: DR, technicianId: null })).toBe(true);
		expect(getEncounter(db, 2, id)?.technicianId).toBeNull();
		expect(setVisitStaff(db, 1, id, { providerId: DR })).toBe(false);
		expect(errorsOf(() => setVisitStaff(db, 2, id, { providerId: TECH }))?.provider).toBeTruthy();
	});

	it('is final once the exam is signed', () => {
		signExam(db, 1, 1, { id: DR, role: 'provider', displayName: 'Dr. Example' }, null);
		expect(() => setVisitStaff(db, 1, 1, { providerId: DR, technicianId: TECH })).toThrow(/final/);
		noteTechnician(db, 1, { id: TECH, role: 'tech' }); // a tech's addendum later must not add them either
		expect(getEncounter(db, 1, 1)?.technicianId).toBeNull();
	});
});

describe('a technician working on a visit', () => {
	it('becomes its technician when none is recorded, never replacing one', () => {
		const id = createEncounter(db, 2, DR, visit, TODAY)!;
		noteTechnician(db, id, { id: DR, role: 'provider' });
		expect(getEncounter(db, 2, id)?.technicianId).toBeNull();
		noteTechnician(db, id, { id: TECH, role: 'tech' });
		expect(getEncounter(db, 2, id)?.technicianId).toBe(TECH);
		db.prepare("INSERT INTO users (id, username, display_name, role, active, created_at) VALUES (9, 'tech2', 'Second Tech', 'tech', 1, ?)").run(TODAY);
		noteTechnician(db, id, { id: 9, role: 'tech' });
		expect(getEncounter(db, 2, id)?.technicianId).toBe(TECH);
	});
});

describe('where both names appear', () => {
	it('encounter list, CSV and FHIR', () => {
		const id = createEncounter(db, 2, { providerId: DR, technicianId: TECH }, visit, TODAY)!;
		expect(listEncounters(db, {}).find((e) => e.id === id)).toMatchObject({ provider: 'Dr. Example', technician: 'Casey Tech (demo)' });

		const csv = toCsv(getPrintables(db, [id])).slice(1).split('\r\n');
		const head = csv[0].split(',');
		expect(csv[1].split(',')[head.indexOf('Technician')]).toBe('Casey Tech (demo)');

		const bundle = toFhirBundle(getPrintables(db, [id]), new Date(`${TODAY}T12:00:00Z`)) as { entry: { resource: Record<string, any> }[] };
		const enc = bundle.entry.map((e) => e.resource).find((r) => r.resourceType === 'Encounter')!;
		expect(enc.participant.map((p: any) => p.type[0].coding[0].code)).toEqual(['PPRF', 'SPRF']);
		const names = bundle.entry.map((e) => e.resource).filter((r) => r.resourceType === 'Practitioner').map((r) => r.name[0].text);
		expect(names.sort()).toEqual(['Casey Tech (demo)', 'Dr. Example']);
	});
});

describe('migration', () => {
	it('moves a technician listed as provider to technician and gives the visit a provider', () => {
		const raw = new DatabaseSync(':memory:');
		migrate(raw, 12); // everything before the staff migration (the code-set, D44, billing-aid, D46, translations, D48, and ICD-11 titles, D50, migrations follow it)
		const at = '2026-10-01T00:00:00Z';
		raw.exec(`INSERT INTO users (id, username, display_name, role, active, created_at) VALUES
			(1, 'dr', 'Dr. One', 'provider', 1, '${at}'), (2, 'tech', 'Tech Two', 'tech', 1, '${at}'), (3, 'adm', 'Admin', 'admin', 1, '${at}')`);
		raw.exec("INSERT INTO patients (id, mrn, legal_first, legal_last, dob) VALUES (5, '5', 'Pat', 'Old', '1950-01-01')");
		raw.exec(`INSERT INTO encounters (id, patient_id, provider_id, date, visit_type) VALUES
			(10, 5, 1, '2026-10-01', 'Urgent'), (11, 5, 2, '2026-10-01', 'Urgent'), (12, 5, 3, '2026-10-01', 'Urgent')`);
		migrate(raw);
		expect(raw.prepare('SELECT id, provider_id, technician_id FROM encounters ORDER BY id').all()).toEqual([
			{ id: 10, provider_id: 1, technician_id: null },
			{ id: 11, provider_id: 1, technician_id: 2 },
			{ id: 12, provider_id: 1, technician_id: null }
		]);
	});
});
