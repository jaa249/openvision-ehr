// Fixed lists for the PMSFH editor (spec §7.2, §7.5, §7.6): type labels and field sets,
// course/outcome options, family and social rows, and the built-in quick-pick titles.
// Our own short, generic lists (clean room); a provider's own frequent titles take over once they exist.
import type { IssueType, TitlePick } from './types.ts';

export interface IssueTypeDef {
	type: IssueType;
	/** Short heading in the summary (§1.3). */
	short: string;
	/** Long name for buttons and screen readers. */
	label: string;
	/** Label of the title box (§7.2 table). */
	titleLabel: string;
	codes: boolean;
	/** Which date boxes show, and what they are called. */
	begin: string | null;
	end: string | null;
	provider: string | null;
	outcome: boolean;
	occurrence: boolean;
	reaction: boolean;
	/** Shows the Active checkbox (end date blank = active). */
	activeBox: boolean;
	/** Medication types show the "Eye med" checkbox, which switches between EYEMED and MED (§7.7 FIX). */
	eyeMedBox: boolean;
}

const def = (d: Partial<IssueTypeDef> & Pick<IssueTypeDef, 'type' | 'short' | 'label' | 'titleLabel'>): IssueTypeDef => ({
	codes: false,
	begin: null,
	end: null,
	provider: null,
	outcome: false,
	occurrence: false,
	reaction: false,
	activeBox: false,
	eyeMedBox: false,
	...d
});

export const ISSUE_TYPE_DEFS: readonly IssueTypeDef[] = [
	def({ type: 'POH', short: 'POH', label: 'Past ocular history', titleLabel: 'Eye diagnosis', codes: true, begin: 'Date', provider: 'Collaborator' }),
	def({ type: 'POS', short: 'POS', label: 'Past ocular surgery', titleLabel: 'Procedure', codes: true, begin: 'Date', provider: 'Surgeon', outcome: true }),
	def({ type: 'EYEMED', short: 'Eye meds', label: 'Eye medications', titleLabel: 'Medication', begin: 'Start', end: 'Finish', activeBox: true, eyeMedBox: true }),
	def({ type: 'PMH', short: 'PMH', label: 'Past medical history', titleLabel: 'Diagnosis', codes: true, begin: 'Onset', end: 'Resolved', occurrence: true, activeBox: true }),
	def({ type: 'MED', short: 'Medication', label: 'Medications (non-eye)', titleLabel: 'Medication', begin: 'Start', end: 'Finish', activeBox: true, eyeMedBox: true }),
	def({ type: 'SURG', short: 'Surgery', label: 'Surgery (non-eye)', titleLabel: 'Procedure', codes: true, begin: 'Date', provider: 'Surgeon', outcome: true }),
	def({ type: 'ALLERGY', short: 'Allergy', label: 'Allergies', titleLabel: 'Allergic to', begin: 'Start', reaction: true })
];

export const ISSUE_TYPE_DEF = new Map(ISSUE_TYPE_DEFS.map((d) => [d.type, d]));

/** PMH course (§7.2 "occurrence list"). Only 'chronic' feeds the HPI chronic boxes (§7.4). */
export const OCCURRENCES = [
	{ value: '', label: 'Not specified' },
	{ value: 'first', label: 'First episode' },
	{ value: 'recurrent', label: 'Recurrent' },
	{ value: 'chronic', label: 'Chronic' },
	{ value: 'acute on chronic', label: 'Acute on chronic' }
] as const;

/** Surgery outcome; "resolved" also sets the end date in the editor (§7.2). */
export const OUTCOMES = [
	{ value: '', label: 'Not specified' },
	{ value: 'resolved', label: 'Resolved' },
	{ value: 'improved', label: 'Improved' },
	{ value: 'unchanged', label: 'Unchanged' },
	{ value: 'worse', label: 'Worse' },
	{ value: 'complication', label: 'Complication' }
] as const;

// ---------- family history (§7.5) ----------

/** Stored text for a row marked Negative. */
export const FH_NEGATIVE = 'negative';

export const FH_ROWS: readonly { key: string; label: string; group: 'eye' | 'general' | 'summary' }[] = [
	{ key: 'glaucoma', label: 'Glaucoma', group: 'eye' },
	{ key: 'cataract', label: 'Cataract', group: 'eye' },
	{ key: 'amd', label: 'AMD', group: 'eye' },
	{ key: 'rd', label: 'Retinal detachment', group: 'eye' },
	{ key: 'blindness', label: 'Blindness', group: 'eye' },
	{ key: 'amblyopia', label: 'Amblyopia', group: 'eye' },
	{ key: 'strabismus', label: 'Strabismus', group: 'eye' },
	{ key: 'other', label: 'Other eye', group: 'eye' },
	{ key: 'epilepsy', label: 'Epilepsy', group: 'general' },
	{ key: 'cancer', label: 'Cancer', group: 'general' },
	{ key: 'diabetes', label: 'Diabetes', group: 'general' },
	{ key: 'htn', label: 'Hypertension', group: 'general' },
	{ key: 'cardiac', label: 'Heart disease', group: 'general' },
	{ key: 'stroke', label: 'Stroke', group: 'general' },
	// Summarized but not in the editor grid (parity); a save never blanks them (§7.5 FIX).
	{ key: 'psych', label: 'Psychiatric', group: 'summary' },
	{ key: 'suicide', label: 'Suicide', group: 'summary' }
];
export const FH_KEYS = new Set(FH_ROWS.map((r) => r.key));

// ---------- social history (§7.6) ----------

export const SOCIAL_STATUSES = [
	{ value: 'current', label: 'Current' },
	{ value: 'quit', label: 'Quit' },
	{ value: 'never', label: 'Never' },
	{ value: 'na', label: 'N/A' }
] as const;

/** Habits with note + status + date, in editor order; `short` is the summary label (§7.6). */
export const SOCIAL_HABITS: readonly { key: string; label: string; short: string }[] = [
	{ key: 'tobacco', label: 'Tobacco', short: 'Cigs' },
	{ key: 'coffee', label: 'Caffeine', short: 'Caffeine' },
	{ key: 'alcohol', label: 'Alcohol', short: 'ETOH' },
	{ key: 'drugs', label: 'Recreational drugs', short: 'Drug use' },
	{ key: 'counseling', label: 'Counseling', short: 'Therapy' },
	{ key: 'exercise', label: 'Exercise', short: 'Exercise' },
	{ key: 'risky', label: 'Risky behavior', short: 'Thrills' }
];
/** Plain text fields. */
export const SOCIAL_TEXT: readonly { key: string; label: string; short: string }[] = [
	{ key: 'marital', label: 'Marital status', short: 'Marital' },
	{ key: 'occupation', label: 'Occupation', short: 'Occupation' },
	{ key: 'sleep', label: 'Sleep', short: 'Sleep' },
	{ key: 'seatbelt', label: 'Seatbelt use', short: 'Seatbelt' }
];
/** Every storable social key: text fields plus <habit>, <habit>_status, <habit>_date. */
export const SOCIAL_KEYS = new Set([
	...SOCIAL_TEXT.map((f) => f.key),
	...SOCIAL_HABITS.flatMap((h) => [h.key, `${h.key}_status`, `${h.key}_date`])
]);

// ---------- built-in quick-pick titles (§7.2 fallback when a provider has fewer than 4 of their own) ----------

const t = (title: string, codes = ''): TitlePick => ({ title, codes });

export const BUILTIN_TITLES: Record<IssueType, TitlePick[]> = {
	POH: [t('Glaucoma suspect'), t('Glaucoma', 'H40.9'), t('Cataract', 'H26.9'), t('Dry eye'), t('Macular degeneration'), t('Diabetic retinopathy'), t('Amblyopia'), t('Strabismus'), t('Myopia'), t('Retinal detachment')],
	POS: [t('Cataract extraction with IOL'), t('LASIK'), t('PRK'), t('YAG capsulotomy'), t('Laser trabeculoplasty'), t('Laser peripheral iridotomy'), t('Trabeculectomy'), t('Retinal laser'), t('Vitrectomy'), t('Blepharoplasty')],
	EYEMED: [t('Artificial tears'), t('Latanoprost'), t('Timolol'), t('Brimonidine'), t('Dorzolamide'), t('Prednisolone acetate'), t('Moxifloxacin'), t('Cyclosporine'), t('Ketotifen'), t('Lubricating ointment')],
	PMH: [t('Hypertension', 'I10'), t('Type 2 diabetes', 'E11.9'), t('Hyperlipidemia', 'E78.5'), t('Asthma'), t('Hypothyroidism'), t('Migraine'), t('Rheumatoid arthritis'), t('Sleep apnea'), t('Coronary artery disease'), t('Anxiety'), t('Depression'), t('GERD')],
	MED: [t('Lisinopril'), t('Metformin'), t('Atorvastatin'), t('Amlodipine'), t('Levothyroxine'), t('Aspirin'), t('Omeprazole'), t('Albuterol inhaler'), t('Insulin'), t('Tamsulosin')],
	SURG: [t('Appendectomy'), t('Cholecystectomy'), t('Hysterectomy'), t('Knee replacement'), t('Hip replacement'), t('Coronary bypass'), t('Tonsillectomy'), t('Hernia repair'), t('C-section'), t('Carpal tunnel release')],
	ALLERGY: [t('Sulfa'), t('Penicillin'), t('Latex'), t('NSAIDs'), t('Codeine'), t('Iodine'), t('Aspirin'), t('Neomycin'), t('Shellfish'), t('Adhesive tape')]
};
