// OpenVision's own coding-terms list for the findings engine (spec §10.3), written for this project.
// Order matters: more specific terms come first, so "cicatricial ectropion" claims a field before
// "ectropion" (a term is skipped when an earlier hit in the same field already contains it).
//
// location: an exam field root (catalog row id). The engine reads both eyes' fields for it
//   (OD/OS for globe sections, R/L for External) and takes laterality from the field prefix.
// code: an ICD-10-CM code, used only when the practice codes with ICD-10-CM. ICD-11 never reads it
//   (no crosswalk): it searches WHO titles with the term's words and the field description.
// code (ICD-10-CM): a billable code is used as is; a category ("H25.1") is narrowed to
//   the right / left / bilateral code using the field description below (e.g. "upper eyelid").
// options: special rules (DM, RVO, IOL); any other word is added to the code search.
// No code and no options: the engine searches the code set (path C).
// label: the item title when the term is an abbreviation (default: the term, capitalised).
//   With ICD-11 (D44) the label, or else the term, is also what WHO titles are searched for.
// prefer: extra words that pick among a category's codes (e.g. "initial encounter").

export type TermOption = 'DM' | 'RVO' | 'IOL' | (string & {});

export interface CodingTerm {
	term: string;
	location: string;
	code?: string;
	options?: TermOption[];
	label?: string;
	prefer?: string[];
}

/** Plain-language description of each field root, used to narrow and search codes (§10.3 path C FIX). */
export const FIELD_DESCRIPTIONS: Record<string, string> = {
	BROW: 'brow',
	UL: 'upper eyelid',
	LL: 'lower eyelid',
	MCT: 'lacrimal passage',
	ADNEXA: 'orbit',
	CONJ: 'conjunctiva',
	CORNEA: 'cornea',
	AC: 'anterior chamber',
	IRIS: 'iris',
	LENS: 'lens',
	GONIO: 'angle',
	DISC: 'optic disc',
	CUP: 'optic disc',
	MACULA: 'macula',
	VESSELS: 'retinal vessels',
	VITREOUS: 'vitreous',
	PERIPH: 'retina'
};

export const CODING_TERMS: CodingTerm[] = [
	// ---- External: brow and lids ----
	{ term: 'brow ptosis', location: 'BROW', code: 'H57.81' },
	{ term: 'mechanical ptosis', location: 'UL', code: 'H02.41' },
	{ term: 'myogenic ptosis', location: 'UL', code: 'H02.42' },
	{ term: 'ptosis', location: 'UL', code: 'H02.40' },
	{ term: 'dermatochalasis', location: 'UL', code: 'H02.83' },
	{ term: 'dermatochalasis', location: 'LL', code: 'H02.83' },
	{ term: 'cicatricial ectropion', location: 'LL', code: 'H02.11' },
	{ term: 'senile ectropion', location: 'LL', code: 'H02.13' },
	{ term: 'ectropion', location: 'LL', code: 'H02.10' },
	{ term: 'cicatricial entropion', location: 'LL', code: 'H02.01' },
	{ term: 'senile entropion', location: 'LL', code: 'H02.03' },
	{ term: 'entropion', location: 'LL', code: 'H02.00' },
	{ term: 'trichiasis', location: 'UL', code: 'H02.05' },
	{ term: 'trichiasis', location: 'LL', code: 'H02.05' },
	{ term: 'lagophthalmos', location: 'UL', code: 'H02.20' },
	{ term: 'meibomian gland dysfunction', location: 'UL', code: 'H02.88' },
	{ term: 'MGD', location: 'UL', code: 'H02.88', label: 'Meibomian gland dysfunction' },
	{ term: 'MGD', location: 'LL', code: 'H02.88', label: 'Meibomian gland dysfunction' },
	{ term: 'blepharitis', location: 'UL', code: 'H01.00' },
	{ term: 'blepharitis', location: 'LL', code: 'H01.00' },
	{ term: 'chalazion', location: 'UL', code: 'H00.1' },
	{ term: 'chalazion', location: 'LL', code: 'H00.1' },
	{ term: 'hordeolum', location: 'UL', code: 'H00.01' },
	{ term: 'xanthelasma', location: 'UL', code: 'H02.6' },
	{ term: 'blepharospasm', location: 'UL', code: 'G24.5' },
	{ term: 'nasolacrimal duct obstruction', location: 'MCT', code: 'H04.55' },
	{ term: 'NLDO', location: 'MCT', code: 'H04.55', label: 'Nasolacrimal duct obstruction' },
	{ term: 'dacryocystitis', location: 'MCT', code: 'H04.30' },

	// ---- Anterior segment ----
	{ term: 'pinguecula', location: 'CONJ', code: 'H11.15' },
	{ term: 'pterygium', location: 'CONJ', code: 'H11.00' },
	{ term: 'subconjunctival hemorrhage', location: 'CONJ', code: 'H11.3' },
	{ term: 'giant papillary conjunctivitis', location: 'CONJ', code: 'H10.41' },
	{ term: 'GPC', location: 'CONJ', code: 'H10.41', label: 'Giant papillary conjunctivitis' },
	{ term: 'allergic conjunctivitis', location: 'CONJ', code: 'H10.45' },
	{ term: 'conjunctivochalasis', location: 'CONJ', code: 'H11.82' },
	{ term: 'conjunctivitis', location: 'CONJ' },
	{ term: 'corneal abrasion', location: 'CORNEA', code: 'S05.0', prefer: ['initial encounter'] },
	{ term: 'recurrent erosion', location: 'CORNEA', code: 'H18.83' },
	{ term: 'corneal ulcer', location: 'CORNEA', code: 'H16.00' },
	{ term: 'Fuchs dystrophy', location: 'CORNEA', code: 'H18.51' },
	{ term: 'guttata', location: 'CORNEA', code: 'H18.51', label: 'Corneal guttata' },
	{ term: 'keratoconus', location: 'CORNEA', code: 'H18.60' },
	{ term: 'band keratopathy', location: 'CORNEA', code: 'H18.42' },
	{ term: 'arcus', location: 'CORNEA', code: 'H18.41' },
	{ term: 'corneal edema', location: 'CORNEA', code: 'H18.20' },
	{ term: 'SPK', location: 'CORNEA', code: 'H16.14', label: 'Superficial punctate keratitis' },
	{ term: 'KCS', location: 'CORNEA', code: 'H16.22', label: 'Keratoconjunctivitis sicca' },
	{ term: 'dry eye', location: 'CORNEA', code: 'H04.12' },
	{ term: 'corneal scar', location: 'CORNEA' },
	{ term: 'hyphema', location: 'AC', code: 'H21.0' },
	{ term: 'iritis', location: 'AC', code: 'H20.9' },
	{ term: 'narrow angle', location: 'GONIO', code: 'H40.03' },
	{ term: 'narrow angle', location: 'AC', code: 'H40.03' },
	{ term: 'rubeosis', location: 'IRIS', code: 'H21.1' },
	{ term: 'NVI', location: 'IRIS', code: 'H21.1', label: 'Iris neovascularization' },
	{ term: 'iris nevus', location: 'IRIS', code: 'D31.4' },
	{ term: 'posterior subcapsular cataract', location: 'LENS', code: 'H25.04' },
	{ term: 'PSC', location: 'LENS', code: 'H25.04', label: 'Posterior subcapsular cataract' },
	{ term: 'cortical cataract', location: 'LENS', code: 'H25.01' },
	{ term: 'nuclear sclerosis', location: 'LENS', code: 'H25.1' },
	{ term: 'NS', location: 'LENS', code: 'H25.1', label: 'Nuclear sclerosis' },
	{ term: 'PCO', location: 'LENS', code: 'H26.49', label: 'Posterior capsule opacification' },
	{ term: 'PCIOL', location: 'LENS', code: 'Z96.1', label: 'Pseudophakia' },
	{ term: 'pseudophakia', location: 'LENS', code: 'Z96.1' },
	{ term: 'aphakia', location: 'LENS', code: 'H27.0' },
	{ term: 'cataract', location: 'LENS', code: 'H26.9' },

	// ---- Fundus ----
	// Diabetic retinopathy: any of these runs the DM rule once per eye (severity from all fields).
	{ term: 'NVD', location: 'DISC', options: ['DM'] },
	{ term: 'NVE', location: 'VESSELS', options: ['DM'] },
	{ term: 'NVE', location: 'PERIPH', options: ['DM'] },
	{ term: 'PPDR', location: 'VESSELS', options: ['DM'] },
	{ term: 'IRMA', location: 'MACULA', options: ['DM'] },
	{ term: 'IRMA', location: 'VESSELS', options: ['DM'] },
	{ term: 'IRMA', location: 'PERIPH', options: ['DM'] },
	{ term: 'BDR', location: 'MACULA', options: ['DM'] },
	{ term: 'BDR', location: 'VESSELS', options: ['DM'] },
	{ term: 'BDR', location: 'PERIPH', options: ['DM'] },
	// Edema after recent cataract surgery in the same eye (IOL rule); otherwise these do not code.
	{ term: 'CSME', location: 'MACULA', options: ['IOL'], label: 'Post-cataract CME' },
	{ term: 'CME', location: 'MACULA', options: ['IOL'], label: 'Post-cataract CME' },
	{ term: 'CME', location: 'MACULA', code: 'H35.35', label: 'Cystoid macular edema' },
	{ term: 'macular edema', location: 'MACULA', code: 'H35.81' },
	{ term: 'disc edema', location: 'DISC', code: 'H47.10' },
	{ term: 'papilledema', location: 'DISC', code: 'H47.10' },
	{ term: 'disc drusen', location: 'DISC', code: 'H47.32' },
	{ term: 'optic atrophy', location: 'DISC', code: 'H47.20' },
	{ term: 'pallor', location: 'DISC', code: 'H47.20', label: 'Optic disc pallor' },
	{ term: 'non-exudative AMD', location: 'MACULA', code: 'H35.31', prefer: ['stage unspecified'], label: 'Nonexudative AMD' },
	{ term: 'wet AMD', location: 'MACULA', code: 'H35.32', prefer: ['stage unspecified'], label: 'Exudative AMD' },
	{ term: 'CNVM', location: 'MACULA', code: 'H35.32', prefer: ['active choroidal neovascularization'], label: 'Exudative AMD with CNV' },
	{ term: 'dry AMD', location: 'MACULA', code: 'H35.31', prefer: ['stage unspecified'], label: 'Nonexudative AMD' },
	{ term: 'AMD', location: 'MACULA', code: 'H35.30', label: 'Macular degeneration' },
	{ term: 'drusen', location: 'MACULA', code: 'H35.36' },
	{ term: 'ERM', location: 'MACULA', code: 'H35.37', label: 'Epiretinal membrane' },
	{ term: 'epiretinal membrane', location: 'MACULA', code: 'H35.37' },
	{ term: 'macular hole', location: 'MACULA', code: 'H35.34' },
	{ term: 'CSR', location: 'MACULA', code: 'H35.71', label: 'Central serous chorioretinopathy' },
	{ term: 'CRVO', location: 'VESSELS', code: 'H34.81', options: ['RVO'], label: 'Central retinal vein occlusion' },
	{ term: 'central retinal vein occlusion', location: 'VESSELS', code: 'H34.81', options: ['RVO'] },
	{ term: 'BRVO', location: 'VESSELS', code: 'H34.83', options: ['RVO'], label: 'Branch retinal vein occlusion' },
	{ term: 'branch retinal vein occlusion', location: 'VESSELS', code: 'H34.83', options: ['RVO'] },
	{ term: 'CRAO', location: 'VESSELS', code: 'H34.1', label: 'Central retinal artery occlusion' },
	{ term: 'BRAO', location: 'VESSELS', code: 'H34.23', label: 'Branch retinal artery occlusion' },
	{ term: 'hypertensive retinopathy', location: 'VESSELS', code: 'H35.03' },
	{ term: 'vitreous hemorrhage', location: 'VITREOUS', code: 'H43.1' },
	{ term: 'PVD', location: 'VITREOUS', code: 'H43.81', label: 'Posterior vitreous detachment' },
	{ term: 'floaters', location: 'VITREOUS', code: 'H43.39' },
	{ term: 'asteroid hyalosis', location: 'VITREOUS', code: 'H43.2' },
	{ term: 'retinal detachment', location: 'PERIPH', code: 'H33.00' },
	{ term: 'horseshoe tear', location: 'PERIPH', code: 'H33.31' },
	{ term: 'retinal tear', location: 'PERIPH', code: 'H33.31' },
	{ term: 'lattice', location: 'PERIPH', code: 'H35.41', label: 'Lattice degeneration' },
	{ term: 'retinoschisis', location: 'PERIPH', code: 'H33.10' },
	{ term: 'chorioretinal scar', location: 'PERIPH', code: 'H31.00' },
	{ term: 'choroidal nevus', location: 'PERIPH', code: 'D31.3' },
	{ term: 'nevus', location: 'PERIPH', code: 'D31.3', label: 'Choroidal nevus' }
];
