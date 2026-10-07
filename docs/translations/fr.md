# French (fr) translation glossary

> **Machine-drafted translation awaiting review by a native French-speaking eye-care professional**
> (optometrist or ophthalmologist). Until then the language is shown as "Français (draft translation)".

Register: international French, "vous" form, standard clinical vocabulary of French-language ophthalmology
and optometry textbooks and clinic software. Codes are kept as in D48: OD / OS / OU, CPT, ICD-10-CM, ICD-11,
units (mmHg, mm, D, µm), Snellen values (20/20, 6/6), shorthand codes, file formats (PDF, CSV, FHIR).

Typography: a plain space before `:`, `;`, `?` and `!` (a reviewer may prefer U+00A0 / U+202F no-break
spaces); quotation marks are « … »; decimal comma in prose ("0,25 D") but recorded values keep the
entered form (+1.25, 090, logMAR 0.3).

Plurals: French CLDR categories are `one`, `many`, `other`. Every plural key has `_one`, `_many` and `_other`;
`_many` (used for large round numbers such as 1 000 000) is identical to `_other`. Note that French `one`
covers 0 and 1 ("0 fichier").

Diagnosis search (D50): ICD-10-CM titles are English (a US code set). ICD-11 titles are WHO's: when the
practice has downloaded WHO's official file for this language (Settings › Code sets), the code finder
searches and shows WHO's titles in it, otherwise English; English words and codes always work. We never
translate an ICD title. So `plan.newDxPlaceholderIcd10/11` keep the official English titles exactly
("Preglaucoma, unspecified, bilateral H40.003", "Primary open-angle glaucoma, unspecified 9C61.0Z&XK9J")
and only the plan line is translated; `codes.finderPlaceholderIcd10/11` keep their English search words;
`codes.finderPlaceholderIcd11Lang` (shown when WHO's titles in this language are loaded) names the
language through `{language}` and gives only a code as the example. The finding examples in
`plan.srcFindingsEmpty` ("2+ NS", "dermatochalasis") stay in English because the findings parser reads
English.

## Glossary

| English | French | Note |
|---|---|---|
| Visit / encounter | Consultation | Both English words map to one term |
| Exam | Examen | |
| Finding(s) | Observation(s) | "Constatation" also possible |
| Provider | Praticien | Covers ophthalmologist and optometrist |
| Technician / Tech | Technicien / Tech. | |
| Admin | Admin / Administrateur | |
| Practice | Cabinet | "Centre" for larger clinics |
| Patient chart | Dossier du patient | |
| MRN | N° de dossier / Dossier | Short "Dossier {mrn}" in dense lines |
| DOB | Né(e) le / Date de naissance | |
| Legal name | Nom d'état civil | |
| Preferred name | Nom d'usage | |
| y (age) | ans | |
| Sign / signed | Signer / signé | Electronic signature |
| Addendum / addenda | Addendum / addenda | |
| Read-only | Lecture seule | |
| Take over | Prendre la main | Edit lock takeover |
| Audit log | Journal d'audit | |
| Settings / My settings | Paramètres / Mes paramètres | |
| Upload | Importer | "Téléverser" (Québec) avoided |
| Visual acuity (VA) | Acuité visuelle (AV) | |
| sc / cc | sc / ac | sans correction / avec correction |
| PH (pinhole) | TS (trou sténopéique) | |
| CTL | LC (lentilles de contact) | |
| MR (manifest) | Subj (réfraction subjective) | Row label |
| CR (cycloplegic) | Cyclo (sous cycloplégie) | Row label |
| AR (autorefraction) | AR (autoréfraction) | |
| LI (laser interferometer) | IL | |
| Glare | Éblouissement / Éblouis. | Row label abbreviated |
| Contrast | Contraste | |
| IOP | PIO (pression intraoculaire) | |
| Target IOP | PIO cible | |
| Applanation | Aplanation | Short "Apl" |
| Finger tension | Palpation digitale | |
| Tension (row label) | Tonométrie | |
| Pupils | Pupilles | |
| APD | DPA (déficit pupillaire afférent) | |
| Dilation / dilated | Dilatation / dilaté | |
| Dilating drops | Collyres mydriatiques | |
| Refraction | Réfraction | |
| Manifest (dry) | Subjective (sans cycloplégie) | |
| Cycloplegic (wet) | Sous cycloplégie | |
| Sphere / cylinder / axis | Sphère / cylindre / axe | Sph / Cyl / Axe |
| Plus / minus cylinder | Cylindre positif / négatif | |
| Transpose | Transposer | |
| ADD / Mid ADD | ADD / ADD int. | Addition kept as "ADD" |
| PD | EP (écart pupillaire) | |
| Vertex distance | Distance verre-œil (DVO) | |
| Base curve (BC) | Rayon de courbure (RC) | |
| Diameter | Diamètre (Diam) | |
| Prism / prism diopters | Prisme / dioptries prismatiques | |
| Slab-off | Slab-off | Kept: no common French term |
| Single vision / bifocal / progressive | Unifocal / bifocal / progressif | |
| Spectacle Rx | Ordonnance de lunettes | |
| Contact lens Rx | Ordonnance de lentilles de contact | |
| Rx (prescription) | Ordonnance | |
| Dispensed Rx | Ordonnances délivrées | |
| Lens material / treatments | Matériau / traitements du verre | |
| Fitting data | Données de montage | |
| Slit lamp | Lampe à fente | |
| Anterior segment | Segment antérieur | |
| Fundus | Fond d'œil | |
| External | Externe / Examen externe | |
| Lid / brow | Paupière / sourcil | |
| Medial canthus | Canthus interne | |
| Adnexa | Annexes | |
| Levator function | Fonction du releveur | |
| Vertical fissure | Fente palpébrale | |
| CN V / CN VII | NC V / NC VII | nerf crânien |
| Conjunctiva / cornea | Conjonctive / cornée | |
| Anterior chamber | Chambre antérieure | |
| Lens (crystalline) | Cristallin | Spectacle lens = verre; contact lens = lentille |
| Disc / cup | Papille / excavation | |
| C/D ratio | Rapport C/D | |
| Vitreous / periphery | Vitré / périphérie | |
| Tear break-up time | Temps de rupture lacrymale | "BUT" also used |
| Gonioscopy / pachymetry | Gonioscopie / pachymétrie | |
| Visual field(s) (VF) | Champ(s) visuel(s) (CV) | |
| Confrontation | Par confrontation | |
| Full to CF | Complet au CLD | CLD = compte les doigts |
| Motility | Oculomotricité | |
| D&V full | D&V complètes | ductions et versions |
| Cover test | Test de l'écran | Spec choice; "cover test" common in practice |
| Ortho | Ortho | orthophorie |
| Stereopsis | Stéréoscopie | |
| NPC / NPA | PPC / PPA | punctum proximum de convergence / d'accommodation |
| Fusional amplitudes | Amplitudes fusionnelles | |
| Color vision | Vision des couleurs | |
| Red desaturation | Désaturation du rouge | |
| HPI | HMA (histoire de la maladie actuelle) | |
| Chief complaint | Motif de consultation | |
| ROS | Revue des systèmes | Spelled out; no common French abbreviation |
| HEENT | Tête et cou / ORL | |
| Past history | Antécédents | |
| POH / POS | ATCD OPH / CHIR OPH | |
| PMH / FH | ATCD MÉD / ATCD FAM | |
| Social history | Mode de vie | |
| NKDA / no known allergies | Aucune allergie connue | |
| AMD | DMLA | |
| Impression / Plan | Diagnostic / Plan (Diag. / Plan) | "Impression" is not used in French notes |
| Impression item | Élément du diagnostic | |
| Orders / next visit | Prescriptions / prochaine consultation | |
| Builder | Assistant | |
| Quick picks | Choix rapides | |
| Shorthand | Saisie abrégée / abréviations | |
| Normal values (starter) | Valeurs normales (initiales) | |
| Code set | Nomenclature | |
| Billing system | Logiciel de facturation | |
| Visit code / modifier / justifier | Code de consultation / modificateur / justificatif | US billing concepts |
| New / established patient | Nouveau patient / patient connu | |
| Intermediate / comprehensive | Intermédiaire / complet | |
| Medical decision-making | Décision médicale | |
| Diagnosis pointer (Ptr) | Renvoi (Renv.) | |
| Flow sheet (glaucoma) | Suivi du glaucome | |
| Drawing / pencil | Dessin / crayon | |

## Check first (native reviewer)

1. **VA row labels** (`sections.vaRow*`, `coverZone*`): sc / ac, TS, LC, Subj, Cyclo, IL, "Éblouis." — choose the
   notation your clinics actually use (some keep SC/CC or MR/CR). Shorthand codes typed by users are unchanged.
2. **"Full to CF"** (`sections.vfFullToCf`, `vfFullOu`, `vfFullOneEye`, `vfUndoFull`) rendered "Complet au CLD";
   `vahHelp` keeps the recorded codes CF / HM / LP / NLP because they are the values users type.
3. **Cover test**: "Test de l'écran" (per spec) everywhere, including settings; many French clinicians simply say
   "cover test".
4. **Impression → Diagnostic** across plan, codes and report; check that "Diag. / Plan" fits the section rail.
5. **US billing vocabulary** in `codes.*` (modificateur, justificatif, renvoi, "demande de remboursement" for claim,
   E/M levels): these concepts have no direct French equivalent.
6. **Short buttons**: `sections.now` ("Maint."), `sections.clear` ("Effacer"), `exam.railStarted` ("commencée"),
   `codes.summaryPtr` ("Renv."), `flowsheet.methodApShort` ("Apl").
7. `sections.neuroCoins` kept as "Coins" (meaning of the test unclear); `rx.slabOff` kept as "Slab-off".
8. `sections.timePlaceholder` stays "h:mm AM" because the app stamps times in that format.
9. Gender agreement where the noun behind a placeholder is unknown (e.g. `{title} supprimé`, `Né(e) le`,
   `hpiLevelCounts` "chronique(s)").
10. Typography: plain spaces before `:` `;` `?` — decide whether to switch to no-break spaces.
