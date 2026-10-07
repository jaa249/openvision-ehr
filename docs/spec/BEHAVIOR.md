# Eye exam behavior specification (parity checklist)

**What this is.** A clean-room description of what OpenEMR's eye exam form (`interface/forms/eye_mag`) does, written so a developer can rebuild the same features without reading or copying its code. It describes behavior only. Nothing here is the original source.

**Companion reference tables (generated, do not duplicate here):**

- [FIELDS.md](FIELDS.md) — every table and column (17 tables, 509 columns).
- [SHORTHAND.md](SHORTHAND.md) — every shorthand alias (119) and vocabulary expansion (61).
- [LISTS.md](LISTS.md) — the 12 seed lists (defaults, quick picks, coding terms, orders, lens options, contact-lens catalogs).

**How to read each feature.**

- **Sees/does** — what the user experiences.
- **Rules** — exact behavior, including edge cases. A rule marked **(parity)** is how the original behaves and we keep it. A rule marked **FIX** describes an original defect and the behavior we build instead. FIX items are collected again in §17.
- **Data** — what is read and written. Table and column names are the original ones from FIELDS.md, used as a vocabulary only. Our schema may differ.
- **Source** — `file:line` in the original, so reviewers can check parity.

**Source abbreviations** (all relative to `interface/forms/eye_mag/`):

| Abbrev | File |
|---|---|
| view | view.php |
| save | save.php |
| report | report.php |
| SRx | SpectacleRx.php |
| issue | a_issue.php |
| help | help.php |
| new | new.php |
| taskman | taskman.php |
| TMF | php/taskman_functions.php |
| EMF | php/eye_mag_functions.php |
| EB | js/eye_base.php (PHP that outputs the page JavaScript) |
| SH | js/shorthand_eye.js |
| CD | js/canvasdraw.js |
| CSS | css/style.css |
| DB | OpenEMR `sql/database.sql` |

---

## 0. Data model in one paragraph

One exam equals one encounter. Creating an exam inserts a parent row (`form_eye_base`) whose id becomes the form id, plus one empty row in each of eleven section tables, all sharing that id. The section tables are hpi, ros, vitals, acuity, refraction, biometrics, external, antseg, postseg, neuro and locking. Child collections are stored one-to-many by form id:

- wearing Rx (up to 5 per form): `form_eye_mag_wearing`
- impression/plan items: `form_eye_mag_impplan`
- next-visit orders: `form_eye_mag_orders`
- printed spectacle/contact Rx records: `form_eye_mag_dispense`

Per-user layout preferences live in `form_eye_mag_prefs`, plus `user_settings` keys prefixed `EyeFormSettings_`. Per-provider configurable lists (defaults, quick picks, orders) are copied from seed lists on first use; see LISTS.md. Drawings and generated PDFs are stored in the patient document store.

**Creation (new.php).**

- **One exam per encounter.** If a non-deleted eye exam already exists for the same patient and encounter, the user is redirected to it instead of getting a second one (new:44-58).
- Otherwise the parent row, the eleven section rows and the encounter-form link are created, then the user is redirected to the new exam (new:59-79).
- The form is titled "Eye Exam".
- **FIX:** the original falls back to today's date (yyyymmdd) as a fake encounter number when there is none (new:42; save:262). We refuse to create an exam without a real encounter.
- **FIX:** the original lets a request `pid` overwrite the session patient (new:26-32). We use the session patient only.

---

## 1. Page layout and panels

### 1.1 Overall frame

**Sees.** From top to bottom:

1. A fixed top menu bar.
2. A patient banner.
3. The **history row**: HPI and PMSFH.
4. The **clinical strip**: a row of small boxes.
5. The **refraction row**: optional panels.
6. A **mode bar**: Defaults / Text / Draw / Quick Picks / prior-visit navigator.
7. Five **exam sections** in order: External, Anterior Segment, Retina (plus an optional Scleral Depression drawing), Neuro, Impression/Plan.

There is also an optional vertical **tab strip** on the left, an optional **PMSFH slide-out** on the right, and a floating draggable **Shorthand box**.

**Top menu** (EMF:3916-4053):

| Menu | Items |
|---|---|
| File | **Print Report** (printable report in a new window); **Save Report as PDF** (queues a report-PDF task, §14) |
| Edit | **Default Values** (opens the provider's defaults list editor); **Text**, **Draw**, **Quick Picks**, **Prior Visits**, **Shorthand** (each labelled with a Ctrl shortcut, §16); **Fullscreen** (only when not already fullscreen) |
| View | One item per section (HPI, PMH, External, Anterior Segment, Posterior Segment, Neuro, Imp Plan): makes the section visible and scrolls to it. **PMSFH Panel** toggles the right slide-out. **Chart View** toggles the left tab strip and remembers the choice. |
| Library | **IOP Graph** opens the glaucoma flow sheet |
| Help | **Tooltips** on/off (remembered); **Shorthand Help** opens the help page |
| Right side | **eRx** (prescription list; the page reloads when it closes); the **Active Chart / READ-ONLY** lock flag with a toggle icon (§15) |

The menu bar is fixed and sits above everything else.

**Patient banner** (EMF:4062-4184):

- Name with chart id, DOB and age, visit date, encounter provider, reason for visit.
- **"Plan"**: the numbered orders from the previous visit (that visit's next-visit orders shown as this visit's to-do).
- Patient photo from the "Patient Photograph" document category, or a placeholder silhouette.
- PCP, Referred By, primary and secondary insurance, pharmacy (name, city, state).
- **FIX:** the original computes age as of today because the encounter date is undefined there. Compute age as of the visit date.

**Fullscreen** (EMF:3984-3993; EB:1868):

- Opens the fee sheet in the host and pops the exam into its own window with `display=fullscreen`.
- In fullscreen the footer bar is omitted and "Fullscreen" is removed from the menu.
- There is no in-page "maximize one section" feature. A single-section helper exists in the original but is unused and broken (EB:1106-1112). Do not build it unless separately specified.

### 1.2 Left tab strip and section collapse

- **Collapse.** Every section header has a minimize icon. Clicking it hides the section, records `setting_<ZONE>=0` and reveals the left tab strip (EB:4429-4437).
- **Tab strip** (view:197-219; EB:4376-4390):
  - Tabs: HPI, PMH, Ext, Ant, Retina, Neuro, Imp.
  - Clicking a tab toggles its section. A hidden section's tab is greyed out. Showing a section scrolls to it.
  - Each toggle saves the per-section setting.
- **Defaults:** strip hidden (`setting_tabs_left=0`), every section visible (`=1`) (view:49-58).
- **Persistence:** section visibility and strip visibility are per user. They are stored as user settings and replayed on load (EB:2204-2249).

### 1.3 History row (HPI + PMSFH)

**Width.** HPI and PMSFH each take half the row. They are meant to go full width when the `CLINICAL` pref is 1 (view:316-320); in the original both CSS classes are identical, so the width never visibly changes (CSS:708-719). **(parity: half/half.)**

**HPI, left side** (view:327-445):

- Three chief-complaint tabs. Tabs 2 and 3 show a check mark when their CC is filled.
- Each tab has **CC**, with the hint "In the patient's words", and **HPI** free text.
- Tab 1 also has **CHRONIC1–3**, three chronic/inactive problem boxes.
  - The HPI tooltip explains that a detailed HPI needs four or more HPI elements, or the status of three chronic problems.
  - The CHRONIC tooltip explains that PMH items flagged chronic, with a status comment, appear here automatically (§7.4).
- Under the boxes is a coding hint, "Limited HPI" / "Detailed HPI", that turns red once the threshold is met (§11.1).

**HPI, right side** (view:453-650):

- Either the HPI drawing canvas or the **HPI Elements** panel.
- The elements panel has three tabs mirroring the three complaints. Each tab has eight boxes, each with an italic prompt:

| Element | Prompt idea |
|---|---|
| Timing | when and how often |
| Context | |
| Severity | 0-10, mild/moderate/severe |
| Modifying factors | |
| Associated signs | |
| Location | |
| Quality | |
| Duration | |

**PMSFH, left side** (view:652-677): an embedded issue editor (§7.2), opened by default to "Past Ocular History".

**PMSFH, right side** (view:680-689): either the PMSFH drawing canvas, or a two-column read-only **PMSFH summary** (EMF:2053-2386). Section order:

1. POH
2. POS
3. Eye Meds
4. PMH
5. Surgery
6. Medication
7. Allergy
8. FH
9. Social
10. ROS

Rules for the summary:

- Each heading has a "New" link that opens the editor on that type.
- Empty sections show "None". Empty Allergy shows "NKDA". Empty FH and ROS show "Negative". Empty Social shows "Not documented".
- Allergies are red, with the reaction in brackets.
- Inactive medications are hidden.
- The second column starts once the first column reaches about half the item count, with a minimum of 20 rows.

**PMSFH slide-out (right edge)** (view:4414-4455; EMF:2395-2622):

- A 140px panel showing the same lists in the same order, each with an "Add" link.
- Opened from the list icon in the PMSFH header or from View > PMSFH Panel.
- Open/closed state is remembered (`PANEL_RIGHT`) and restored on load.

### 1.4 Clinical strip

All boxes sit in one row (view:758-1212).

| Box | Contents and behavior | Source |
|---|---|---|
| **Mental status** | Three checkboxes: Alert, Oriented ×3, Mood/Affect normal. (The third is stored in a column named `confused`; keep the meaning, not the name.) | view:760-783 |
| **Vision** | Header "Vision:" toggles the whole refraction row. Mini tabs **R** (prior refractions), **W** (current glasses), **MR**, **AR**, **CTL**, **Add.** (additional data), **Va** (acuity summary) each toggle their refraction panel (§1.5). A highlighted tab means that panel is on. **V** toggles the VA history chart (§8.6). Grid: OD/OS rows; SC, CC and PH columns. CC is a mirror of wearing Rx #1's VA; PH is pinhole. Clicking "Acuity" swaps the grid to an AR/MR/CR VA view. | view:786-875; EB:3418-3421 |
| **Tension (IOP)** | Time stamp, and OD/OS rows with AP (applanation), TP (Tono-Pen) and FT (finger tension). A chart icon opens the glaucoma flow sheet. High values are highlighted (§8.3). | view:878-917 |
| **Amsler** | One image per eye showing an Amsler grid at severity 0–5, with the caption "n/5", plus a **Normal** checkbox (§8.4). | view:920-981 |
| **Fields** (confrontation) | A **FTCF** ("full to count fingers") checkbox, and four quadrant boxes per eye (§8.5). | view:984-1077 |
| **Pupils** | **Normal** checkbox. Per eye: size light (from → to), reactivity, APD. Clicking "Pupils:" reveals the **dim-light pupils** panel: dim sizes per eye plus pupil comments. | view:1080-1210 |

**Rule for the dim-light pupils panel:** show it automatically when any dim size or pupil comment has a value. **FIX:** the original tests a non-existent field name, so it never auto-shows (view:1176).

### 1.5 Refraction row: panel types and show/hide rules

Each panel can be shown or hidden. **Visibility is driven only by user prefs and button clicks, never by whether the panel has data**, with one exception: wearing Rx #2–#5 appear whenever a stored Rx exists for that slot.

| Panel | Pref key | Contents |
|---|---|---|
| **Prior Refractions (R)** | `RXHX` | Read-only. The last three earlier visits that have any MR/AR/CR/CTL acuity, each rendered with the refraction tables of §13.5. Draggable. (view:1231-1262) |
| **Current Glasses #1 (W)** | `W`, plus `W_width` for the wide layout | **Distance:** OD/OS sphere, cylinder, axis, VA. **Mid/Near:** mid ADD, ADD, near VA. **Rx type radios:** Single, Bifocal, Trifocal, Progressive (stored 0/1/2/3). Comments. **Wide-only columns:** horizontal prism and base, vertical prism and base, slab-off, vertex distance, monocular PD distance and near; binocular PD distance and near. **Lens material** select (list `Eye_Lens_Material`). **Lens treatments** checkboxes (list `Eye_Lens_Treatments`, stored pipe-separated). Pencil links to edit both lists. **Header icons:** close; widen ("Rx Details"); print (opens §12 for source W); dispensed history; plus/minus cylinder transpose. **"Additional Rx"** button. (view:1269-1412) |
| **Current Glasses #2–#5** | none | Same layout. Hidden unless the slot has a stored row. "Additional Rx" reveals the next unused slot and disappears once #5 is shown. Closing slot n (n>1) blanks it and deletes its row on save. (EMF:6148-6316; EB:4331-4340, 3778-3796) |
| **Manifest (dry)** | `MR` | OD/OS sphere, cylinder, axis, VA, ADD, near VA, prism; **Balanced** checkbox. In the same panel, **Cycloplegic (wet)**: OD/OS sphere, cylinder, axis, VA; method radio Streak/Auto/Manual; post-dilation IOP per eye. Print icons for MR and CR. (view:1420-1523) |
| **Autorefraction** | `CR` (historical misnomer: in the original, the AR tab toggles the `CR` pref) | OD/OS sphere, cylinder, axis, VA, ADD, near VA, prism; refraction comments. Print icon. (view:1525-1569) |
| **Contact lens (CTL)** | `CTL` | Per eye: manufacturer, supplier and brand selects (catalog lists in LISTS.md) with pencil links to edit them; sphere, cylinder, axis, base curve, diameter, ADD, VA. Comments. (view:1571-1810) |
| **Additional data points** | `ADDITIONAL` | Per eye: pinhole VA, PAM, LI, glare (BAT), K1, K2, K2 axis, axial length, ACD, measured PD, lens thickness, white-to-white, ECL; plus binocular VA. Every label has a long-name tooltip. (view:1812-1877) |
| **Acuity summary (VAX)** | `VAX` | A mirror grid of every acuity: SC, wearing, AR, MR, CR, PH, CTL; then near SC, near CC, AR near, MR near, PAM, glare, contrast. (view:1879-1944) |

**Show/hide rules** (EB:3314-3353, 3797-3801):

- A tab click flips that panel's pref between 0 and 1, shows or hides the panel, and saves prefs immediately.
- Showing any panel (other than IOP or VA history) also makes the refraction row visible.
- A panel's own close X behaves like clicking its tab off, so closed panels **stay closed** next time.
- Closing W #1 turns off the whole W pref.

**Acuity mirroring** (EB:3386-3414): every acuity field has twin display copies (the strip grid and the VAX grid). Editing any copy updates the others and the stored field. **(parity)**

**Widening** (EB:3089-3112): the W panels widen and narrow together.

### 1.6 Exam sections: the left/right model

Each section has two halves.

**Left half: the record.** Structured fields and free text for that section. The header has four icons:

- **Draw**: show this section's canvas on the right.
- **Quick Picks**: show this section's quick-pick panel on the right.
- **Shorthand**: toggle the shorthand box.
- **Minimize**.

**Right half: a helper panel**, in one of four modes:

| Mode | Shows on the right | Global trigger | Per-section trigger |
|---|---|---|---|
| **Text** | Nothing. The right half is hidden. Impression/Plan keeps its builder visible. | "Text" button or menu | the X on the right panel, or the "text" icon on a drawing |
| **Draw** | The section canvas (§5) | "Draw" button or menu | the section's Draw icon (toggles) |
| **QP** | Modifier buttons plus the section's quick-pick list (§4) | "Quick Picks" button or menu | the section's QP icon (toggles; HPI and PMSFH open together) |
| **Priors** | A read-only copy of the same section from a chosen prior visit (§6) | the navigator in the mode bar (all sections) | the navigator inside each section |

**Global mode rules** (EB:793-888):

- **Text** hides every right half.
- **Draw** hides the left halves and shows every canvas.
- **QP** shows both halves with QP on the right and scrolls to External.
- The last global mode is remembered (`EXAM`).

**Per-section rules** (EB:4079-4143, 3856-3887):

- Each section's right-panel mode is remembered individually (`<ZONE>_RIGHT` = DRAW, QP, or closed).
- Clicking a section's Draw icon while it is already in Draw closes the panel; the same applies to QP.
- Impression/Plan's QP panel (the builder) never closes.

**Restore on load** (EB:2204-2249, 3890-3895): replay each section's remembered right-panel mode, then section visibility, the tab strip, the scleral-depression panel, and the VA history chart.

**Section contents** (field codes are listed in FIELDS.md):

- **External** (view:1998-2234):
  - Document-category links for EXT.
  - Measurements R/L: levator function, MRD, vertical fissure, carotid, temporal artery, CN V, CN VII; Hertel OD–base–OS.
  - Text grid R/L: brow, upper lid, lower lid, medial canthus, adnexa.
  - Comments.
- **Anterior segment** (view:2238-2500):
  - Per eye: gonioscopy, pachymetry, Schirmer I, Schirmer II, TBUT.
  - **Dilation box:** a time field and drug checkboxes (Cyclomydril, Tropicamide, Neo 2.5%, Neo 10%, Cyclopentolate, Atropine). Checking any drug ticks "dilation risks reviewed" and stamps the dilation time with the current time (EB:2641-2647).
  - Text grid OD/OS: conjunctiva, cornea, AC, lens, iris.
  - Comments.
- **Retina** (view:2504-2725):
  - "Dilation orders/risks reviewed" checkbox.
  - C/D ratio and central macular thickness per eye.
  - Document links for POSTSEG and NEURO.
  - **Scleral Depression** button: opens a separate 1000×500 drawing panel.
  - Text grid OD/OS: disc, macula, vessels, vitreous, periphery.
  - Comments.
- **Neuro**: see §9.
- **Impression/Plan**: see §10–11.

**Text grid layout** (EB:2897-2910): each text grid can toggle between a wide and a narrow layout, remembered per section (`<ZONE>_VIEW`).

**Per-row copy arrows** (EB:3680-3685): each text-grid row has small arrows that copy one field to the other eye.

### 1.7 Per-user saved layout (prefs)

**Storage** (DB:13024-13038; save:71-246): one row per (user, zone="PREFS", key). Section visibility is stored separately in user settings with the `EyeFormSettings_` prefix.

**What is remembered:**

| Key | Meaning |
|---|---|
| `VA` | refraction row shown |
| `VAHx` | VA history chart open |
| `W`, `W_width` | glasses panel on; wide layout |
| `MR`, `MR_width` | MR panel on; wide layout |
| `CR` | autorefraction panel on |
| `CTL`, `ADDITIONAL`, `VAX`, `RXHX` | those panels on |
| `IOP` | glaucoma flow sheet open |
| `CLINICAL` | history-row width; whether to replay the global mode on load |
| `EXAM` | last global mode: TEXT, DRAW, QP or PRIORS |
| `CYLINDER` | the user's cylinder convention, plus or minus (§8.7) |
| `HPI_VIEW`, `EXT_VIEW`, `ANTSEG_VIEW`, `RETINA_VIEW`, `NEURO_VIEW`, `SDRETINA_VIEW` | text grid wide or narrow |
| `ACT_VIEW`, `ACT_SHOW` | cover-test grid open; which of its four tabs |
| `HPI_RIGHT` … `IMPPLAN_RIGHT` (8 keys) | per-section right-panel mode |
| `PANEL_RIGHT` | PMSFH slide-out open |
| `KB_VIEW` | shorthand box and code labels visible |
| `TOOLTIPS` | tooltips on or off |
| `setting_<ZONE>`, `setting_tabs_left` | section visibility; tab strip visibility |

**When prefs are saved:** on every layout action (mode switch, panel toggle, tab or section toggle, shorthand toggle, tooltip toggle, cover-test toggle, first cylinder sign typed) and once on page load. The whole set is posted each time.

**New users:** the original seeds a template for a sentinel user id (2048) that nothing ever copies (DB:13044-13081). **FIX:** give new users defaults of: global mode QP; glasses panel on; slide-out on; tooltips on; cover-test tab "cc distance"; retina text grid wide. Without this, a new user sees every refraction panel closed and tooltips off.

**FIX — remembered keys that never stick in the original** (all must persist):

- `IMPPLAN_RIGHT` is read from a non-existent element (EB:322).
- `MR_width` is saved from `W_width` (save:97-100).
- `HPI_VIEW` is never sent.
- `SDRETINA_VIEW` is never saved.
- `ACT_SHOW` is overwritten on every load (EB:4146).
- The tooltips value is compared against a translated word (EB:2292). Store tooltips as a boolean.

---

## 2. Shorthand

Vocabulary tables (aliases and abbreviation expansions) are in [SHORTHAND.md](SHORTHAND.md). This section covers grammar and processing rules.

### 2.1 Input and trigger

**Sees:** one floating, draggable box titled "Shorthand", with an info link to the help page (view:1975-1983; EB:4154-4156).

**Opening and closing** (EB:2357-2372, 1006-1012):

- The box opens from any section's shorthand icon or the menu.
- While it is open, each field shows its shorthand code as a small red label beside it, so users learn the codes from the screen.
- Opening the box while in Draw mode switches to Text mode.
- Switching to Draw or QP closes the box.
- The open/closed state is remembered (`KB_VIEW`).

**Triggers** (EB:2380-2381): pressing **Enter or Tab** in the box processes its contents. The key's normal action is suppressed: no newline, no focus move. There is no Process button.

**After processing** (EB:2454-2455): the form is saved once and the box is cleared.

**OpenVision addition (not in the original; DECISIONS D56):** while a code or a finding is typed, a suggestion list opens (a WAI-ARIA combobox, with "did you mean" near misses and recently used codes). Nothing in it is selected until the arrow keys are used, so **Enter** with the list open but untouched still processes the box exactly as above; Enter or Tab on a highlighted suggestion inserts it instead, and Escape closes the list (a second Escape clears the box). A keyboard and shorthand help sheet (`?`, F1) lists every code.

### 2.2 Grammar

The form of an input is `entry ; entry ; entry`, where each entry is `CODE:text`, optionally ending in `.a` to append.

| Rule | Behavior | Source |
|---|---|---|
| Entry separator | Semicolon. Empty entries are skipped. Newlines do **not** separate entries. | EB:2383, 2388 |
| Leading cleanup | Leading line breaks, leading non-word characters, then leading whitespace are removed from each entry. Trailing whitespace is kept. | EB:2389-2390 |
| Code | The leading run of letters, digits and underscore. Case-insensitive (uppercased before lookup). | EB:2444, 2446 |
| Delimiter | A colon after the code. A space also works, but then the text keeps its leading space. | EB:2444 |
| Text | Everything after the delimiter **up to the first newline**. Text after a newline is dropped. Case is preserved except where expansion changes it. | EB:2444 |
| Append suffix | Text ending exactly in lowercase `.a` (no trailing space) means append; the suffix is removed. Otherwise the field is **replaced**. | EB:2445 |
| Append format | old value + ", " + new text. | SH:219-227 |
| Expansion | The abbreviation dictionary runs on the text (never on the code) for every entry, in every zone. | EB:2448; SH:13-77 |

**FIX for append format:** the original adds a leading ", " even when the field is empty. Don't.

**FIX for dropped text:** a newline inside an entry is treated as a space instead of silently dropping the rest.

**Vocabulary expansion behavior (parity, with fixes)** (SH:13-77):

- Whole-word replacements. Most are case-insensitive; the casing of the expansion is as listed in SHORTHAND.md.
- A few uppercase acronyms are normalized: DCR, BCC, SCC, SPK, PEK, CSME, BDR, PED, C3F8.
- Clock hours are expanded: "N o" becomes "N o'clock".
- **FIX:**
  - Expand only in exam-finding zones (EXT, ANTSEG, RETINA, NEURO text). Never in CC, HPI, IMP, PMSFH titles or cover-test cells. In the original, "ENT referral" becomes "entropion referral" and "1 ht" in a cover-test cell becomes "horseshoe tear".
  - "nas", "temp" and "lac" must not swallow the following space.
  - Fix the spelling "kruckenberg" to "Krukenberg".

### 2.3 Resolution order for a code

The code is matched against these stages in order. The first match wins.

1. **Commands.** These must be the whole entry, case-insensitive (EB:2391-2441):
   - `D`: apply defaults to External, Anterior Segment, Retina and Neuro.
   - `DEXT`, `DANTSEG`/`DAS`, `DRETINA`/`DRET`, `DNEURO`: apply defaults to that one section.
   - `CLEAREXT`/`CEXT`, `CLEARAS`/`CLEARANTSEG`/`CANTSEG`/`CANT`/`CAS`, `CLEARRET`/`CLEARRETINA`/`CRET`/`CRETINA`: empty that section.
   - Shorthand commands run **without** the confirmation that the Defaults button asks for. **(parity)** Add a one-step undo instead (FIX, §17).
   - There is no clear-Neuro command. **(parity)**
2. **PMSFH types** (SH:127-153): `PMH`, `POH`, `POS`; `ALL`/`ALLERGY`; `MED`/`MEDS`/`MEDICATION(S)`; `SURG`/`SURGERY`/`PSURG`/`PSURGH`. These create issues (§2.4).
3. **Exact field id.** Any exam field's own name is a valid code: `RUL`, `ODCONJ`, `MRODSPH`, `ODIOPAP`, `ACT5CCDIST`, and so on (SH:218-229). This is the only way to enter refraction, VA or IOP values by shorthand.
   - **FIX:** the original allows *any* page element id, including the lock fields. Restrict this stage to a whitelist of clinical fields (FIELDS.md).
4. **Single-field aliases**, e.g. `RC` → right conjunctiva, `CC` → CC1 (SH:233-474; full table in SHORTHAND.md).
5. **Multi-field aliases** (SH:476-790). One code writes the same text to both eyes or sides:
   - `BUL`/`UL` → both upper lids; `BLL` → both lower lids.
   - `4XL` → all four lids.
   - `BC`/`C` → both conjunctivas.
   - `BK`/`K`, `BAC`/`AC`, `BL`/`L`, `BI`/`I`, `BD`/`BDISC(S)`, `BCUP(S)`, `BMAC`/`MAC`/`BM`, `BV`/`V`, `BVIT`/`VIT`, `BP`/`P`, `BCMT`/`CMT`, `BG`/`G`/`GONIO`, `BPACH`/`PACH`, `BTBUT`/`TBUT`.
   - `BLF`/`LF`, `BMRD`/`MRD`, `BVF`, `BCAR`/`CAR`, `BTA`/`TA`, `BCN5`/`BCNV`/`CN5`/`CNV`, `BCN7`/`BCNVII`/`CN7`/`CNVII`.
   - `FH`/`BB` → both brows.
   - `BAD` → both adnexa.
6. **Special codes:**
   - **`HERT`** (SH:476-482): the text "OD-base-OS" (digits separated by hyphens) fills OD Hertel, base and OS Hertel. Always replaces.
   - **Cover-test zone codes** (SH:759-775): `SCDIST`, `CCDIST`, `SCNEAR`, `CCNEAR` switch the current cover-test grid tab. Any text is ignored.
   - **A 1–2 digit code** (SH:776-790) writes cover-test cell *n* of the current tab (§9.2). The text is reformatted:
     - leading digits become the prism amount, followed by a space;
     - the rest is uppercased;
     - "i" + letter becomes "letter(T)" (intermittent);
     - the first space-plus-digit starts a new line.
     - Example: `5:8ix 1rht` gives "8 X(T)" on one line and "1RHT" on the next.
     - Writing a cell unchecks the "Ortho" box.
     - **FIX:** honor `.a` here; the original always replaces even though help says otherwise.
7. **Otherwise: unknown code** (§2.5).

**Highlighting and saving** (SH:219-227, 468-473; EB:2454): every field written by shorthand turns the "changed" color (§16.4). The whole form saves once, at the end of the batch.

### 2.4 PMSFH entries create issues

`POH:`, `PMH:`, `POS:`, `ALL:`, `MEDS:` and `SURG:` entries create patient issues (SH:155-214; save:618-741).

**Splitting the text:**

- The text is split on periods. One issue is created per piece.
- A period between two digits is protected, so "timolol 0.5%" stays one piece.
- **FIX:** trim each piece.

**Allergies:**

- A piece is split at its **last** space: the title is everything before it, the reaction is the final word ("sulfa hives" gives title "sulfa", reaction "hives").
- **FIX:** reset the reaction for each piece (the original carries it over to later pieces).
- **FIX:** a piece with no space is a title with no reaction (the original produces an empty title and silently fails).

**Type mapping:**

| Code | Issue type | Subtype |
|---|---|---|
| POH | medical problem | eye |
| PMH | medical problem | none |
| ALL | allergy | none |
| SURG | surgery | none |
| POS | surgery | eye |
| MEDS | medication | none |

**Duplicates:** an existing issue with the same title, type and subtype is updated instead of duplicated. A new issue is linked to the current encounter.

**After each issue is created,** the PMSFH summary and the slide-out refresh.

**`.a` has no meaning** for PMSFH entries; they always add. **(parity)**

**Not supported by shorthand:** family history, social history, ROS. **(parity)**

**FIX:** the original sends the patient id as the begin date. Leave the begin date blank, or set it to the visit date for medications only.

### 2.5 Unknown codes

Original behavior (SH:78-96):

- An unknown code, together with its text, is **appended to the previous entry's field** as continuation text.
- The colon is lost, the first word is lowercased, and append is always used.
- "Previous field" persists across separate Enter presses for the life of the page.
- An unknown code with no previous field throws an error and aborts the batch: nothing is saved and the box is not cleared.

**FIX (our behavior):**

- Do not silently append.
- Leave unrecognized entries in the box, highlighted, and show an inline message: "Unknown code: XYZ — did you mean …?" with the closest codes.
- Apply all recognized entries.
- Continuation onto the previous field is still allowed, but only when explicit: an entry with **no code** (text only) appends to the previous field *within the same batch*.

### 2.6 Shorthand code defects (all FIX)

| Code | Original behavior | Build instead | Source |
|---|---|---|---|
| `LCN5` | writes `LCNVI`, which does not exist; text lost | write left CN V (`LCNV`) | SH:278 |
| `LH` | writes `OLHERTEL`, which does not exist; text lost | write OS Hertel | SH:291 |
| `BC` / `C` | conjunctiva and cup both claim these; conjunctiva wins, the cup branch is unreachable | `BC`/`C` = conjunctiva (parity with the actual behavior); cup = `BCUP`/`BCUPS`/`CUP` | SH:609, 699 |
| `CUP` | shown as a field label but not handled (falls to unknown) | both cups | view:2539 |
| `BCNVII` / `CNVII` / `CN7` | writes the **CN V** fields (`RCNV`/`LCNV`) instead of CN VII | write `RCNVII` and `LCNVII` | SH:543-551 |
| `BAD` | writes non-existent ids; text lost | both adnexa | SH:589-598 |
| `FH` / `BB` with `.a` | appends, then overwrites | honor append | SH:599-608 |
| `RNPC` / `LNPC` | target per-eye NPC fields that do not exist | `NPC` (single field) | SH table |
| `VF`, `SCH1`, `SCH2` | shown as labels but not handled | `VF` = both vertical fissures; `SCH1`/`SCH2` = both Schirmer I / II | view:2034, 2278, 2287 |
| `Lx4` | unreachable (codes are uppercased first) | drop it; `4XL` covers this | SH:563 |
| `LL` | resolves to left **lens** (single alias wins over both-lower-lids) | keep as left lens; `BLL` = both lower lids | SH:553 |
| `HERT` without the right pattern | script error | show an inline message | SH:477 |

---

## 3. Defaults ("normal"), copy right↔left, clear

### 3.1 Where default values come from

**Source list** (EB:3428-3477): each provider has a list named `Eye_defaults_<providerId>`. Each row has:

- a **target field**,
- a **value** (the normal finding text),
- a **zone**: EXT, ANTSEG, RETINA or NEURO.

**Seeding:** on first use, the list is created by copying the general seed list `Eye_Defaults_for_GENERAL` (LISTS.md). All copied rows are active.

**FIX:**

- The original seeds on every page load, inside script generation, and trusts the provider id from the URL. Seed only when the provider first opens an exam.
- Default text must be safely encoded; a quote mark in a default breaks the original page.
- Edit > Default Values opens this provider's list for editing.

**IOP targets** are also intended to come from this list (`ODIOPTARGET`/`OSIOPTARGET`), with a fallback of 21/21. See §8.3.

### 3.2 Buttons

| Control | Fills | Confirm? | Source |
|---|---|---|---|
| **Defaults** (red, in the mode bar) | every default row, all zones | "Replace all exam findings with Default values? Are you sure?" | EB:3422-3482 |
| Section defaults, R or L (External) | that section's rows whose field starts with R or L | no | EB:3483-3510 |
| Section defaults, OD or OS (Anterior Segment, Retina) | rows starting with OD or OS | no | EB:3529-3556, 3616-3643 |
| Section defaults, both eyes | both of the above | no | |
| Neuro defaults | all Neuro rows | no | EB:3646-3654 |
| Quick-pick bar "Defaults" | same as that section's defaults | no | view:2197 |
| Shorthand `D`, `DEXT`, … | as in §2.3 | no | |

**Overwrite rule:** defaults **always replace**, including fields that already hold text. **(parity)**

**Default marker:** every default-filled field is tinted with a distinct "default" color (beige in the original). That tint is meaningful: quick picks treat a field still in the default color as replaceable (§4.3). Any user edit clears the tint.

**FIX:** after a bulk defaults action, offer an "Undo defaults" toast. The original has no undo.

**Fixed-value "normal" buttons** (not list-driven):

| Button | Sets | Source |
|---|---|---|
| Color vision normal | OD and OS "11/11" | EB:3946-3950 |
| Coins normal | OD and OS "1.00" | EB:3952-3957 |
| Red desaturation normal | OD and OS "100" | EB:3959-3963 |
| Pupils Normal (when checked) | sizes 3.0→2.0, reactivity "+2", APD "0", both eyes | EB:3127-3140 |
| Motility Normal | all 16 motility counters to 0 | EB:3686-3725 |
| Amsler Normal | both eyes to 0 | EB:3113-3126 |
| Fields FTCF | all 8 quadrants unflagged | EB:3190-3195 |

**FIX for FTCF:** set the quadrant values to 0 as well; the original only unchecks the boxes, so stale flags can persist.

### 3.3 Copy between eyes

| Button | Copies (destination overwritten, even with blank) | Not copied |
|---|---|---|
| External R→L, L→R | brow, upper lid, lower lid, medial canthus, adnexa | measurements |
| Anterior Segment OD→OS, OS→OD | conjunctiva, cornea, AC, lens, iris | gonio, pachymetry, Schirmer, TBUT |
| Retina OD→OS, OS→OD | disc, cup, macula, vessels, vitreous, periphery | CMT |
| Per-row arrow | that single field | |

Each copy saves (EB:3512-3592, 3680-3685).

### 3.4 Clear

| Control | Clears | Confirm? |
|---|---|---|
| Per-side clear (R/L, OD/OS) | that side's text-grid fields | no |
| Quick-pick bar "clear" | the whole section | yes |
| Shorthand clear commands | the whole section | no |

Sources: EB:3594-3678, 3200-3230.

**FIX:** the original binds the External clear twice, so it saves twice. Clear once, then save once.

---

## 4. Quick picks

### 4.1 Lists

**One list per provider per zone** (EMF:2942-3049):

- Zones: EXT, ANTSEG, RETINA. Also HPI and PMH panels, and Neuro (which uses the cover-test builder, §9.2).
- List name: `Eye_QP_<ZONE>_<providerId>`.
- On first display, if the provider's list is empty, a header is registered ("Eye QP List <zone> for <provider surname>") and every row of `Eye_QP_<ZONE>_defaults` is copied (LISTS.md).
- A pencil icon opens the provider's list for editing.

**One "pick" is a group of rows sharing a title**, one row per laterality:

| Column | Meaning |
|---|---|
| title | label shown in the list |
| subtype | laterality: `OD`/`OS`/`OU` for eye zones, `R`/`L`/`B` for External |
| mapping | the field name without its laterality prefix, e.g. `CONJ` |
| notes | the text to insert |
| codes | an optional diagnosis code (unused by the original UI) |
| activity | insert mode: 0 = ADD, 1 = REPLACE, 2 = APPEND |

**FIX:** the original reads the insert mode from the OD (or R) row only and applies it to all three links. Use each row's own mode.

**Display** (EMF:2968-3037):

- Each pick shows its title and three links: **OD | OS | OU** (or **R | L | B**).
- Titles longer than 19 characters are cut to 16 + "…", with the full title in a tooltip.
- Titles containing "clear field" are shown bold italic.
- Two columns of 19 rows; at most 38 picks are shown.
- **FIX:** paginate or scroll instead of silently dropping picks beyond 38.

### 4.2 Modifiers

A row of toggle buttons above each zone's list (view:2197-2224, 2466-2491, 2692-2717):

| Group | Values |
|---|---|
| Off / clear | Off; Defaults (§3.2); clear (§3.4) |
| Grade | no, trace, +1, +2, +3 |
| Size | 1mm, 2mm, 3mm, 4mm, 5mm |
| Location | medial, lateral, superior, inferior, anterior, mid, posterior, deep. Retina uses nasal and temporal in place of medial and lateral. |

- **One modifier at a time.** It applies to the next pick only and then resets to Off (EB:101, 3196-3235).
- The selected modifier is highlighted.
- There is no +4 and no Neuro modifier row. **(parity)**

### 4.3 Writing a pick into a field

Original behavior (EB:54-102):

- **Target field** = the laterality prefix + the mapping. For example, OD + `CONJ` targets OD conjunctiva; R + `UL` targets right upper lid.
- **OU / B** writes to both eyes or sides, in the order OD then OS (R then L), applying the same modifier to both.
- **Prefix** = the active modifier, followed by a space (none when Off).

| Mode | Result |
|---|---|
| REPLACE | field = prefix + text |
| APPEND | field = current value + text, with **no separator and no prefix** **(parity)** |
| ADD (default) | If the field is empty **or still in the default color**: field = prefix + text. Otherwise, if the current value ends with "x": append the text directly. Otherwise: append ", " + prefix + text. |

- Text is inserted exactly as stored, with no case change.
- After each pick the field turns the "changed" color and the form saves.

**FIX:** the original inserts a double space after the prefix on the second eye of an OU pick (EB:56, 82).

---

## 5. Drawing

### 5.1 Canvases

**One canvas per zone** (EMF:3168-3271; CD:156-163):

| Zone | Size |
|---|---|
| HPI, PMH, EXT, ANTSEG, RETINA, NEURO, IMPPLAN | 450×250 |
| SDRETINA (scleral depression) | 1000×500 |

**Base images:** a zone-specific anatomical drawing named `OU_<ZONE>_BASE`, plus a blank base. Our art must be original; draw new base images, do not copy the originals.

**Panel header icons:** go to Text, Quick Picks, Shorthand. SDRETINA has none of these.

### 5.2 Tools

| Tool | Behavior |
|---|---|
| Colors | Seven pencils: blue, yellow, orange, brown, red, black (default), white, plus a free color picker. The selected pencil is enlarged. White is the only eraser. |
| Widths | 1 (default), 3, 5, 10, 15 px; the selected width is underlined |
| Stroke | Freehand line segments with round joins |
| Undo / Redo | A per-canvas snapshot stack for the page session, unlimited depth. A snapshot is taken after the base loads and after every stroke ends. A new stroke discards the redo branch. |
| Revert | Redraws the currently loaded image: the latest saved drawing, the base, or a chosen prior |
| New | Reloads the zone's base image |
| Blank | Loads the blank base |
| Text | None (parity) |
| Input | Mouse and touch |

Source: EMF:3193-3263; CD:27-136; EB:2459-2469, 3982-3987.

**FIX:**

- **Touch must work.** The original reads coordinates that touch events don't provide, so touch drawing is broken (CD:27-41).
- **Per-canvas state.** The original shares pointer state across all canvases.
- **Lossless snapshots.** The original snapshots as JPEG, which degrades each undo cycle; use PNG.
- **Blank must not submit the page.** The original Blank button submits the whole form.

### 5.3 Saving

Original behavior (EB:267-283, 3965-3980; save:1182-1229):

- **When:** on every pointer-out of the canvas, even if nothing was drawn, and on Undo, Redo and New.
- **What:** the canvas as a JPEG image.
- **Where:** stored as a patient document named `<pid>_<encounter>_OU_<ZONE>_VIEW.jpg` in the "Drawings" category ("Drawings - Eye").
- **How:** each save deletes the previous document for that name (file and row) and creates a new one, so there is **one live drawing per patient, encounter and zone**. The document is linked to the encounter.

**FIX — build instead:**

- Save only when the canvas is dirty: on stroke end (debounced about 1.5 s), on Undo/Redo/New/Blank/Revert *after* the image has finished redrawing, and on page hide.
- Store as PNG.
- Look up the existing drawing by **exact patient, encounter and zone keys**, never by a wildcard name match. The original's wildcard match can show or delete another patient's drawing.
- Version the drawing (keep history) rather than hard-delete.
- Respect the exam lock (§15): a read-only viewer never saves.
- Put the first save in the Drawings category; the original files it in the root category until the second save.

### 5.4 Showing current and prior drawings

**On load** (EMF:3209-3222): each canvas loads the latest saved drawing for this exam and zone, otherwise the base image.

**Prior drawing navigator** (EMF:3051-3152; EB:921-946, 2958-3000, 4268-4283):

- Lists this patient's drawings for the zone from other encounters, newest first.
- A "New" placeholder comes first when the newest drawing isn't from this encounter.
- Controls: oldest, older, select-by-date, newer, newest. Shown only when there are at least two entries.
- **Selecting a prior** shows it as a still image, labelled "Previous Encounter Drawings", in place of the canvas, with a **"Use this image"** button.
- "Use this image" loads the prior into the canvas as the starting point for this visit. It is saved with the next save. The navigator returns to "current".
- **FIX:** sort by actual date; the original sorts formatted date strings.

**In the report:** see §13.4.

---

## 6. Priors

### 6.1 Which visits qualify

Original (EMF:52-67):

- Every non-deleted eye exam of **this patient**, newest first, capped at 20.
- **This includes the current exam and any later exams.**
- With fewer than two exams, there is no navigator and the mode bar says "First visit: No Old Records".

**FIX:** list only visits dated **before** the exam being viewed. Show the current visit as the "today" anchor. Keep the cap at 20 for the selector, with a "show more" option.

### 6.2 Navigator

The same widget appears in the mode bar (for ALL sections) and inside each section (EMF:143-188). Left to right:

1. **Copy icon**: shown only when the visit displayed is not the current exam.
2. Oldest.
3. Older.
4. Date select.
5. Newer.
6. Newest.

Selecting the current exam returns that section, or all sections, to Quick Picks (EB:2926-2936).

### 6.3 Display

**Per section** (EB:904-923, 2938-2950; EMF:205-1589):

- The chosen visit's version of that section appears in the **right half**, read-only, beside the live left half: a side-by-side comparison.
- It uses the same layout as the live section with every input disabled.
- Close (X) returns the section to Quick Picks.

What each section's prior view shows:

| Section | Prior view contents |
|---|---|
| External | measurements, the text grid, comments, document links |
| Anterior Segment | gonio, pachymetry, Schirmer, TBUT, dilation drugs and time, the text grid, comments |
| Retina | C/D, CMT, the text grid, comments |
| Neuro | color, red desaturation, coins, the cover-test grids (four tabs), NPA, NPC, stereo, amplitudes, a motility diagram with tick marks, comments |
| Impression/Plan | the numbered items: title, code, plan text with line breaks kept |
| PMSFH | the PMSFH summary |

**ALL view:** choosing a visit in the mode-bar navigator switches every section to the priors mode at once, one request per section.

### 6.4 Copy forward

**Per section:**

- The copy icon pulls the chosen visit's values for that section into the live exam.
- Every field whose value differs is **overwritten** and tinted the "copied" color (purple in the original).
- Then the form saves once (EB:3989-4078; EMF:3282-3700).
- Graphical fields refresh to match: motility tick marks, field quadrant boxes, Amsler image, VA mirror copies.
  - **FIX:** in the original these refresh only when the value did *not* change.

**Fields per section:**

| Section | Fields copied |
|---|---|
| External | lids, brows, medial canthi, adnexa, MRD, levator function, vertical fissure, carotid, temporal artery, CN V, CN VII, Hertel (both eyes and base), comments |
| Anterior Segment | conjunctiva, cornea, AC, lens, iris, pachymetry, gonio, Schirmer I and II, TBUT, comments |
| Retina | disc, cup, macula, vessels, vitreous, periphery, CMT, comments |
| Neuro | all 44 cover-test cells, visual-field quadrants, **all 16** motility counters, stereo, NPA, NPC, vergence and vertical fusional amplitudes, accommodation, color, coins, red desaturation, pupils (light and dim), pupil comments |
| Impression/Plan | **replaces** the current item list with the prior's items, then saves |

**FIX for External:** the original copies OD Hertel only in ALL, and wrongly includes Schirmer/TBUT in External.

**FIX for Anterior Segment:** Schirmer never copies in the original because of misspelled keys.

**FIX for Neuro:** the original omits the 8 oblique motility counters and OD Hertel.

**FIX for Impression/Plan:** offer "replace" or "append". The original only replaces.

**Whole exam (ALL copy):** External + Anterior Segment + Retina + Neuro, plus the legacy free-text impression. **FIX:** include the Impression/Plan items too (append mode).

**Refractions are never copied forward.** **(parity)** Prior refractions are viewed through the "R" panel.

---

## 7. HPI, ROS and PMSFH

### 7.1 HPI

The layout is in §1.3.

**Element counting** (EB:1148-1180):

- Counts non-empty element boxes across all three complaint tabs together: eight elements per tab.
- Counts the three CHRONIC boxes separately.
- **FIX:** the original omits Severity on tab 2 from the count (view:574/577).

### 7.2 Issue editor (a_issue.php)

**Sees:** a compact form inside the PMSFH panel with a type radio row.

- Types, in order: POH, POS, Eye Meds, PMH, Medication, Surgery, Allergy, FH, Social, ROS (issue:652).
- Each type has a **quick-pick list** of common titles.
- Fields change with the type.

**Permissions** (issue:54-65): editing an existing issue requires patient-medical write; adding requires write or add-only.

**Quick-pick title source** (issue:114-209):

- The most frequent titles of that type and subtype among patients this provider saw in the **last 30 days**: top 20 for PMH, top 10 for the other types.
- If there are fewer than 4, fall back to the standard OpenEMR issue lists, filtered to eye or non-eye by subtype.
- Picking a title copies the title and its diagnosis code.

**Fields by type** (issue:250-335):

| Type | Stored as | Title label | Fields shown |
|---|---|---|---|
| POH | medical problem, subtype eye | "Eye Dx" | diagnosis code, date, collaborator (tooltip "Co-managing/referring provider"), comments |
| POS | surgery, subtype eye | "Procedure" | diagnosis, date, surgeon, outcome, comments |
| Eye Meds | medication, subtype eye | "Medication" | start, finish, comments, "Eye Med" checkbox (checked) |
| PMH | medical problem | "PMH Dx" | diagnosis, onset, resolved date and an Active checkbox, course (occurrence list), comments |
| Medication | medication | "Medication" | start, finish, comments, "Eye Med" checkbox (unchecked) |
| Surgery | surgery | "Procedure" | diagnosis, date, surgeon, outcome, comments |
| Allergy | allergy | "Allergic to" | reaction, start, comments |
| FH | (family-history columns) | none | family-history grid (§7.5) |
| Social | (social-history columns) | none | social grid (§7.6) |
| ROS | review-of-systems fields | none | ROS grid (§7.3) |

**Field rules** (issue:433-504):

- **Diagnosis code** opens a code finder. Multiple codes are allowed, separated by ";". If the title is empty, the first code's description fills it.
- **Active** (checkbox):
  - Unchecking it clears the end date and reveals **Delete**.
  - Checking it sets the end date to today and hides Delete.
- **Outcome**: choosing "resolved" sets the end date to today.
- **Validation:**
  - The end date can't be before the begin date.
  - A title is required except for FH, Social and ROS.
  - **FIX:** the original's AJAX save skips this validation.
- **Medication begin date:** empty defaults to today for eye meds and to the visit date otherwise.

**Save, delete, cancel** (issue:354-429; save:529-753):

- **Save** posts the form, clears it, and refreshes the PMSFH summary and the slide-out.
- **Delete** removes the issue and its encounter links, with an audit entry.
- **Cancel** clears the form.
- **Duplicates:** an existing issue with the same title, type and subtype is updated in place. **FIX:** match on subtype too, so a PMH entry can never overwrite an eye-subtype issue.
- **New issues** are linked to the current encounter.

**FIX for the editor's opening state:** the original always opens showing the Eye Meds field set even when POH is selected (issue:1356-1361). Open on the selected type, or on the loaded issue's type.

### 7.3 ROS

**Fields** (issue:1248-1335; EMF:2003-2041): twelve systems, each with a Negative radio and a text box, plus comments:

- General
- HEENT
- Cardiovascular
- Pulmonary
- GI
- GU
- Dermatology
- Neuro
- Psych
- Musculoskeletal
- Immunologic
- Endocrine

**Storage:** per exam (`form_eye_ros`), not per patient.

**Summary display:** short labels (GEN, HEENT, CV, PULM, GI, GU, DERM, NEURO, PSYCH, ORTHO, IMMUNO, ENDO). An empty ROS shows "Negative".

### 7.4 Chronic problems feed into HPI

Issues whose occurrence is "chronic" (code 4) are collected (EMF:1764-1766).

On every save response (EB:642-669):

- Each chronic issue is written as "title diagnosis" followed by its comments on a new line.
- It goes into the first empty CHRONIC box, unless identical text is already in one of the three boxes.

### 7.5 Family history

**Source:** the patient's history record, latest version (issue:1160-1247; EMF:1903-1989).

**Rows:** each has a Negative radio (clears the text) and a text box. Clicking an empty box fills "Y".

| Kind | Rows |
|---|---|
| Eye-specific (custom user-text columns) | Glaucoma, Cataract, AMD, RD, Blindness, Amblyopia, Strabismus, Other |
| General | Epilepsy, Cancer, Diabetes, HTN, Cardiac, Stroke |
| Shown in the summary only | Psych, Suicide |

**Summary:** first 100 characters of each entry; an empty FH shows "Negative".

**FIX:**

- Write a new history version (or update only the latest one).
- Never blank Psych or Suicide just because the editor didn't post them. The original's update hits every history version and clears those two (save:590-611).

### 7.6 Social history

**Fields** (issue:803-1153; EMF:1774-1878):

| Field | Form |
|---|---|
| Marital status | free text, matched to the marital list |
| Occupation | text |
| Tobacco | status select kept in sync with Current/Quit/Never/N-A radios, note, date; smoking-status codes |
| Coffee, alcohol, drugs, counseling, exercise, risky behavior | note + Current/Quit/Never/N-A + date |
| Sleep, seatbelt | text |

**Summary short labels:** Caffeine, Cigs, ETOH, Sleep, Exercise, Seatbelt, Therapy, Thrills, Drug Use. Each shows the first 10 characters of its note. Marital status and occupation are always shown.

**FIX:**

- Load and keep the stored dates; the original renders them empty, so saving wipes them.
- Allow occupation to be cleared.

### 7.7 Patient lists in the original

| List | What it contains |
|---|---|
| Eye Meds | medications with subtype eye |
| Medication | the original's report includes eye meds too |
| POH / POS | eye-subtype problems / surgeries |
| PMH / Surgery | non-eye problems / surgeries |
| CHRONIC | any issue with occurrence = chronic |

**FIX:** keep Medication strictly non-eye so eye meds are not listed twice.

---

## 8. Vision, IOP, Amsler, fields, pupils, biometrics

### 8.1 Visual acuity entry

- **Free text.** Typing "=" becomes "+" and a leading "j" becomes "J" (Jaeger) (EB:3378-3384). **FIX:** this must work in every browser; the original only works with Firefox key codes.
- **Mirrors:** see §1.5.

### 8.2 VA history chart

Behind "V" in the vision box (EMF:5627-6084).

**Table:**

- Visits from oldest to newest, **excluding** visits after this exam.
- Column groups, each shown only when it has data: SC, CC (from wearing Rx #1), PH, AR, MR, CR, CTL. Each group has OD and OS.

**Chart:**

- X axis: visit dates.
- Series: SC, CC, MR, CTL for each eye.
- Y axis: the **Snellen denominator** (20/40 plots as 40); suggested maximum 50.

**FIX:**

- The original chart never renders correct data, because its labels and data are emitted as strings.
- Parse pinhole too.
- Plot logMAR (lower is better), with the Snellen denominator shown on hover.
- Add AR, CR and PH series as toggles.

### 8.3 IOP

**Entry** (view:878-917; save:835-839):

- Applanation, Tono-Pen and finger tension, per eye.
- **Time:** shown as "h:mm AM/PM". On save, an empty or midnight time is set to the current time. **(parity)**
- **Post-dilation IOP** per eye lives in the cycloplegic panel.

**High-value highlight** (EB:2169-2174): any IOP value above 21 is highlighted red. **FIX:**

- Compare numerically. The original compares text, so "3" counts as high and "100" does not.
- Compare against the per-eye **target** when one is set.
- Do not color the target fields themselves.

**Targets** (EMF:6697-6734): intended lookup order per eye:

1. The latest prior visit's targets.
2. The provider's defaults list entries `ODIOPTARGET` / `OSIOPTARGET`.
3. 21 / 21.

The targets are editable in the flow sheet. **FIX:** the original always returns 21/21 because of query bugs.

**Glaucoma flow sheet.** Opened from the IOP chart icon or Library > IOP Graph (EMF:4803-5610).

**Left table:**

- **Current targets:** OD and OS, editable.
- **Current eye meds:** with start date.
- **Prior eye meds:** start and end dates, collapsed behind a toggle.
- **Visual fields:** documents from the "VF" category; newest shown, others collapsed; each opens in the document viewer.
- **OCT (optic nerve analysis):** documents from the "OCT" category; same pattern.
- **Gonioscopy:** one row per prior visit: date, OD text, OS text.
- **Optic discs:** one row per prior visit: date, OD cup, OS cup.

**Chart "by date":**

- X axis: the union of visit dates, VF dates, OCT dates and gonio dates.
- Lines: Target OD, Target OS, IOP OD, IOP OS. Each visit uses applanation if present, otherwise Tono-Pen. Finger tension is ignored.
- Bars: "performed" markers for VF, OCT and gonio.
- Y axis: mmHg from 0, suggested maximum 35.

**Chart "by hour":** IOP OD and OS plotted against time of day (HH:MM).

**No date-range control.** The chart covers the 20 most recent visits. **(parity)**

**Live update:** changing today's IOP or targets updates today's points without reloading (EB:544-604).

**FIX list for the flow sheet:**

- Treat "current eye meds" as no end date, or an end date after the visit; the original's test is inverted.
- Record the OS method (the original leaves it blank).
- A missing OS value is a gap, not the string "null".
- Align the VF series by date.
- Plot OCT as a marker.
- Match "today" by value, not by element.
- Format hours correctly ("08", not "008").
- With no priors, still plot today's applanation reading.

### 8.4 Amsler

Clicking an eye's image (active chart only) cycles the severity 0→1→…→5→0 (EB:3113-3179). Each step:

- updates the image and the "n/5" caption,
- unchecks Normal.

Checking **Normal** sets both eyes to 0.

**FIX:** save on change. The original saves only when the pointer leaves the image.

### 8.5 Confrontation fields

Four quadrant toggles per eye: values 1 (defect) or 0 (EB:3180-3195).

- Flagging any quadrant unchecks **FTCF**.
- Checking FTCF clears every quadrant.
- FTCF itself is not stored. It is derived: checked when no quadrant is flagged.

### 8.6 Pupils

Original behavior (EB:3127-3147):

- **Normal** fills 3.0→2.0, "+2", APD "0" for both eyes.
- A single-digit reactivity gets a "+" prefix automatically.

### 8.7 Refraction field formatting

Applied on leaving the field (EB:2655-2838, 2064-2135).

| Field | Rule |
|---|---|
| Sphere | "plano" (any case) becomes "PLANO". Otherwise format to a signed number with two decimals in 0.25 steps: a missing sign becomes "+"; "1" → "+1.00"; ".2"/".7" endings → ".25"/".75"; without a decimal point the last two digits are the decimals ("125" → "+1.25"). |
| ADD | Same, always positive ("=" becomes "+"). **The OD ADD and mid-ADD are copied to OS** for MR, AR, CTL and every wearing Rx. |
| Cylinder | Empty while a sphere is present, or the word "sph", becomes "SPH" (or blank when the sphere is PLANO), and the axis is cleared. Otherwise quarter-step formatting. A missing sign gets the user's cylinder convention (default "+"). Typing an explicit sign different from the convention **changes the saved convention**. |
| Axis | Zero-padded to 3 digits when the matching cylinder is a real value; blanked otherwise. K2 axis follows K2 instead. |
| Prism, PD | Uppercased |

**Transpose button** (gamepad icon; MR, AR, CR, CTL and every W):

- new sphere = sphere + cylinder (0 shows as PLANO);
- new cylinder = the negated cylinder (0 shows as SPH);
- new axis = axis ±90.

**FIX list for formatting:**

- Cylinder "25" must mean 0.25, like sphere (the original gives 2.50).
- The axis rule is: add 90 when the axis is 90 or less, otherwise subtract 90, so 90 becomes 180, not 000.
- Transposing must autosave.
- Fix the original's broken quarter-step test (EB:2680).

**Rx type buttons:** Single, Bifocal, Trifocal and Progressive show or hide the near and mid rows. **FIX:** the original's handlers target ids that don't exist.

**Biometrics:** no calculations (no IOL power, no spherical equivalent, no vertex conversion). **(parity)**

---

## 9. Neuro

### 9.1 Motility grid

**Two diagrams, OD and OS**, over an extraocular-muscle background (view:3040-3428; EB:3727-3776).

- **Cells:** 8 cardinal cells (up, down, in, out per eye) and 8 oblique cells.
- **Each cell holds a counter 0–4.**
- **Clicking** increments the counter, wrapping from 4 back to 0, and draws that many hash marks: horizontal bars for vertical gazes and obliques, vertical bars for horizontal gazes.
- Clicking any cell unchecks **Motility Normal** and saves.
- **Motility Normal** zeroes all 16 cells.

Limits **(parity)**: no sign distinction (over- vs under-action), and no decrement except by wrapping.

**FIX:** the original renders two oblique hidden values from the wrong variables (view:3063, 3068), which swaps data on the next save. Bind each cell to its own value.

### 9.2 Alternate cover test

**Grid** (view:2790-2850, 3439-3533; EB:3236-3306, 3901-3945):

- Toggled open or closed (remembered).
- Four tabs: **sc distance, cc distance, sc near, cc near**. The default tab is cc distance; the last tab used is remembered.
- Each tab has an 11-cell gaze grid:
  - cells 1–9 form the 3×3 gaze positions (5 = primary);
  - 10 and 11 are the right and left head tilts.
- Cells are free-text multi-line boxes.
- An **Ortho** checkbox marks the whole test normal.

**Builder** (right panel when Neuro is in QP mode):

| Group | Options |
|---|---|
| Laterality | Right, Left, None |
| Deviation | E, E(T), ET, X, X(T), XT, HT, H(T), hypoT, hypo(T) |
| Zone | the four tabs |
| Gaze position | 1–11 |
| Prism diopters | Ortho, 1–6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40 |

- Focusing a grid cell selects its gaze number.
- Choosing "Ortho" clears laterality and deviation.
- **RECORD** writes "amount side+deviation" into the selected cell, replacing what is there.

**FIX:**

- RECORD must save; the original only saves on the next unrelated change.
- Don't recolor other focused cells red (EB:3253-3266).

### 9.3 Other neuro fields

| Field | Details |
|---|---|
| Color vision | per eye, e.g. "11/11"; normal button |
| Red desaturation | per eye; normal button sets 100 |
| Coins | per eye; normal button sets 1.00 |
| NPA | per eye |
| NPC | single field |
| Stereopsis | |
| Accommodation | distance and near |
| Convergence amplitudes | distance and near |
| Divergence amplitudes | distance and near |
| Vertical fusional amplitudes | |
| Comments | |

These are all plain text with no validation. **(parity)**

### 9.4 92060 trigger

Original rule (EB:1127-1143):

- The **sensorimotor exam** code 92060 is suggested when **stereopsis is filled** and **any one** of these is filled:
  - the primary-position cover-test cell (any of the four tabs),
  - NPA (either eye),
  - NPC,
  - accommodation (distance or near),
  - convergence amplitudes (distance or near),
  - vertical fusional amplitudes.
- **When it fires:** the coding panel shows "92060 Sensorimotor Exam - no modifier required", and the code is added to the fee-sheet payload with the visit's justifiers.
- **When it is re-evaluated:** on leaving any of those fields.

**FIX:** this is too permissive (stereo + NPC alone triggers it). Require a multi-position deviation measurement: at least one non-primary cover-test cell, or two or more tabs measured. Keep stereo as a co-requirement. Make the suggestion advisory, with an explicit include checkbox.

---

## 10. Impression/Plan builder

### 10.1 Panel structure

The Impression/Plan section has two halves (view:3538-4296).

**Left half:**

- The ordered **impression list**.
- A **"New Dx"** free-text box.
- How-to text: "Tab creates each entry; drag a Dx by its handle; double-click a handle; select several and click the reply icon".

**Right half:** an accordion where only one pane is open at a time:

1. **Impression/Plan Builder**
2. **Coding Engine** (§11)
3. **Next Visit Orders** (§10.6)
4. **Communication Engine** (§14.1)

### 10.2 Candidate diagnoses (the Builder list)

The list is rebuilt after every save (EB:1206-1274). It has three sources, each with an include checkbox:

| Checkbox | Default | Source |
|---|---|---|
| Exam findings | on | the findings engine's results (§10.3); one row per detected term |
| POH / POS | on | the patient's eye problems and eye surgeries |
| PMH | off | the patient's general problems |

**Rows:**

- Each row shows the title, with its code on the right.
- Rows can be reordered by a drag handle.
- **All rows start selected.**

**Adding rows to the impression list:**

- **Reply icon:** adds every selected row from a checked source.
- **Double-click a handle:** in the original this adds every selected row, because all start selected. **FIX:** double-click adds only that row.
- **Drag a row onto the impression list:** adds that one row.
- **Drag a row onto the "New Dx" box:** **replaces** the box contents with the row text (plus the issue's comments).

**What each added item contains:**

| Item from | Contains |
|---|---|
| an exam finding | code(s) joined with ", "; description and plan built from each matched location's description, one per line; a link back to the finding |
| an issue | title, code, description; **the plan starts as the issue's comments**; a link back to the issue |

**FIX:**

- Drag-adding a finding must build the item exactly like the button does (the original differs in separators and which description it takes).
- Don't require *both* POH and PMH to be non-empty before the list appears (view:3612-3615).

### 10.3 Findings → diagnosis engine

Lists are in LISTS.md: `Eye_Coding_Terms` (96 rows) and `Eye_Coding_Fields` (30 rows). Source: EMF:4332-4781.

**Input:** all exam field values, run on every save.

**The terms list** — each active row, in `seq` order, has:

- a **title**: either `term`, or `term:opt1|opt2|…`;
- a **location**: the single exam field to search;
- **codes**: optional, in the form `TYPE:CODE`; the type defaults to ICD10.

**Matching:**

- A term matches when it appears as a **whole word** in its location field's text.
- **FIX:** match case-insensitively and treat the term literally. The original is case-sensitive and treats regex characters in a term as regex.

**Specificity:**

- More specific terms are listed first in `seq` (for example "cicatricial ectropion" before "ectropion").
- A term is **skipped** when an earlier hit *in the same field* already contains it as a whole word.
- **(parity)** — the list order is the specificity mechanism, so preserve it.

**Laterality:**

- A field starting with OD is right eye / OD.
- **FIX:** a field starting with OS, or with L for External, is left eye / OS; a field starting with R is right. The original calls everything that isn't OD "left", so right lids are coded as OS.

**Resolving codes — three paths:**

| Path | When | Behavior |
|---|---|---|
| A. Fixed code | the row has a code and no options | use that code. **FIX:** add the eye label to the title, and when the row has no type prefix use its own code (the original reuses the previous row's code). |
| B. Options | the title has `:opt|opt` | each option names a special rule (below), or else is extra search words |
| C. Search | no code and no options | search the ICD-10 code set for "term + field context" |

**FIX for path C:** search with "term + the field's description from `Eye_Coding_Fields` + laterality word" (for example "ptosis right upper eyelid"), as that list intends. The original appends the user's raw field text and never reads `Eye_Coding_Fields`.

**Option `DM` — diabetes with retinopathy.** Runs once per eye.

1. **Diabetes type**, from the patient's PMH diagnosis descriptions:
   - type 1 → "Type 1 diabetes mellitus";
   - type 2 → "Type 2";
   - otherwise "Other specified diabetes".
   - No diabetes found → skip.
2. **Macular edema:** "with macular edema" when the macula field contains "CSME" and does not contain "flat"; otherwise "without".
3. **Severity tier:**

| Tier | Rule |
|---|---|
| Proliferative | "NVD" in disc, or "NVE" in vessels or periphery |
| Severe NPDR | "PPDR" in vessels, or "IrMA" in macula, vessels or periphery |
| Mild NPDR | "BDR" plus a trace or +1 qualifier |
| Moderate NPDR | "BDR" otherwise |

4. **Codes:** search the code set and keep codes whose description contains both the edema phrase and the severity phrase.

**FIX for `DM`:**

- Handle negations ("no NVD", "no CSME").
- Choose the ICD-10 7th character for laterality: right, left, or **bilateral** when both eyes match the same tier.
- Don't drop OS codes. The original merges the title to "OU" and stops, losing the OS codes.

**Option `RVO`:** a vein-occlusion term in the vessels field searches "central retinal vein" or "branch retinal vein" with the eye. **FIX:** when CSME is also present, add retinal edema (H35.81); the original never matches it.

**Option `IOL`:** CSME within **90 days** of an IOL surgery in the same eye codes as "Post-cataract CME" (cystoid macular edema search). **FIX:**

- Pick the most recent matching surgery.
- Don't alter the term for later options.

**Any other option:** search "term + option".

**Output:** a map from term to a list of candidate items, each with:

- title (term with first letter capitalised + eye),
- location,
- code, code type, description,
- code text "TYPE:CODE (description)",
- a back-link.

### 10.4 Impression list items

Each item (EB:1312-1484) shows:

- an **editable title**,
- an **editable code** (click to open the code finder; with no code it shows a "Code" search prompt),
- a **plan** text area,
- a **delete X**.

Items are ordered by drag. Their numbers are 1-based.

**Item types:**

| Kind | Origin |
|---|---|
| Free | typed in "New Dx" |
| Finding | from the engine |
| Issue | from PMSFH |

**"New Dx" box** (EB:4286-4330), on leaving it or pressing Tab:

- The first line becomes the title.
- A trailing "ICD…" token on that line becomes the code.
- Later lines become the plan.
- The box is cleared.
- Text shorter than 2 characters is ignored.
- **FIX:** set the code type when a code is parsed. The original leaves it empty, so typed codes are never billed.

**Editing rules:**

- Title, code and plan each save on change.
- For an issue-linked item, editing the title also renames the issue in the editor.
  - **FIX:** actually save the issue rename, or don't propagate it at all. The original loads the rename into the editor without saving.
- Editing a code must refresh its description and code text. **FIX:** the original leaves them stale.

### 10.5 Saving

Original behavior (save:423-440; EB:1517-1545): the client sends the whole ordered list. The server deletes all of this exam's items and re-inserts them with order = position, then returns the stored list. Exact duplicates (same title and first 20 characters of the plan) are silently dropped by a unique key.

**FIX:**

- Save by item id: insert, update, reorder, delete.
- Warn about a duplicate instead of dropping it silently.

### 10.6 Next-visit orders and RTC

**Orders** (view:3942-4024; save:850-866):

- A checkbox list from the provider's `Eye_todo_done_<providerId>` list, seeded from `Eye_todo_done_defaults` on first view.
- Plus a free-text plan box.
- Each checked order is stored as one row: details, priority = position, status "pending", date placed = visit date, placed by = provider.
- **These become the next visit's "Plan" / to-do** in the patient banner (EMF:85-90, 134-142).

**FIX for orders:**

- Clear and re-insert orders **per exam**. The original clears per patient + provider + date, so it can wipe another same-day exam's orders.
- Handle "no orders checked" without error.

**Return to clinic:** there is no dedicated RTC control in the original. RTC is entered as a free-text plan or as an order item. **(parity)**

---

## 11. Coding panel

### 11.1 Visit code suggestion

**Code family** (EB:36, 1646-1660): always the eye-visit family (920xx). The general E&M branch exists in the original but is unreachable.

**New vs established** (view:240-246; EB:1649):

- Original: "New" when the patient has fewer than two eye exams ever (from any provider, including future-dated exams); otherwise "Established".
- **FIX:** established = a professional service by the same provider or same-specialty group within the past 3 years (date-bounded, prior visits only). Compare an internal flag, not a translated word.

**Level:** "comprehensive" requires **both** of the following; otherwise "intermediate":

| Requirement | Original test |
|---|---|
| History | more than 3 HPI element boxes filled (across all three tabs), **or** more than 2 CHRONIC boxes filled |
| Exam | dilation documented (risks box or any drug checked) **and** periphery filled for at least one eye |

**Resulting codes:**

| | Comprehensive | Intermediate |
|---|---|---|
| New | 92004 | 92002 |
| Established | 92014 | 92012 |

**Labels:** the panel shows "Limited/Detailed HPI" and "Detailed exam" indicators that turn red when their criteria are met. The modifier and HPI tooltips teach these thresholds.

**When the suggestion recalculates:** on load, on leaving HPI or CHRONIC boxes, on dilation changes. **FIX:** also on periphery changes.

**Do not replicate; fix as:**

- **Invalid codes.** The original's general E&M branch would emit 99002 / 99003 / 99012 / 99013 (EB:1648-1658). 99003 and 99013 don't exist, 99002 is a specimen-handling code, and 99012 doesn't exist. If general E&M is ever offered, use a validated table: new 99202–99205, established 99212–99215, chosen by medical decision-making or total time under the 2021+ office E&M rules. Never build codes by string concatenation.
- **Wrong rule set.** The original applies the 1995/97 "extended HPI = 4 elements or 3 chronic conditions" rule, plus a "dilation + periphery" proxy, to 920xx eye codes. Eye codes are defined by service content (intermediate = evaluation of a new or existing condition; comprehensive = a general evaluation of the complete visual system that includes initiation of diagnostic and treatment programs). Present the suggestion as **advisory**, show the documented elements that support it, and let the provider choose. Do not label it "Detailed".
- The suggested code must exist in the fee-sheet options. If it doesn't, show a warning rather than throwing an error.

### 11.2 Modifiers and justifiers

**Visit modifiers** (view:3800-3803; EB:4362-4374): toggle buttons **22, 24, 25, 57**, each with an explanatory tooltip. On is red, off is navy. They are joined with ":" for the fee sheet.

**Visit justifiers** (EB:1352-1393, 4397-4410): one numbered toggle per coded impression item, all on by default.

### 11.3 Tests performed

**List** (view:3833-3895; EB:2269-2281, 4411-4427, 1422-1441, 1736-1741): checkboxes from the provider's orders list (`Eye_todo_done_<providerId>`, seeded from `Eye_todo_done_defaults`; LISTS.md), showing only rows that carry a code. Each shows the description and "(code)".

**A test is pre-checked** if its code is in the exam's stored "tests performed" value.

**Checking a test:**

- reveals its modifier box, pre-filled **59**,
- reveals its justifier toggles.

**Turning on a test justifier** (original):

- turns **off** the visit justifier with the same number,
- turns **on** visit modifier 25.

**FIX:**

- No forced 59 (suggest it only when NCCI requires it).
- Don't auto-toggle the visit's justifiers or modifier 25; surface those as suggestions.
- Allow up to 4 justifiers per test. The original keeps only the last one.
- Actually persist "tests performed": the original builds the value and then excludes it from the save (save:868-875 vs 1005).

### 11.4 Sending to the fee sheet

**Buttons** (EB:1552-1579, 1664-1754; save:761-793): **Populate Fee Sheet**, then **Open Fee Sheet**.

**Payload:**

1. Diagnosis codes from coded impression items. Comma-joined finding codes are expanded; placeholder "Code" items are skipped.
2. The visit code, with its modifiers and justifiers.
3. 92060, if triggered.
4. Checked tests, each with its modifier and justifier.

**Original server behavior:**

- **Deletes every billing line of the encounter**, including lines from other forms and already-billed lines.
- Re-adds the payload lines, skipping duplicates.
- Looks up price and units by code alone, at the patient's price level.

**FIX:**

- Add or update only lines this exam owns; never touch billed lines or other forms' lines.
- Filter the code lookup by code type.
- Apply each code's default modifier.
- Require a billing permission.

### 11.5 Appointment status

**Radios** (view:3910-3914; EB:2146-2168; save:806-827):

| Radio | Meaning |
|---|---|
| ">" | Checked Out |
| "$" | Coding complete |
| "}" | Send Notes |

**Changing one:**

- adds a new step to the patient's flow-board record for the visit date,
- sets the calendar appointment's status,
- clears the room.

**FIX:**

- Use the session patient, never a posted one.
- Record the user's name, not a 0/1 flag.
- Handle a missing flow-board row.

---

## 12. Spectacle and contact lens Rx printing

### 12.1 Entry points

- Print icons on W (each slot), MR, CR, AR and CTL open the Rx page for that source (EB `doscript`; SRx:123-265).
- A list icon opens the patient's **dispensed history** (SRx:267-671).

### 12.2 Values per source

| Source | Values | Default Rx type |
|---|---|---|
| W (current glasses #n) | that slot's sphere, cylinder, axis, mid ADD, ADD, comments, prism, PDs, slab-off, vertex, lens material, lens treatments | the slot's stored type |
| MR | MR sphere, cylinder, axis, prism, ADD | Bifocal |
| AR | AR sphere, cylinder, axis, prism, ADD | Bifocal |
| CR | CR sphere, cylinder, axis, prism (no ADD) | none |
| CTL | CTL sphere, cylinder, axis, base curve, diameter, ADD, VA; brand, manufacturer, supplier per eye | n/a |

**FIX for sources:**

- Each source's comments come from its own comments field. The original uses the cycloplegic comments for AR and MR, and a non-existent column for CTL.
- Brand and supplier resolve through their own lists. The original resolves all three through the manufacturer list.

**PD:** from the measured PD in Additional Data.

- Binocular distance PD = OD + OS. **FIX:** use a decimal sum; the original truncates to an integer.

### 12.3 Expiry

| Rx | Expires |
|---|---|
| Spectacles | exam date + 1 year |
| Contact lens | exam date + 6 months |

Source: SRx:32-33, 893-902. The expiry date is shown on the Rx and in the history.

### 12.4 Print page

Layout (SRx:890-1288):

1. **Header:** practice header (logo, facility name, address, phone, fax) and patient block (name, DOB, generated-on date, visit date, provider).
2. **"Expiration Date".**
3. **Spectacle table:**
   - Distance OD/OS: sphere, cylinder, axis.
   - Rx type: Single, Bifocal, Trifocal, Progressive.
   - Mid and Near ADD, OD/OS.
   - Comments.
   - A transpose icon (§8.7).
4. **Fitting data** (collapsed when empty):
   - Horizontal and vertical prism and base, slab-off, vertex distance, per eye.
   - Monocular PD distance and near, per eye; binocular PD distance and near.
   - Lens material select.
   - Lens treatment checkboxes.
5. **Contact lens table:** right lens, then left lens. Each has brand (with manufacturer), sphere, cylinder, axis, base curve, diameter, ADD (only if either eye has an ADD), quantity. Comments.
6. **Signature:** the provider's signature image if one is on file (otherwise a signature line), "Provider: name, suffix", and an "e-signed" indicator.
7. **Print button.** It is hidden on paper, and printing is audit-logged.

**Normalization on this page:**

- Same field formatting as §8.7.
- Entering OD ADD, mid ADD or CTL ADD copies it to OS.

**FIX for the print page:**

- The signature must be the **encounter provider's**, not the logged-in user's.
- Show "e-signed" only when actually signed.
- Edits made on this page (transpose, CTL values, lens treatments) must be saved to the dispense record. The original disables or misnames those inputs, so the edits are lost.

### 12.5 Dispense record

**When written** (SRx:241-264; DB:12957-13020): a dispense row is created **each time** the Rx page is opened for a source. It stores:

- print date and the exam date (`REFDATE`, the base for expiry);
- source (`REFTYPE`: W, AR, MR, CR or CTL) and Rx type;
- spectacle values (sphere, cylinder, axis, mid ADD, ADD);
- prism and base, slab-off, vertex, PDs;
- lens material and treatments;
- CTL manufacturer, supplier, brand, quantity, base curve, diameter per eye;
- comments.

Columns are listed in FIELDS.md.

**FIX for the dispense record:**

- Create the record on **Print**, not on open; or create it on open and de-duplicate within the session.
- Store ADD and mid ADD for AR, MR and CR (the original never stores them).
- Store prism (the table has no prism columns; add them).
- Keep the print date; the original resets it on every field change.

### 12.6 Dispensed history

Original (SRx:267-671):

- Every dispense row for the patient, newest first.
- Each row shows: print date, visit date, expiry, method ("Duplicate Rx -- unchanged from current Rx" for W; Cycloplegic (Wet), Manifest (Dry), Auto-Refraction, Contact Lens), the Rx values, comments, and a delete X.
- Empty history shows "There are no Glasses or Contact Lens Prescriptions on file".

**FIX:**

- Delete must work; it is unreachable in the original.
- Show prism.
- Escape every value.

---

## 13. Report view

### 13.1 Modes

| Mode | Where | Content |
|---|---|---|
| Embedded | encounter summary / visit history (OpenEMR host) | full narrative, no practice header |
| Report PDF | File > Save Report as PDF | practice header + full narrative |
| Fax | fax to PCP or referrer | practice header + **short form**: omits chronic problems, PMSFH and refraction tables |
| Text | "just HPI and A/P" | intended: HPI and Impression/Plan only |
| Draw | hover in visit history | drawings only |

Sources: report:54-197, 226-296.

**FIX for modes:**

- **Fax resend** must use the short form; the original resends the full report.
- **Text mode** must show only HPI and Impression/Plan. The original still prints External, Anterior Segment, Neuro, Retina and the cover test.
- The mode selector must actually be readable; the original reads it under a different case and never sees it.
- **Draw mode** must show still images, not live editors.

### 13.2 Narrative order and rules

1. **HPI block** (report:299-506):
   - "Chief Complaint:" CC1 and "HPI:" HPI1, always printed.
   - Each HPI element (Timing, Context, Severity, Modifying, Associated, Location, Quality, Duration) printed only if filled, as an italic label plus text.
   - Complaints 2 and 3 only if their CC is filled.
   - **"Chronic or Inactive Problems"** if CHRONIC1 is filled (not in fax).
   - The patient photo on the right.
2. **PMSFH** (not in fax) (report:515-518; EMF:2630-2927):
   - Four balanced columns: POH, Eye Surgery, PMH, Medication, Surgery, Allergy, Social, FH, ROS.
   - Empty sections show "None"; empty Allergy shows "NKDA"; empty FH and ROS show "Negative".
3. **Exam summary strip** (report:552-999):
   - **Visual Acuities:** OD and OS columns. A row prints only if either eye has a value. Row order: sc, cc, AR, MR, CR, PH, CTL, near sc, near cc, AR near, MR near, PAM, Glare, Contrast, binocular.
   - **Intraocular Pressures:** App, Tpn and FTN rows, each only if present, plus "@ time". **FIX:** print the time only when there is an IOP.
   - **Fields:** if no quadrant is flagged, "Full to CF OU"; otherwise two 2×2 quadrant grids. **FIX:** print "not tested" when the fields box is empty. The original reports untested fields as full.
   - **Motility:** "D&V Full OU" when Normal is checked; otherwise two 3×3 grids over the muscle background, showing the counters. **FIX:** print the OS bottom row correctly; the original prints one oblique twice and drops another.
   - **Pupils:** "Round and Reactive" when Normal is checked and sizes are blank. Otherwise a table per eye: size "X → Y", reactivity, APD.
4. **Dim pupils and Amsler** (report:1002-1085): only when any dim value, pupil comment or Amsler value exists. The Amsler image plus "n/5" per eye.
5. **Refractive states table** (not in fax) (report:1087-1331):
   - Columns: Eye, Sph, Cyl, Axis, Prism, Acuity, Mid, ADD, Near acuity. An empty cell shows "-".
   - Row groups in order: **Current Rx #1…n** (with type Bifocal/Trifocal/Progressive and comments); **Auto Refraction**; refraction comments; **Manifest (Dry)**; **Cycloplegic (Wet)**; **Contact Lens** (its own columns: BC, Diam; then "Brand / by manufacturer / via supplier").
   - **FIX:** show a group when *any* of its values is present. The original requires a sphere, so a cylinder-only refraction never prints.
6. **Additional data points** (report:1335-1407): when any is present. Grid 1: PH, PAM, LI, BAT, K1, K2, Axis. Grid 2: AxLength, ACD, PD, LT, W2W, ECL.
7. **External exam** (report:1420-1503):
   - Always printed: three columns (right value right-aligned | structure label bold and centered | left value).
   - Rows: Brow, Upper Lids, Lower Lids, Medial Canthi; Adnexa if present.
   - Comments, and the External drawing on the right.
8. **Anterior segment** (report:1507-1660): when any core field is present. Rows: Conj, Cornea, A/C, Lens, Iris; then Gonioscopy, Pachymetry, Schirmer I, Schirmer II, TBUT if present. Comments, drawing.
9. **Additional findings** (report:1671-1969):
   - "Orthophoric" next to the heading when the cover test and motility are both normal.
   - Rows: Levator function, MRD, vertical fissure, carotid, temporal artery, CN V, CN VII, Hertel (OD – base – OS), each **only if present**.
   - Neuro block: color, red desaturation, coins, NPA, NPC, accommodation, amplitudes, stereopsis.
   - Neuro drawing.
   - **FIX:**
     - MRD and vertical fissure must also print only when present (the original always prints them).
     - NPC never prints in the original.
     - Fusional-amplitude-only data shows a heading with no rows in the original; print the rows.
10. **Retina** (report:1975-2104):
    - When any retina field is present, for either eye. **FIX:** the original's test is mostly OD-only.
    - "Dilation Time"; Disc, Cup, Macula, Vessels, Vitreous, Periphery, Central Macular Thickness; comments; drawing.
11. **Alternate cover test** (report:2111-2348): only when not marked Ortho. Up to four grids (sc/cc × distance/near), each only if its primary cell is filled. Each grid is laid out R / cells / L with tilt cells.
    - **FIX:** print neuro comments regardless of cover-test state; the original drops them when Ortho is checked.
12. **Impression/Plan** (report:2357-2469):
    - Numbered items with a bold title, then the code text, then the plan (line breaks kept).
    - "Orders/Next Visit:" lists the orders.
    - On the right: the Impression/Plan drawing, the provider signature image, "electronically signed on <date>", and the provider name.
    - **FIX:**
      - Show the signature block even when there are no items.
      - Use the actual signing date, not today's date.
      - Show the code when there is no code text.
      - Print the "Orders" heading only when there are orders.

### 13.3 Header (PDF and fax)

Three columns (EMF:4234-4310):

| Column | Content |
|---|---|
| Left | practice logo |
| Center | facility name, address, phone, fax |
| Right | patient name, DOB, "Generated on", visit date, provider |

### 13.4 Drawings in the report

Shown for External, Anterior Segment, Neuro, Retina and Impression/Plan (report:2472-2536).

- Any **document notes** attached to the drawing print above it ("Note #, Date, text").
- The image is 220×120.
- No drawing means nothing is shown (no base image).
- **FIX:** look up the drawing by exact keys and escape the notes.

### 13.5 Value formatting

Values print exactly as stored: no numeric reformatting at report time (EMF:6322-6664). Normalization happens at entry time (§8.7). **(parity)**

**All free text must be escaped.** The original prints HPI1, CHRONIC2/3, plan text, code text, order details and drawing notes raw (§17).

---

## 14. Taskman: report PDF and fax

### 14.1 What the user sees

**Communication Engine pane** (view:4100-4176; save:443-524). For each of **PCP** and **Referring provider**:

- a selectable provider (from the address book / users),
- phones, address, fax.

**Changing a selection** updates the patient's PCP or referrer and refreshes the block. **FIX:** update only the one that changed; the original blanks the other.

**The fax control**, shown only when the recipient has a fax number:

| State | Shows |
|---|---|
| Not sent | fax number with a fax icon; clicking queues a fax |
| Sent | fax number as text, a PDF icon (opens the sent document), and a resend icon |

**File > Save Report as PDF** queues a "Report" task.

### 14.2 Task lifecycle

Original (TMF:29-139; taskman:84-113):

- A task records from-provider, to-provider, patient, encounter, type (Fax, Fax-resend or Report), the generated document, request time, completed flag and time, and a short comment log.
- **Duplicate rule:** a click within 60 seconds of an existing identical task returns its status:
  - "This fax has already been sent." with a PDF link, or
  - "Currently working on making this document…".
- **Processing is synchronous on the click.** The page generates the PDF, stores it, delivers it if it is a fax, marks the task completed, and returns the HTML that replaces the fax control.

**FIX for the lifecycle:**

- Don't silently re-fax after 60 seconds. The original's "document missing" test is always true, so any click after 60 s regenerates and resends. Require an explicit **Resend** with confirmation.
- Mark a task failed (and show it) when delivery fails. The original marks it completed regardless.
- Run delivery in a background queue that actually processes all pending tasks. The original's cron mode can never match a task.
- Return one well-formed response per request.
- Check permissions and CSRF; validate that the recipient is an address-book or user record.

### 14.3 Document

**Fax** (TMF:242-571):

- **Category:** Communication.
- **File name:** `Fax_<encounter>_<recipient surname>.pdf` (numbered if it exists).
- **Cover page:**
  - the practice header;
  - From: name, address, phone, fax;
  - To: name, address, phone, fax;
  - Comments: "Report of visit: <patient> on <visit date>".
  - Then a page break with numbering restarting at 1.
- **Body:** the fax short form (§13.1).
- **Footer on every page except the cover:** "Created <date> — Page N of M — Medical Report: <patient> — HIPAA-protected — <facility>".

**Report:**

- **Category:** Encounters.
- **File name:** `Report_<encounter>.pdf`, **one per encounter**: an existing one is replaced.
- Same footer.

**FIX for documents:**

- Use the facility fax on the cover "From"; the original uses the provider's personal fax.
- Don't print the practice header twice.
- Look up categories by stable id. The original looks up "Encounters" by name, and that name doesn't exist.

### 14.4 Delivery

Original (TMF:181-224):

- **Email-to-fax.** An email goes to `<recipient fax digits>@<gateway domain>`.
- The subject is the sending facility's fax number; the body is empty; the PDF is attached.
- No facility fax → the request aborts with no response.

**FIX:**

- Put delivery behind an adapter (email-gateway, HylaFax, Direct, fax API).
- Show the user a clear error when configuration is missing.
- Note the HIPAA caveat in admin settings.

---

## 15. Locking, autosave, status, documents

### 15.1 Exam lock

**Model** (view:122-155; EB:142-263, 346-365, 1759-1867; save:279-331):

- Each open page gets a random session token.
- The exam's lock record holds: locked flag, holder token, lock time.

**On open:**

| State | Behavior |
|---|---|
| Unlocked | take the lock |
| Locked by someone else, **lock older than 1 hour** | take it silently |
| Locked by someone else, recent | ask "OK to take ownership, or CANCEL for READ-ONLY" |

**Read-only mode:**

- Every input, select, text area and link is disabled.
- The flag reads "READ-ONLY".
- Every **15 seconds** the page fetches the current values. Changed fields update and turn the "copied" color. Motility, fields, Amsler and VA copies are redrawn.

**Lock-flag toggle:**

- **Active → read-only:** release the lock.
- **Read-only → active:** take the lock.

**Losing the lock** (another user took over): the next save is refused. The page alerts "Another user has taken control of this form. Entering READ-ONLY mode." and starts polling.

**FIX — build instead:**

- Enforce the lock **on the server**:
  - Only the holder can save, release or extend it.
  - Takeover is an explicit, audited action, and it notifies the previous holder.
- Keep the lock alive with a heartbeat; expire it 15 minutes (configurable) after the last heartbeat. Don't base expiry on the date alone: the original drops the time of day, so any same-day lock counts as stale after 01:00.
- Release the lock on page hide or unload (the original's unload hook never fires).
- Read-only clients must never post. That includes drawings and issue edits; the original's read-only guard never works.
- Refresh Impression/Plan in read-only polling (the original doesn't).

### 15.2 Autosave

Original (EB:114-135, 4255-4271; save:835-1138):

- **No timer.** Any change to any input or text area marks the field "changed" (light blue) and **saves the whole exam**. Exempt are the builder's include checkboxes and modifier fields.
- Explicit saves also follow quick picks, defaults, copies, motility, Amsler, fields, shorthand and closing a glasses slot.
- **The save response** carries:
  - the impression items,
  - the engine findings,
  - both PMSFH panels,
  - the PMSFH data,
  - the coding lines.

  The page redraws the PMSFH panels, the impression list, CHRONIC and the builder from it.
- **Save rules** (server):
  - IOP time is filled if empty.
  - Unchecked checkboxes are saved as 0 (Ortho as "off").
  - Checking a dilation drug sets the post-dilation IOP time.
  - Wearing slots 1–5 are saved, renumbered so they are contiguous; removed slots are deleted.
  - Orders are rewritten.

**FIX — build instead:**

- Debounce (about 800 ms) and send **only changed fields**. The original posts the whole form and blanks any column missing from the post.
- Verify that the exam belongs to the session patient and that the user holds the lock.
- Never re-stamp the patient id on update.
- Write only whitelisted columns.
- Require CSRF and ACL.
- Show a quiet "Saved / Saving… / Not saved — retry" indicator. The original has none, and no leave-page warning.

### 15.3 Encounter provider

When the encounter has no provider, it falls back to the calendar appointment's provider, then the patient's PCP (EMF:6088-6114). **FIX:** compute this without writing it back. The original overwrites the encounter provider *and the patient's PCP* on read.

### 15.4 Documents and image categories

**Sources** (EMF:3768-3905; DB:313-334).

**Per-zone document links** in External, Anterior Segment and Retina:

- For each document category tied to that zone: the category name, an upload icon, a notes icon, and a view icon (opens the latest document).
- Zone mapping comes from each category's zone value:

| Zone | Example categories |
|---|---|
| EXT | external photos |
| ANTSEG | anterior-segment photos, topography |
| POSTSEG | fundus, OCT, FA/ICG |
| NEURO | visual fields |

  The exact category list is in the original seed (DB:313-334).
- Categories with no zone go under OTHER.

**Other documents:**

| Item | Category |
|---|---|
| Drawings | "Drawings - Eye" |
| Report PDF | "Encounters - Eye" |
| Fax | "Communication" |
| Patient photo | "Patient Photograph" |
| Flow sheet VF / OCT links | "VF" and "OCT" (names with " - Eye" stripped) |

**FIX:**

- "Latest" means by date, not by insertion order.
- Check document ACLs.

---

## 16. Keyboard, tab order, tooltips, other hidden behaviors

### 16.1 Keyboard shortcuts

**Intended** (EB:1914-1946; EMF:3970-3978):

| Keys | Action |
|---|---|
| Ctrl/Cmd + T | Text mode |
| Ctrl/Cmd + D | Draw mode |
| Ctrl/Cmd + P | Priors (previous visit) |
| Ctrl/Cmd + B | Quick Picks |
| Ctrl/Cmd + K | Shorthand box |

**Original reality:** none of these ever bind. The script declares its own `shortcut` as a `Set`, which shadows the shortcut library, so each "add" only stores the key name. The browser's own Ctrl+T (new tab), Ctrl+D (bookmark) and Ctrl+P (print) fire instead.

**FIX:** bind these to the same actions, but use **Alt + T/D/P/B/K** (or a command palette), so they don't fight browser shortcuts. Show them in the menu.

**Other key behavior:**

- Backspace outside an editable field is blocked from navigating back (EB:1947-1961). **(parity)**
- In the shorthand box, Enter and Tab submit (§2.1).
- In "New Dx", Tab commits the entry (§10.4).

### 16.2 Tab order

Positive tab indexes come first, then the rest in document order (view and EMF:6148-6322):

1. CC
2. HPI
3. CHRONIC1–3
4. HPI elements
5. SC VA OD/OS
6. CC VA
7. PH VA
8. alternate VA grid
9. IOP AP OD/OS
10. IOP TP OD/OS
11. Amsler Normal
12. Wearing Rx #1
13. Shorthand box
14. MR, then CR, then AR, then CTL, then Additional, then VAX
15. Wearing Rx #2–#5
16. Everything without an index (exam sections, finger tension, pupils, impression)

Within each refraction block the order is OD sphere → cylinder → axis, then OS, then ADDs, then VA, then comments.

**FIX:** give the exam sections an explicit logical order. The original leaves them out of the indexed sequence, and IMP sits last. Avoid the duplicate indexes found in some original blocks.

### 16.3 Tooltips that teach

- Every control with a title gets a styled tooltip. Tooltips can be switched off globally, and the choice is remembered.
- **Field code labels:** with the shorthand box open, every field shows its code. That is the main way users learn shorthand.
- Teaching tooltips:
  - the HPI and CHRONIC threshold text (§1.3);
  - the modifier tooltips (22/24/25/57);
  - the "Detailed HPI / exam" indicators;
  - the long names for every additional-data abbreviation;
  - the copy icon, which explains that updated fields turn purple;
  - the close icon on a refraction panel, which explains that closing makes it a preference to stay closed.

### 16.4 Field colors

The color is the only state indicator (EB:2492, 4439-4441).

| Color | Meaning |
|---|---|
| Cornsilk | untouched (initial) |
| Yellow | has focus |
| Beige | filled by defaults (replaceable by quick picks) |
| Light blue | changed this session |
| Purple | copied forward, or updated by another user (read-only refresh) |
| Red | IOP above threshold |

**FIX:** add a non-color cue as well (an icon or underline), for accessibility.

### 16.5 Other hidden behaviors

- **Double-click** in any text field opens the host's text-template editor (view:4457-4467). **(parity, optional)**
- **Hover** highlights boxes and previews a refraction tab's on/off state (EB:3308-3373).
- **Dilation time** is stamped from the current time when a drug is checked. **FIX:** use a 12-hour or 24-hour clock consistently; the original prints "14:05 PM".
- **IOP time** is filled at save when empty.
- **CYL sign learning** (§8.7).
- **The eRx dialog** reloads the exam when closed.
- **Help page** sections: Introduction ("Paper vs. EHR", shorthand structure), HPI, PMH, External, Anterior Segment, Retina, Neuro. Each zone has a walk-through and a code table: Clinical Field / Shorthand / Example / resulting text (help:38-1640). **FIX:**
  - honor a `zone` parameter so help opens at the relevant section;
  - correct help examples that use "." where ":" is required (help:128).

---

## 17. Known defects — do not replicate

Each line gives the defect and its fix. Source references are original file:line.

### 17.1 Security and privacy

| # | Defect | Fix |
|---|---|---|
| S1 | **Cross-patient exam load (CVE-2026-27943).** The exam is loaded by form id alone, then the page adopts that form's patient. Its refresh endpoints (PMSFH, flow sheet, page JSON) also serve any patient (view:60-99, 168-177). | Every read requires form.patient = session patient, plus an ACL check. |
| S2 | **No CSRF protection** on save, new, issue editor, Rx page, taskman or any AJAX call. | A CSRF token on every state-changing request. |
| S3 | **No ACL** on save.php or the Rx page: billing, demographics, appointment status, documents. | Per-action ACL (encounters write, billing write, patient-med write, docs). |
| S4 | **Generic POST → column update.** Autosave walks every column of 10 tables and writes `POST[column]`, defaulting missing ones to '' (wipes data on a partial post). It also exposes lock and technician columns, updates by form id only, and re-stamps the patient id (save:977-1020). | A per-field whitelist; only fields that changed; a patient-ownership check; never write pid. |
| S5 | **Rx page by id with no patient check.** Request pid/encounter selects any patient's exam; dispense update and delete act by id; the update reassigns the row to the session patient; `id` doubles as a pid fallback (SRx:34-70, 86-119). | Scope every dispense read and write to the session patient. |
| S6 | **Issue edit and delete by issue id** with no patient scoping (save:542-547, 687-717, 755-759; issue:75-78). | Scope to the patient. |
| S7 | **Appointment status uses a posted pid** (save:806-827). | Use the session patient. |
| S8 | **Lock acquire and unlock unauthenticated**; owner check commented out (save:279-298). | §15.1. |
| S9 | **Wildcard document lookups** (`LIKE %pid_enc…%`) can display or **hard-delete another patient's** drawing or PDF (save:1197-1213, 372-375; EMF:3209-3213; report:2479). | Exact keyed lookups. |
| S10 | **Stored and reflected XSS:** HPI1, CHRONIC2/3, plan and code text, order details, drawing notes, gonio text, QP titles, ROS report text, REFTYPE, provider suffix, address-book fields, color fields (attribute breakout), defaults injected into JS, builder rows built as raw HTML. | Escape all output by context. |
| S11 | **Open redirect** via `view.php?url=` (view:33-36). | Remove. |
| S12 | **new.php overwrites the session patient** from the request (new:26-32). | Use the session patient. |
| S13 | **Fee-sheet push deletes all encounter billing lines**, including billed ones (save:763-790). | §11.4. |
| S14 | **Copy-forward READONLY response returns raw SQL** to the browser (EMF:3696). | Never return SQL. |
| S15 | **Taskman** trusts posted from/to/pid; any user record can receive any chart (taskman:20-37). | Validate the recipient and the patient. |
| S16 | **Script generation writes to the database on GET** with an unvalidated provider id (EB:20, 3428-3463; view:3944-3962). | Seed lists in a controlled, authenticated path. |
| S17 | **Canvas save writes client-controlled data** straight into document storage, with no content validation (save:1222). | Decode, validate PNG, size-limit. |
| S18 | **Debug helper `openImage`** hard-codes a patient and document (EB:1877-1879). | Remove. |

### 17.2 Behavior bugs

| # | Defect | Fix |
|---|---|---|
| B1 | **Keyboard shortcuts never bind**: a `Set` named `shortcut` shadows the shortcut library (EB:1914). | §16.1. |
| B2 | **Shorthand `LCN5` → `LCNVI`** (non-existent; text lost) (SH:278). | Left CN V. |
| B3 | **Shorthand `LH` → `OLHERTEL`** (non-existent) (SH:291). | OS Hertel. |
| B4 | **Shorthand `BC`/`C` used for both conjunctiva and cup**; the cup branch is unreachable (SH:609, 699). | §2.6. |
| B5 | **Shorthand `BCNVII`/`CNVII`/`CN7` writes CN V fields** (`RCNV`/`LCNV`) instead of `RCNVII`/`LCNVII` (SH:543-551). | Write the CN VII fields. |
| B6 | **Unknown shorthand code is appended to the previous field** (colon lost, first word lowercased; persists across batches; crashes when there is no previous field) (SH:78-96). | §2.5. |
| B7 | Other shorthand defects: `BAD` and `RNPC`/`LNPC` write non-existent fields; `FH`/`BB` ignore `.a`; `CUP`, `VF`, `SCH1`, `SCH2` are unhandled; `HERT` crashes on bad input; vocabulary expansion corrupts CC/HPI/IMP/PMSFH/cover-test text; "nas"/"temp"/"lac" swallow spaces; PMSFH shorthand sends the pid as the begin date and carries the allergy reaction across pieces. | §2. |
| B8 | **Invalid E&M codes** 99002/99003/99012/99013 from string-built codes (EB:1648-1658). | A validated code table. |
| B9 | **1995/97 history rules applied to 920xx**; "comprehensive" = dilation + periphery; labelled "Detailed"; new/established by "<2 eye forms ever", including future forms; compares a translated word (EB:1148-1193, 1649; view:240-246). | §11.1. |
| B10 | Tests: modifier forced to 59, forced 25, visit justifiers auto-toggled, one justifier per test; "tests performed" never persisted (EB:2273, 4417-4424, 1736-1741; save:868-875). | §11.3. |
| B11 | **92060 triggered** by stereo plus any single measure (EB:1127-1143). | §9.4. |
| B12 | Lock expiry ignores time of day; lock never released on close; read-only guard never works (`.value` on a jQuery object) (EB:164-168, 116, 4447-4452). | §15.1. |
| B13 | Copy forward: the graphical refresh runs only when the value did *not* change; ODHERTEL missing (EXT); Schirmer keys misspelled; oblique motility omitted; IMPPLAN always replaces (EB:4035-4073; EMF:3313-3456). | §6.4. |
| B14 | Priors include the current and later visits (EMF:52-59). | §6.1. |
| B15 | Findings engine: case-sensitive and regex-unsafe; every non-OD field coded as left eye; `Eye_Coding_Fields` unused; stale code for an untyped fixed code; DM negations ignored; OS codes dropped on the OU merge; no 7th-character laterality; RVO+CSME H35.81 never matches; IOL branch mutates the term (EMF:4332-4708). | §10.3. |
| B16 | IOP targets always 21/21; high-IOP check is a text comparison; flow sheet OS method blank, "null" strings, VF misalignment, inverted current-meds test, broken live update (EMF:6697-6734, 4882-5099; EB:544-604, 2169-2174). | §8.3. |
| B17 | VA history chart cannot render (labels and data as strings) (EMF:5711-5860). | §8.2. |
| B18 | Cylinder "25" → 2.50; axis 90 transposes to 000; transpose doesn't save; broken quarter-step test; VA "="/"j" fix Firefox-only (EB:2680, 2795-2802, 2092-2096, 3378-3384). | §8.7. |
| B19 | Motility oblique values rendered from the wrong variables, swapping data on save (view:3063, 3068). | §9.1. |
| B20 | Contact-lens dropdowns render broken; brand list loop overwrites itself (view:1607-1723). | Render each catalog list properly. |
| B21 | Drawing: touch broken; undo/redo/new save the pre-change image; Blank submits the page; first save has no category; saves on every hover; bypasses the lock (CD:27-41; EB:3965-3987; save:1205-1222). | §5. |
| B22 | Spectacle Rx: `mode` precedence bug makes delete unreachable; RXTYPE overwritten with null; print date reset on every edit; dispense row inserted on every open; AR/MR comments from CR; CTL comments, supplier and brand mis-sourced; ADD for AR/MR/CR and prism never stored; CTL and lens-treatment inputs misnamed; signature is the logged-in user's; e-signed always shown (SRx:86-119, 184-264, 1164-1276). | §12. |
| B23 | Report: Fax-resend prints the full report; Text mode not limited; mode selector case bug; untested fields print "Full to CF OU"; NPC never prints; OS motility row wrong; cylinder-only refractions hidden; OS-only near VA hidden (nonexistent field); MRD/fissure always print; neuro comments lost when Ortho; signature block missing with no IMP items; "signed" date = today (report:50-52, 637, 728-834, 919-921, 1090-1101, 1704-1722, 1898, 2111-2469). | §13. |
| B24 | Taskman: silent re-fax after 60 s; failure marked complete; cron never processes; double JSON; resend uses the long form; empty response with no facility fax (TMF:29-224; taskman:101-113). | §14. |
| B25 | PMSFH: FH update hits all history versions and blanks Psych/Suicide; social dates rendered empty; issue editor always opens in the Eye Meds layout; save skips validation; PMH duplicate match ignores subtype; classification typo; outcome stored as the text "'0'"; eye meds listed twice (save:590-741; issue:987-1135, 1356-1361; EMF:1682-1684). | §7. |
| B26 | `findProvider` writes encounter provider and patient PCP as a read side effect, possibly blanking them (EMF:6088-6114). | §15.3. |
| B27 | Prefs that never stick (`IMPPLAN_RIGHT`, `MR_width`, `HPI_VIEW`, `SDRETINA_VIEW`, `ACT_SHOW`, tooltips translated-word compare); new users get no defaults (EB:322, 2292, 4146; save:97-100). | §1.7. |
| B28 | Orders cleared per patient+provider+date instead of per exam; a missing PLAN crashes the save (PHP 8) (save:850-866). | §10.6. |
| B29 | Impression list saved by delete-all-and-reinsert; duplicates silently dropped; free-typed code has no code type, so it is never billed; title edits on issue-linked items not saved (save:423-440; EB:4286-4330, 1442-1468). | §10. |
| B30 | Text-mode handlers throw ReferenceErrors (undefined `zone`/`zones`); `update_PREFS` referenced without being called; Rx type and dim-pupil auto-show target wrong ids (EB:833, 3846, 3241, 3033-3088; view:1176). | Implement as specified in §1. |
| B31 | Dilation time prints a 24-hour clock with AM/PM (EB:2190-2197). | Use one clock format. |
| B32 | `mode=new` in save.php is broken dead code (quoted column names, wrong variable) (save:333-347). | Creation happens only through §0. |
| B33 | Wearing table form id is a small integer and overflows past 32767 (DB:13140). | Use a full-width id type. |
| B34 | Visible typos: "Additonal Rx", "Manufacter", "Constrast", "Presciptions", "Pyschiatry"; NPA/NPC tooltips empty (missing echo) (view:1283, 1586, 1923, 2996, 3001; SRx:392; EMF:2037). | Correct the text. |

---

*Coverage note.* This spec was assembled from a full read of view.php, save.php, report.php, SpectacleRx.php, a_issue.php, help.php, new.php, taskman.php, php/eye_mag_functions.php, php/taskman_functions.php, js/eye_base.php, js/shorthand_eye.js, js/canvasdraw.js and the layout rules in css/style.css and css/report.css. Line numbers refer to OpenEMR 7.0.4-dev `interface/forms/eye_mag` (unmodified upstream copy) as of 2026-10-06.
