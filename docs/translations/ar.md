# Arabic (ar) translation glossary

> **Machine-drafted translation awaiting review by a native Arabic-speaking eye-care professional**
> (optometrist or ophthalmologist). Until then the language is shown as "العربية (draft translation)".

Register: Modern Standard Arabic, the vocabulary of Arab medical education (Unified Medical Dictionary
style), neutral across the Gulf, Levant, Egypt and the Maghreb. Buttons use verbal nouns (حفظ، إلغاء،
طباعة); instructions use the imperative or «يُرجى …»; status messages use the passive (حُفظ، لم يُحفظ).

Codes are kept in Latin script as D48 requires: OD / OS / OU, CPT, ICD-10-CM, ICD-11, mmHg, mm, D, µm,
20/20, 6/6, shorthand codes, PDF / CSV / FHIR, and the abbreviations clinicians read in Latin in Arab
clinics (HPI, PMH, POH, POS, FH, NKDA, APD, NPC, NPA, PD, ADD, BC, MRD, OCT, RNFL, AMD, logMAR, CF, HM,
LP, NLP, sc, cc, AR, MR, CR, PH, CTL, PAM, LI). Digits are Western 0-9 (locale `ar-u-nu-latn`).

Right-to-left: no direction-control characters are used anywhere. Quotation marks are « … ». The Arabic
comma «،» is used inside Arabic sentences. Arrows: "← Patients"-style back links become "→ المرضى" (the
arrow points toward the start of the line in RTL) and "Older →" becomes "الأقدم ←". Where an English arrow
joins two Latin values ("OD → OS", "Settings → Users", "0 → 5") the text was rewritten with words (من … إلى …،
"الإعدادات، قسم المستخدمين") so the bidi algorithm cannot flip its meaning.

Plurals: Arabic CLDR categories are `zero`, `one`, `two`, `few` (3-10), `many` (11-99), `other` (100+,
fractions). Every plural key has all six. A plural form may leave out `{count}` (the i18n test allows it; every
other placeholder must stay), so `one` and `two` are written the natural way, without the digit, and `zero`
says "none" where that reads naturally:

| Category | Pattern | Example |
|---|---|---|
| zero | «لا توجد» + plural, or «لم يُ… أي» + singular | لا توجد ملفات / لم يُرفع أي ملف. |
| one | singular + «واحد/واحدة» | ملف واحد |
| two | dual, no digit | ملفان |
| few | digit + plural | 5 ملفات |
| many | digit + singular accusative (tanween) | 12 ملفًا |
| other | digit + singular | 100 ملف |

`zero` keeps the digit ("0 …") where a count of zero cannot occur or where the message has other placeholders
that a "none" sentence would not fit (`codes.checkUncoded_zero`, `exam.lostChanges_zero`,
`sections.hpiLevelCounts_zero`, `settings.codeSetsLoaded_zero` and similar).

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

| English | Arabic | Note |
|---|---|---|
| Patient | المريض | |
| Patient chart | ملف المريض | |
| Visit | الزيارة | |
| Encounters (page) | سجل الزيارات | "Visits" and "Encounters" both exist in the UI, so the list page is "visit log" |
| Exam | الفحص | |
| Finding(s) | الموجودة / الموجودات | Standard clinical term for exam findings |
| Provider | مقدم الرعاية | Covers ophthalmologist and optometrist; "الطبيب" would exclude optometrists |
| Technician / Tech | الفني | |
| Admin | المسؤول | |
| Practice | العيادة | |
| MRN | رقم الملف الطبي / رقم الملف | Short form in dense meta lines |
| DOB | تاريخ الميلاد | |
| {age} y | {age} سنة | |
| Legal / preferred name | الاسم القانوني / الاسم المفضل | |
| Sign (exam) | توقيع / وقّع | "اعتماد نهائي" in the tooltip |
| Signed / read-only | موقّع / للقراءة فقط | |
| Take over (edit lock) | تولّي التعديل | |
| Addendum / addenda | ملحق / ملاحق | |
| Audit log | سجل التدقيق | |
| Draft translation | ترجمة أولية | |
| Shorthand | الاختصار / رموز الاختصار | |
| Quick picks | الاختيارات السريعة | |
| Prior visits | الزيارات السابقة | |
| Normal (button) | طبيعي | |
| Clear (button) | مسح | Means "empty the field", not "clear cornea" |
| Starter values | القيم الأولية | |
| HPI | تاريخ المرض الحالي (HPI) | HPI kept in tight labels |
| Chief complaint | الشكوى الرئيسية | |
| HPI elements: timing, context, severity, modifying factors, associated signs, location, quality, duration | التوقيت، السياق، الشدة، العوامل المعدِّلة، العلامات المرافقة، الموضع، الطبيعة، المدة | |
| Review of systems (ROS) | مراجعة الأجهزة | |
| Past history | السوابق | POH = السوابق العينية, PMH = السوابق المرضية العامة |
| Family / social history | السوابق العائلية / الاجتماعية | |
| Allergies / NKDA | الحساسية / لا حساسية معروفة | NKDA kept as code in tight spots |
| Vision (section) | الإبصار | |
| Visual acuity (VA) | حدة البصر | "VA" kept in narrow Rx table headers |
| sc / cc | دون تصحيح / بالنظارة الحالية | Row codes sc, cc stay Latin |
| Pinhole | بالثقب | |
| Glare / BAT | الإبهار | |
| Contrast | التباين | |
| Amsler | أمسلر | |
| Refraction | الانكسار | |
| Manifest (dry) | الانكسار الظاهر (دون قطرات) | |
| Cycloplegic (wet) | بشلّ التكيّف (بالقطرات) | |
| Autorefraction | الانكسار الآلي | |
| Sphere / cylinder / axis | الكروي / الأسطواني / المحور | Table headers: كروي، أسطواني، محور |
| Plus / minus cylinder | أسطوانة موجبة / سالبة | |
| Transpose | تحويل | |
| Prism / base | المنشور / القاعدة | |
| Prism diopters | ديوبترات المنشور | |
| ADD / near ADD / mid ADD | ADD / ADD للقريب / ADD المتوسط | ADD kept, as on Arab optical prescriptions |
| PD (pupillary distance) | PD | Binocular PD = PD الثنائي; monocular = PD أحادي |
| Vertex distance | مسافة القمة | |
| Slab-off | Slab-off | No settled Arabic term; kept |
| Base curve (BC) / diameter | الانحناء القاعدي / القطر | |
| Single vision / bifocal / trifocal / progressive | أحادية البؤرة / ثنائية البؤرة / ثلاثية البؤرة / تدريجية | |
| Spectacle Rx / contact lens Rx | وصفة النظارة / وصفة العدسات اللاصقة | |
| Glasses #{n} | النظارة رقم {n} | |
| Dispensed Rx | الوصفات المصروفة | |
| Lens material / treatments | مادة العدسة / معالجات العدسة | |
| Manufacturer / supplier / brand | الشركة المصنعة / المورّد / العلامة التجارية | |
| IOP | ضغط العين | Section rail: الضغط / الحدقتان |
| Target IOP | الضغط المستهدف | |
| Applanation | التسطيح | Chart short form «تسطيح» for "App" |
| Tono-Pen | Tono-Pen | Device name; chart short form "Tpn" kept |
| Finger tension | الجس بالأصابع | Report short form «جس» for "FTN" |
| Pupils | الحدقتان / الحدقة | |
| Reactivity | الاستجابة | |
| APD | APD | |
| Dilation / dilated | توسيع الحدقة / موسَّعة | |
| Dilating drops | قطرات التوسيع | Drug names transliterated (تروبيكاميد، فينيليفرين، سيكلوبنتولات، أتروبين) |
| Confrontation fields | المجال البصري بالمواجهة | |
| Full to CF | كامل لعدّ الأصابع | |
| Superior/inferior temporal/nasal | علوي/سفلي صدغي/أنفي | |
| External | الفحص الخارجي / الخارجي | |
| Brow / upper lid / lower lid | الحاجب / الجفن العلوي / الجفن السفلي | |
| Medial canthus | الموق الإنسي | |
| Adnexa | ملحقات العين | |
| Levator function | وظيفة العضلة الرافعة | |
| Slit lamp | المصباح الشقي | |
| Anterior segment | القطعة الأمامية | |
| Conjunctiva / cornea / iris / lens | الملتحمة / القرنية / القزحية / العدسة | |
| Anterior chamber | الحجرة الأمامية | |
| Gonioscopy | تنظير الزاوية | |
| Pachymetry | قياس سماكة القرنية | |
| Tear break-up time | زمن تفكك الغشاء الدمعي | |
| Schirmer | شيرمر | |
| Fundus | قاع العين | |
| Retina / macula / vitreous | الشبكية / البقعة / الجسم الزجاجي | |
| Optic disc / C/D ratio | القرص البصري / نسبة C/D | |
| Periphery | محيط الشبكية | |
| Central macular thickness | سماكة البقعة المركزية | |
| Hertel | هيرتل | |
| Neuro | العصبي | |
| Motility | حركة العين | |
| Gaze up / down / in / out | أعلى / أسفل / للداخل / للخارج | |
| Alternate cover test | اختبار التغطية المتناوب | |
| Ortho (orthophoric) | سوي | |
| Deviation | الانحراف | |
| Stereopsis | الرؤية المجسمة | |
| Accommodation | التكيّف | |
| Convergence / divergence amplitudes | سعة التقارب / سعة التباعد | |
| Fusional amplitudes | سعة الاندماج | |
| Color vision / red desaturation | رؤية الألوان / نقص تشبع اللون الأحمر | |
| Mental status: alert, oriented ×3 | الحالة الذهنية: يقظ، متوجّه ×3 | |
| Glaucoma | الزَّرَق | MSA medical term; many clinicians say «الجلوكوما» |
| Cataract | الساد | «الماء الأبيض» is the lay term |
| Amblyopia / strabismus | الغمش / الحَوَل | |
| Retinal detachment | انفصال الشبكية | |
| Glaucoma flow sheet | جدول متابعة الزَّرَق | |
| Visual field(s) | المجال البصري / المجالات البصرية | |
| Impression / Plan | الانطباع / الخطة | |
| Impression item | بند الانطباع | |
| Diagnosis / New Dx | التشخيص / تشخيص جديد | |
| Orders / next visit | الطلبات / الزيارة القادمة | |
| Builder | المُنشئ | |
| Codes (section) | الرموز | |
| Code set | نظام الترميز / أنظمة الترميز | |
| Billable | قابل للفوترة | |
| Visit code / code family | رمز الزيارة / فئة الرموز | |
| New / established patient | مريض جديد / مريض مُراجع | |
| Intermediate / comprehensive | متوسط / شامل | |
| Medical decision-making | اتخاذ القرار الطبي | |
| Modifier | المُعدِّل | |
| Justifier | المسوّغ | Coined for this feature; reviewer should confirm |
| Diagnosis pointer (Ptr) | مؤشر التشخيص (مؤشر) | |
| Documents and images | المستندات والصور | |
| Upload / download | رفع / تنزيل | |

## Check first (native reviewer)

1. **Plural forms** (see the table above): `_one` («ملف واحد») and `_two` («ملفان») have no digit, `_zero` says
   «لا توجد …» where natural, e.g. `documents.fileCount_*`, `settings.auditCount_*`, `visits.visitMeta_*`,
   `plan.addedSkipped_*`, `exam.priorsPosition_*`.
2. **Provider = مقدم الرعاية.** Fine in an EHR, but a reviewer may prefer «الطبيب» or «الأخصائي».
3. **Glaucoma/cataract register**: «الزَّرَق» and «الساد» (textbook) vs «الجلوكوما» and «الماء الأبيض» (common
   speech). Used in `patients.flowsheetLink`, `flowsheet.heading`, `documents.zoneGlaucoma`, `sections.fh*`.
4. **Justifier = مسوّغ** in `codes.justifiers*`. The English term is itself local to OpenVision.
5. **Narrow table headers** in `sections.rxHead*` and `rx.col*`: «كروي / أسطواني / محور» while VA, ADD, PD and
   BC stay Latin. Check the widths on a tablet. `rxHeadHPrism`/`rxHeadVPrism` are shortened to «منشور أ / منشور ع».
6. **Short IOP method labels**: `flowsheet.methodApShort` / `report.iopApp` = «تسطيح», `report.iopFtn` = «جس», but
   `methodTpnShort` / `iopTpn` stay "Tpn". Should they all be Latin or all Arabic?
7. **Cover-test placeholders and report labels**: `sections.coverPhRTilt` «إمالة ي», `coverPhLTilt` «إمالة س»,
   `report.coverRight` «ي», `report.coverLeft` «س» (abbreviations of يمين/يسار). Check that they read clearly.
8. **Left untranslated on purpose**: `sections.neuroCoins` ("Coins", the coins test, no settled Arabic name),
   `slabOff`, `motilityDvFull` ("D&V"), `timePlaceholder` ("h:mm AM", because the field parses that format),
   the code-search examples in `codes.finderPlaceholderIcd10/11` ("nuclear cataract", "glaucoma"): they are shown
   when only English titles are searched; with WHO's Arabic file loaded, `finderPlaceholderIcd11Lang` is shown.
9. **Arrows in RTL**: `patients.backToPatients`, `rx.backToExam`, `report.backToEncounters` (→ …),
   `patients.listAllEncounters` (… ←), `settings.auditNewer` / `auditOlder`. Check them in the running layout.
10. **`plan.newDxPlaceholder*`**: the diagnosis titles are the official English CMS/WHO titles, unchanged (D50:
    we never translate ICD titles); only the plan line is Arabic.
11. **CPT visit descriptions** (`codes.visit92002` to `visit99215`) and the modifier help (`codes.mod*`): these are
    US billing concepts with no official Arabic wording.
12. **`exam.eyeHeadOd` / `eyeHeadOs`** «OD (يمين)» / «OS (يسار)», and `report.odRight` «OD (اليمنى)».
