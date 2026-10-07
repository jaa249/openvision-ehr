# Hindi (hi) translation glossary

> **Machine-drafted translation awaiting review by a native Hindi-speaking eye-care professional**
> (optometrist or ophthalmologist). Until then the language is shown as "हिन्दी (draft translation)".

Register: standard Hindi in Devanagari, polite "आप" form, the plain style of Indian clinic and
government software. Eye care in India is taught and practised largely in English, so where a pure Hindi
medical term is not in everyday clinical use the English term is written in Devanagari
(रिफ्रैक्शन, स्लिट लैंप, फंडस, कॉर्निया) or the abbreviation is kept (IOP, VA, PD, ADD, HPI, ROS).
Common lay words are used where every clinician and patient uses them (आँख, पलक, भौंह, मोतियाबिंद,
भेंगापन, मिर्गी).

Kept as in D48 and never translated: OpenVision, OD / OS / OU, CPT, ICD-10-CM, ICD-11, units (mmHg,
mm, D, µm), Snellen values (20/20, 6/6), shorthand codes, file formats (PDF, CSV, FHIR, JSON, zip),
keyboard keys (Ctrl+Z, Enter, Tab, Esc), Tono-Pen (brand), {placeholders}. Example clinical text inside
placeholders/hints (e.g. "Glaucoma suspect OU H40.003", "nuclear cataract", "proparacaine") is left in
English because clinical text is entered and coded in English.

Punctuation: Hindi sentences end with the danda "।"; other punctuation (, : ; ? ! → ·) as in English.
Western digits 0-9.

Plurals: Hindi CLDR categories are `one` and `other`; every plural key has both. Note that Hindi `one`
covers **0 and 1** ("0 फ़ाइल"). Many Hindi nouns do not change in the plural (रिपोर्ट, आइटम, कोड, मरीज़),
so `_one` and `_other` are often identical; verbs still agree (जोड़ा गया / जोड़े गए).

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

| English | Hindi | Note |
|---|---|---|
| Patient | मरीज़ | रोगी is more formal; मरीज़ is what clinic staff say and read |
| Visit | विज़िट | |
| Encounter | एनकाउंटर | Kept distinct from "visit" because the page title uses it |
| Exam | जाँच | |
| Eye examination (report heading) | नेत्र परीक्षण | Formal form only on the printed report |
| Finding(s) | फ़ाइंडिंग / फ़ाइंडिंग्स | English loan; "निष्कर्ष" sounds like "conclusion" |
| Provider | प्रोवाइडर | Covers ophthalmologist and optometrist; "डॉक्टर" would exclude optometrists |
| Technician / Tech | टेक्नीशियन / टेक | |
| Admin / Administrator | एडमिन / एडमिनिस्ट्रेटर | |
| Practice | प्रैक्टिस | "क्लिनिक" is a possible alternative |
| Settings / My settings | सेटिंग्स / मेरी सेटिंग्स | |
| Sign in / Sign out | साइन इन / साइन आउट | |
| Sign (an exam) / Signed | साइन करें / साइन की गई | Formal "हस्ताक्षरित" used on printed lines ("इलेक्ट्रॉनिक रूप से हस्ताक्षरित") |
| Addendum / Addenda | परिशिष्ट | "(addendum)" added in brackets once in banner text |
| Take over (edit lock) | नियंत्रण लें | |
| Read-only | केवल पढ़ने के लिए | Short button "केवल पढ़ें" |
| Save / Saved | सहेजें / सहेजा गया | |
| Clear (a section) | खाली करें | Not "साफ़ करें" |
| Normal (button / value) | सामान्य | |
| Default | डिफ़ॉल्ट | |
| Undo / Redo | पूर्ववत / फिर से करें | |
| Quick picks | क्विक पिक | |
| Shorthand | शॉर्टहैंड | |
| Prior visits | पिछली विज़िट | |
| Impression / Plan | निदान / प्लान | "Impression" = clinical diagnosis list, so निदान |
| Diagnosis (code) | डायग्नोसिस (कोड) | In the codes/billing context the English loan is clearer |
| Orders | ऑर्डर | |
| Justifier | जस्टिफ़ायर | Billing term, kept as loan |
| Modifier | मॉडिफ़ायर | |
| New / Established patient | नया / पुराना मरीज़ | "पुराना मरीज़" is the everyday clinic term |
| Intermediate / Comprehensive | इंटरमीडिएट / कॉम्प्रिहेंसिव | CPT level names kept as loans |
| Medical decision-making | मेडिकल डिसीज़न-मेकिंग | |
| HPI | HPI; वर्तमान बीमारी का इतिहास | Spelled out in titles |
| Chief complaint | मुख्य शिकायत | |
| Review of systems | सिस्टम की समीक्षा (ROS) | |
| Past history | पिछला इतिहास | |
| POH / PMH / FH | POH / PMH / FH | Abbreviations kept; long forms translated |
| Family / Social history | पारिवारिक / सामाजिक इतिहास | |
| Allergies / No known allergies | एलर्जी / कोई ज्ञात एलर्जी नहीं | |
| Medication | दवा / दवाएँ | |
| Chronic / Acute | क्रॉनिक / एक्यूट | |
| Vision | विज़न | Section rail label; "दृष्टि" only in "बेहतर दृष्टि" |
| Visual acuity (VA) | विज़ुअल एक्युइटी (VA) | |
| Distance / Near | दूर / पास | |
| sc / cc | sc / cc | Codes kept |
| Pinhole | पिनहोल | |
| Glare / Contrast | ग्लेयर / कंट्रास्ट | |
| Amsler | एम्सलर | |
| Refraction | रिफ्रैक्शन | "अपवर्तन" is textbook-only |
| Manifest (dry) / Cycloplegic (wet) | मैनिफ़ेस्ट (ड्राई) / साइक्लोप्लेजिक (वेट) | |
| Autorefraction | ऑटोरिफ्रैक्शन | |
| Sphere / Cylinder / Axis | स्फ़ीयर / सिलिंडर / एक्सिस | Column heads keep Sph / Cyl / Axis |
| Plus / minus cylinder | प्लस / माइनस सिलिंडर | |
| Transpose | ट्रांसपोज़ | |
| Prism / Base | प्रिज़्म / बेस | |
| ADD / Mid ADD / Near ADD | ADD / मिड ADD / नियर ADD | |
| PD | PD | "PD दूर / PD पास" |
| Vertex | वर्टेक्स | |
| Single vision / Bifocal / Progressive | सिंगल विज़न / बाइफ़ोकल / प्रोग्रेसिव | |
| Glasses / Spectacle Rx | चश्मा / चश्मे का Rx | |
| Contact lens | कॉन्टैक्ट लेंस | |
| Base curve / Diameter | बेस कर्व / व्यास | Column heads keep BC / Diam |
| Dispensed Rx | डिस्पेंस किए गए Rx | |
| IOP | IOP | |
| Target IOP | टारगेट IOP | "लक्ष्य" possible, but टारगेट is what clinics say |
| Applanation | एप्लानेशन | |
| Finger tension | फ़िंगर टेंशन | |
| Pupils | प्यूपिल | "पुतली" is the lay word |
| APD | APD | |
| Reactivity | रिएक्टिविटी | |
| Dilation / Dilated | डाइलेशन / डाइलेट किया | |
| Drops | ड्रॉप्स | |
| Confrontation fields | कन्फ़्रंटेशन फ़ील्ड | |
| Full to CF | CF तक पूर्ण | |
| Superior / Inferior / Temporal / Nasal | सुपीरियर / इन्फ़ीरियर / टेम्पोरल / नेज़ल | |
| External | बाहरी | |
| Brow / Upper lid / Lower lid | भौंह / ऊपरी पलक / निचली पलक | |
| Adnexa / Canthus | एडनेक्सा / कैंथस | |
| Slit lamp | स्लिट लैंप | |
| Anterior segment | एंटीरियर सेगमेंट | "अग्र खंड" is textbook-only |
| Conjunctiva / Cornea | कंजंक्टाइवा / कॉर्निया | |
| Anterior chamber | एंटीरियर चैंबर | |
| Iris / Lens | आइरिस / लेंस | |
| Gonioscopy / Pachymetry | गोनियोस्कोपी / पैकीमेट्री | |
| Tear break-up time | टियर ब्रेक-अप टाइम | |
| Fundus / Retina | फंडस / रेटिना | |
| Disc / Macula / Vitreous | डिस्क / मैक्युला / विट्रियस | |
| Vessels | वाहिकाएँ | |
| Periphery | पेरिफ़ेरी | |
| C/D ratio | C/D अनुपात | |
| Neuro | न्यूरो | |
| Motility | मोटिलिटी | |
| Cover test / Ortho | कवर टेस्ट / ऑर्थो | |
| Deviation / Prism diopters | डेविएशन / प्रिज़्म डायोप्टर | |
| Stereopsis / Color vision | स्टीरियोप्सिस / कलर विज़न | |
| Convergence / Accommodation | कन्वर्जेंस / एकोमोडेशन | |
| Glaucoma / Cataract | ग्लूकोमा / मोतियाबिंद | |
| Amblyopia / Strabismus | एम्ब्लायोपिया / भेंगापन | |
| Visual fields / OCT / RNFL | विज़ुअल फ़ील्ड / OCT / RNFL | |
| Flow sheet | फ़्लो शीट | |
| Documents and images | दस्तावेज़ और इमेज | |
| Upload / Download / Import / Export | अपलोड / डाउनलोड / इंपोर्ट / एक्सपोर्ट | |
| Audit log | ऑडिट लॉग | |
| Code set | कोड सेट | |
| Drawing | ड्रॉइंग | |
| Right eye / Left eye / Both eyes | दाईं आँख / बाईं आँख / दोनों आँखें | |
| OD (R) / OS (L) | OD (दा) / OS (बा) | दा/बा = दायाँ/बायाँ, abbreviated for column heads |
| Date of birth / DOB | जन्मतिथि | No common Hindi abbreviation, so the full word is used in dense lines |
| y (age) | वर्ष | |
| Legal / Preferred name | कानूनी / पसंदीदा नाम | |

## Check first (native reviewer)

1. **Loan words vs. Hindi terms** across the exam (विज़न, रिफ्रैक्शन, एंटीरियर सेगमेंट, प्यूपिल,
   फ़ाइंडिंग्स): is this the right mix for Indian optometrists, or should some be Hindi (दृष्टि,
   पुतली, निष्कर्ष)?
2. **Impression / Plan = निदान / प्लान** (`catalog.sectionImpPlan`, `plan.heading`, `report.impressionPlan`):
   "निदान" means diagnosis; check this reads right for a list that also holds plans.
3. **Dense labels**: section rail (`catalog.section*`), banner buttons (`exam.banner*`), Rx column heads
   (`sections.rxHead*`, `rx.col*`), `exam.eyeHeadOd/Os` and `sections.eyeOdR/OsL` ("OD (दा)").
4. **Patient status** "नया / पुराना मरीज़" for new / established (`codes.newPatient`,
   `codes.establishedPatient`, `codes.visit92012` etc.).
5. **Signing and locks**: `exam.bannerTakeOver` (नियंत्रण लें), `exam.takeOverConfirm`, `exam.signHint`,
   `exam.addendum` (परिशिष्ट).
6. **HPI elements** (`sections.hpiEl*`): "प्रकृति" for Quality, "प्रभावित करने वाले कारक" for Modifying
   factors.
7. **ROS systems** (`sections.ros*`): Hindi body-system names vs. English loans.
8. **`report.saveAsPdf` and `exam.bannerDownloadPdfHint`** keep "Save as PDF", the browser's own label in an
   English browser; a Hindi-language browser shows its own Hindi label.
9. **Plural forms**: Hindi `one` includes 0, so "0 फ़ाइल" / "0 मरीज़"; check verb agreement in
   `documents.savedManyTo_*`, `plan.added_*`, `report.printMissing_*`.
10. **Example placeholders** left in English (`plan.newDxPlaceholder*`, `codes.finderPlaceholder*`,
    `settings.addressHint`, `sections.dilOtherPlaceholder`): confirm English examples are right for India.
