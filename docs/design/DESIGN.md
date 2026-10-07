# Design Direction — v0.2

> **OpenVision**. Status: draft for review.
> Companion files: [`tokens.css`](../../src/lib/styles/tokens.css) (the values) and [`preview.html`](preview.html) (the exam screen rendered with them).

## 1. Who we design for

| User | Where | Input | What they need |
|---|---|---|---|
| **Technician** | Pre-test room, often standing | Tablet, touch, sometimes stylus | Enter VA, auto-refraction, IOP, lensometry fast, no keyboard |
| **Doctor** | Exam room, **lights dimmed** for slit lamp / retinoscopy | Laptop or tablet + keyboard, stylus for drawings | Review tech work, document the exam in shorthand, draw, code, sign |
| **Front desk / optical** | Desk | Mouse + keyboard | Check-in, recalls, Rx printing (v2: optical) |

Hardware ranges from a 10-year-old office PC to a workstation with a GPU. **The base app must feel fast on the weakest machine.**

## 2. Principles (in priority order)

1. **Right patient, right eye.** Safety beats speed beats beauty. Patient identity is always visible; eye laterality is always labelled in words, never by position or color alone.
2. **One keystroke or one tap to anywhere.** Click-heavy section hopping is the #1 complaint against commercial eye EHRs. Every section is one key (`1`–`0`) or one tap away.
3. **Type it once.** Shorthand, defaults, copy-forward, OD→OS copy, and device import exist so nothing gets re-keyed.
4. **Never wait on the app.** Every field saves optimistically; no spinner blocks entry. Target < 100 ms for any interaction feedback.
5. **Dense, not cramped.** Clinical data is compared, not browsed — aligned numbers, minimal chrome, no decorative cards around exam data.
6. **Light by default, smart by choice.** The base install has no AI. Optional features (AI drafting, imaging) declare their cost before download.

## 3. Foundations

### 3.1 Color

Neutral, low-saturation UI so clinical color (findings, alerts) stands out. Full values in `src/lib/styles/tokens.css`.

| Role | Purpose |
|---|---|
| `--surface-0/1/2/3` | Layered backgrounds (page → panel → raised → overlay) |
| `--text-1/2/3` | Primary / secondary / muted text. Only three — rank by color role, not by size |
| `--accent` | Interactive: focus, selection, primary action. One hue only |
| `--od` / `--os` | Eye identity tints (blue-ish / amber-ish). **Always paired with the "OD (R)" / "OS (L)" text label** — color-blind safe pair, never the only signal |
| `--abnormal` | Finding outside normal (e.g. IOP above target). Paired with an icon/marker |
| `--danger` / `--warn` / `--ok` | Alerts, unsaved conflicts, saved state |
| `--hairline` / `--field-border` | Dividers only / input outlines. `--field-border` is >= 3:1 against every surface (WCAG 1.4.11); base.css makes text inputs, selects and text areas use it |
| `--default-bg` `--default-mark` → `--default-tint` | A field still holding the default value: tint plus a **solid** 3px bar on the cell's start edge |
| `--copied-bg` `--copied-mark` → `--copied-tint` | A field copied from a prior visit: tint plus a **dashed** 3px bar. Both bars >= 3:1 against panel and tint in every mode; the accessible name adds "(default)" or "(copied from <date>)" (D54) |
| `--paper-filter` | How drawings are *shown*: `none` in light, `brightness(0.82)` dark, `brightness(0.62)` dim room. Drawings are stored and printed on white |

**Dark mode is a clinical requirement, not a theme.** Doctors work in a dimmed room; a bright white screen ruins dark adaptation and lights up the patient's face. Three modes:

- **Light** — front desk, pre-test.
- **Dark** — default in exam rooms, follows the OS unless overridden.
- **Dim room** — dark mode with reduced luminance (text capped near 75% white, no pure-white surfaces, accent desaturated; muted text `--text-3` is `#858a93` so it still meets AA). The colour-mode switch sits in the patient banner (and on the chart, documents and flow sheet); `Shift+D` (not while typing, no other modifier) turns dim room on and back to the previous mode.

**Never colour alone (D54).** Field states use bar shape (solid / dashed), rail states use mark shape, the flow sheet draws target OD with long dashes and target OS with short dashes (OD round markers, OS square), and legends use the text colours. In Windows high contrast (`forced-colors: active`) the field bars become solid / dashed borders in `CanvasText`, chart lines take system colours, and pencil swatches keep their real colours (they are the choice itself).

### 3.2 Typography

- **Family:** Inter (SIL OFL, self-hosted, Latin subset) with system-ui fallback. Inter has tabular figures and a clear `1/l/I` and `0/O` distinction — essential for `-1.25 +0.50 x 180`.
- **Figures:** `font-variant-numeric: tabular-nums` on all measurements so columns of sphere/cyl/axis/IOP align.
- **Scale (compact / touch):** five named steps, no one-offs. All in **rem** (sizes below are at a 16px default), so they follow the Windows / browser default font size and the per-user **Text size** (100–200%, set as a percentage on `<html>` by the server). Print resets the text size (D53).

| Token | Compact | Touch | Use |
|---|---|---|---|
| `--text-xs` | 11px | 12px | Uppercase field labels, timestamps |
| `--text-sm` | 13px | 14px | **Base** — table cells, inputs, body |
| `--text-md` | 15px | 16px | Section titles, patient name |
| `--text-lg` | 18px | 20px | Key values in focus (current IOP, final Rx) |
| `--text-xl` | 22px | 24px | Rare: empty states, setup screens |

- **Weights:** 400 regular, 600 semibold. Nothing else.
- **Line height:** 1.4 body, 1.2 headings/values, 1.5 prose (HPI, plan) with a 68ch max measure.
- **Signs:** always show `+`/`−` on sphere and cylinder (`+0.00` → `pl` optional setting). Use a real minus `−` (U+2212) in display, accept `-` on input.

### 3.3 Spacing, radius, density

- 4px base grid: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32.
- **Density follows the input device, not the device name:** `@media (pointer: coarse)` switches to the touch scale — rows grow from 1.75rem to 2.75rem (28 → 44px at 100%), targets to ≥ 2.75rem. Space and radius stay in px; what holds text (rows, targets, icons) is in rem and grows with the text. A tablet with a keyboard cover stays touch-sized; a laptop with a touchscreen gets touch targets when a coarse pointer is primary.
- Radius: `--radius-1` 4px (inputs, chips) · `--radius-2` 8px (panels, menus) · `--radius-pill`. Nested radius = outer − padding.
- Elevation: borders (1px hairline) do the work; shadows only for overlays (palette, drawers, menus).

### 3.4 Motion

Two families, after IBM Carbon:

| Family | Use | Duration (enter / exit) | Easing |
|---|---|---|---|
| **Productive** (≈95%) | Hover/focus, field saved tick, section switch, chip select, menu open | 70 / 50 ms (micro) · 150 / 110 ms (small) · 240 / 160 ms (panel, drawer) | `cubic-bezier(.2,0,.38,.9)` standard, enter `(0,0,.38,.9)`, exit `(.2,0,1,.9)` |
| **Expressive** (rare) | Critical alert (wrong-eye conflict, allergy on an Rx, IOP spike vs target), first-run | 400 ms enter, no loop | `cubic-bezier(.4,.14,.3,1)` |

Rules:
- Exits ~30% faster than entrances.
- Keyboard/palette navigation: **no animation on the active row** — highlight moves instantly; motion must never make the app feel behind the typist.
- Stagger lists ≤ 20 ms/item, capped at 120 ms total.
- Interruptible: a drawer reversing mid-open animates from its current position.
- `prefers-reduced-motion: reduce` → opacity-only fades ≤ 100 ms or instant change; meaning is never carried by movement alone. Spinners still communicate (we learned this the hard way — a frozen spinner reads as a hang), so busy states use a text label + subtle opacity pulse rather than rotation-only.

### 3.5 Iconography

Lucide (ISC license), stroke 1.5px, 16px compact / 20px touch. Icons always accompany text in the exam; icon-only buttons need an `aria-label` and a tooltip that is **not** the only explanation.

## 4. Laterality rules (OD/OS)

There is no single published standard, so this is our rule — stated once and applied everywhere:

1. **Side-by-side eye panels and drawings use "doctor view":** OD (right eye) on the **left** of the screen, as when facing the patient.
2. **Refraction/Rx tables:** OD is the **top row**, OS below, OU (near/binocular) last — matches printed Rx convention.
3. **Every OD/OS cell carries a text label** (`OD (R)`, `OS (L)`); the eye tint is a secondary cue.
4. **Laterality is data, not layout.** Each finding stores `eye: od | os | ou`; ICD-10 laterality digits derive from it, never from screen position.
5. **Copy actions are explicit and directional:** `OD → OS`, `OS → OD`, with an undo toast.
6. A user setting may flip panel order (some doctors prefer OD-right). The labels make either safe.

## 5. Core patterns

### 5.1 Patient banner (always visible)

`[photo] Name (preferred) · Age · DOB · MRN | Allergies ⚠ | Visit: Comprehensive · Dr X | saved ✓ | ☾ dim`

- Sticky; no modal or drawer may cover it — overlays render below it.
- Photo strongly preferred (evidence: fewer wrong-patient errors). Initials avatar when absent, with a prompt to add one.
- When a tablet opens a chart in a different room/session than last time, show a one-tap **"Confirm: this is <Name>, DOB …"** before editing.
- Unsaved/conflict state lives here, not in toasts.

### 5.2 Exam layout (tablet landscape / laptop)

```
┌───────────────────────── Patient banner ──────────────────────────┐
├──────┬──────────────────────────────────────────────┬─────────────┤
│ 1 HPI│  Section: Anterior Segment      [Normal] [⇄] │  Priors     │
│ 2 VA │ ┌──────── OD (R) ───────┬──────── OS (L) ────┐│  (drawer,   │
│ 3 Rx │ │ Lids     WNL          │ WNL                ││   P key)    │
│ 4 IOP│ │ Conj     1+ injection │ WNL                ││             │
│ 5 Ext│ │ Cornea   clear        │ trace SPK          ││  2025-09-14 │
│ 6 SLE│ │ ...                   │                    ││  2024-08-02 │
│ 7 DFE│ └───────────────────────┴────────────────────┘│             │
│ 8 Neu│  [Text] [Draw] [Quick-pick]                   │             │
│ 9 A/P│                                               │             │
│ 0 Cod│                                               │             │
├──────┴──────────────────────────────────────────────┴─────────────┤
│ ⌨  bk:trace spk; rc:1+ inj   →  OD Conj = "1+ injection" ✓        │
└───────────────────────────────────────────────────────────────────┘
```

- **Section rail:** numbered, one mark per section with four states from one pure function (`src/lib/exam/rail.ts`, D54): **empty** (ring), **started** (half-filled), **complete** (filled, with a tick: every field that has a practice normal holds a value; sections without normals never show it), **abnormal** (triangle with "!": a text finding that is not the practice normal, or an IOP above target; wins over complete). A **Legend** button under the rail explains them; the tooltip says the key and the state. Collapses to a scrolling strip in portrait.
- **Short screens (D53):** when the viewport is under 32rem high (200% zoom, large text, a small window), `<html data-short>` makes the exam scroll as a whole: banner, rail strip and helper switcher scroll away; only the shorthand bar stays pinned (a rail column beside the exam on a wide window stays).
- **Main panel:** one section at a time *or* "scroll all" mode (eye_mag users like the whole exam on one page — keep it as an option).
- **Priors drawer:** right side, compares the same section across visits, aligned row-for-row with the current exam.
- **Shorthand bar:** bottom, always present when a keyboard is detected; collapsed to a button on touch-only.

### 5.3 Shorthand bar (data entry)

Keeps eye_mag's proven grammar so its users switch with zero retraining: `field:text;` · `r`/`l`/`b` eye prefixes · `.a` append · `D;` load defaults.

- **Live parse preview:** as you type, the target field highlights in the panel and a ghost value appears; `Enter` commits all, `Esc` cancels.
- **Unknown field = visible error chip**, not silently appended to the previous field (eye_mag's current behavior hides typos).
- **Suggestions (D56):** a WAI-ARIA 1.2 combobox. While a code or a finding is typed, up to 8 suggestions open above the box with the long name (`rc` → *Right conjunctiva*). Nothing is preselected, so `Enter` with the list untouched still commits the box; `↑`/`↓` choose, `Enter` or `Tab` accept, `Esc` closes the list and a second `Esc` clears the box. Near misses ("did you mean") fill the list, tagged; recently used codes (this browser) rank first.
- **Help sheet:** `?` (outside a text box), `F1`, the `?` button on the bar, or the desktop Help › Keyboard shortcuts open one dialog listing the keys and every shorthand code (filter box; this section or all). The keys come from `src/lib/exam/shortcuts.ts`, the same module the page's key handler uses; a row's code hint opens it filtered to that row.
- Every commit is one undo step (`Ctrl+Z`).

### 5.4 Command palette (navigation + actions)

`Ctrl/⌘ K`. Separate from the shorthand bar: the palette *does things*, the bar *records findings*.

- Searches sections, actions, patients, prior visits, settings — with synonyms (`pressure` → IOP, `glasses` → Spectacle Rx).
- Every result shows its shortcut, so users graduate to the keys.
- Empty query shows: recent patients, "Copy forward last visit", "Print glasses Rx", "Sign & close".
- Destructive/high-cost commands (sign, delete, send fax) confirm at the palette level; speed never bypasses permission checks.

### 5.5 Refraction keypad (touch)

Techs rarely have a keyboard. A custom keypad replaces the OS keyboard for Rx fields:

- Sphere/cyl: `+` `−` toggle, then 0.25 steps via large `▲ ▼` and a value strip (`−3.00 −2.75 −2.50 …`) you can flick.
- Axis: 1–180 dial or direct digits; `180` and `90` quick keys.
- Validation inline: cyl sign convention (plus/minus cyl setting), axis required when cyl ≠ 0, transposition button.
- Device import (v1: Topcon spec) fills the same fields with a "from AR-xxx 9:41" source chip; the tech confirms.

### 5.6 Drawing

- Canvas over eye templates (external, anterior segment, fundus — OD/OS in doctor view).
- Stylus draws, finger pans/zooms (palm rejection via `pointerType`).
- Stamps for common findings (drusen, hemorrhage, nevus, RD) that can attach a coded finding.
- Stored as vector (SVG/JSON strokes), not JPEG, so priors overlay cleanly.
- **Paper is white.** Drawings are stored and printed on white; dark and dim room only show them dimmer (`--paper-filter`).
- **Pencil palette:** blue, yellow, orange, brown, red, green, black, and white as the eraser. Every colour is >= 3:1 against white *and* the dimmed paper, which is why yellow and orange are deep shades. Each swatch has a name and a tooltip.

### 5.7 Saving & feedback

- Field-level autosave, optimistic; status in the banner: `Saving…` (only after 400 ms) → `Saved 9:42`.
- Offline/conflict: banner turns `--warn`, edits queue locally, never lost.
- Toasts only for undoable actions (`Copied OD → OS · Undo`). Errors stay inline next to the field.
- **The undo message (D55)** pauses while hovered, focused or while the window is hidden; it stays for the user's **Keep undo messages visible for** (10 s, 30 s, until closed). `Ctrl+Z` (outside text) or `Alt+U` (anywhere) undoes; `Alt+Shift+U` moves focus to it, `Esc` there goes back. It moves to the end edge, then the top, rather than cover the focused control. Polite live region always in the page.

### 5.9 Tooltips and explanations (D52)

One action, `use:tip` (`src/lib/components/ui/tooltip.ts`), for every tooltip in the app:

- **Mouse:** shows after 400 ms (at once when moving along a toolbar); the pointer may move onto the tip.
- **Keyboard:** shows at once on `:focus-visible` only (not after a mouse click).
- **Touch / pen:** long-press (500 ms) shows it and swallows the click that follows, so a long-press explains without pressing.
- `Esc` closes the tip only, never the dialog around it. One tip at a time; placed like menus, flipped to stay on screen, RTL aware; inside a `<dialog>` it goes into the top layer.
- The text is also the control's accessible description (`aria-describedby` on a hidden node) unless it repeats the name. No native `title`.
- **Show tooltips** off (per user): no hover or focus popups; long-press and descriptions stay.
- Reduced motion: no fade.
- **Abbreviations:** `<Abbr code="NS">` draws a dotted underline and explains the code from the `glossary` namespace; a control that cannot act uses `aria-disabled` (still focusable) with a tip saying why.
- **Code hints** under a row label ("RC · LC · BC") spell each code out (right / left / both eyes); a click opens the help sheet filtered to the row. Not a Tab stop: `?` reaches the same table.

### 5.10 First-run tour (D52)

Five short steps on the first exam a user opens: shorthand bar, section keys, quick picks, Normal, Sign (a step whose control is missing is skipped). Next / Back / Skip, `Esc` skips, focus returns afterwards. Shown once per user (`tourSeen`, saved when it first shows); My settings › Show the tour again resets it. Never under automation, with `?notour`, with localStorage `openvision.noTour` = `1`, or on a read-only (signed or locked) exam.

### 5.8 AI-ready, AI-optional

- The UI has a slot for **suggested text** (HPI draft, plan draft) rendered as visually distinct "suggestion" content that must be accepted per block; accepted text records its origin.
- With no AI pack installed, the slot is simply absent — no greyed-out upsell.
- Settings → *Optional features* shows the AI pack with honest numbers: download size, RAM/GPU needed, speed on this machine (measured), and what data stays local (all of it).

## 6. Component inventory (v1)

| Component | Notes |
|---|---|
| PatientBanner | sticky, photo, confirm-patient flow, save state, dim toggle |
| SectionRail | numbered, completion state, keyboard 1–0 |
| EyePanel (OD/OS) | doctor-view columns, row labels, Normal + copy actions |
| FindingField | text + quick-pick + modifiers (trace, 1+…4+) |
| RxGrid | sphere/cyl/axis/add/prism/VA, tabular figures, transposition |
| RxKeypad | touch entry for Rx/IOP/VA |
| IOPField | value + method + time, target comparison |
| ShorthandBar | parse preview, error chips, undo |
| CommandPalette | combobox/listbox semantics, shortcuts shown |
| PriorsDrawer | aligned comparison, copy-forward |
| DrawingCanvas | vector strokes, stamps, templates |
| ImpressionPlanBuilder | findings → diagnoses (with laterality) → plan |
| CodingPanel | 920xx vs E/M suggestion with the *reason shown*, refraction 92015/GY handling |
| Toast, InlineError, Drawer, Menu, Dialog | standard; built on an accessible primitive library |

## 7. Accessibility baseline

- WCAG 2.2 AA contrast in all three color modes (dim room included — verify, it's the easy one to fail).
- Visible `:focus-visible` ring (2px `--accent` + 2px offset) everywhere; never removed.
- Combobox semantics for the shorthand suggestions (§5.3); the quick-pick list is a grid with roving focus.
- Hover is enhancement only; every hover action has a tap/keyboard path (§5.9).
- Works at 200% zoom and at Text size 200%; layout reflows rail → top strip below 900px; short screens unpin the chrome (§5.2).
- **Skip links:** "Skip to main content" on every page, "Skip to exam" on the exam. One `<main>` per page; the exam's one `<h1>` is the patient in the banner.
- **Dialogs** return focus to their opener, or a fallback when it is gone (`dialog.ts`).
- Native checkboxes and radios: 24 × 24px target (WCAG 2.5.8). In Arabic, codes and grades such as `+1` sit in `<bdi dir="ltr">`.

### 7.1 Keyboard (D55)

**One Tab stop per composite** (roving tabindex, `roving.ts`); inside it the arrows move, `Home`/`End` jump:

| Composite | Inside |
|---|---|
| Section rail | arrows; the number keys `1`–`0` still jump from anywhere |
| Helper-panel switch, colour-mode switch | arrows |
| Section actions, each eye's Normal / Clear | arrows |
| Quick-pick modifier toolbar | arrows, typeahead |
| Quick-pick list, document lists | grid: arrows, `Home`/`End`, typeahead |

**Menu button** (Download and every drop-down, `menu.ts`): `Enter`, `Space` or `↓` opens on the first item, `↑` on the last; `↑`/`↓` wrap, `Home`/`End`, typing letters; `Esc` closes and returns to the button; `Tab` closes and moves on.

**Exam keys** (one list, `src/lib/exam/shortcuts.ts`, shown by the help sheet): `Alt+K` shorthand bar · `Alt+T` / `Alt+B` / `Alt+P` / `Alt+D` helper panels · `Ctrl+Z` undo (outside text) · `Alt+U` undo anywhere · `Alt+Shift+U` focus the undo message · `Ctrl+P` print · `?` (outside text) or `F1` help · `Shift+D` dim room · `1`–`0` sections (outside text).

## 8. References

1. OpenEMR Eye Exam (eye_mag) — shorthand grammar, single-page exam, drawing. Feature spec only (see license decision).
2. OpenEyes / EyeDraw — section configuration, doodle→diagnosis, read-mode summary (AGPL; study, don't copy).
3. NISTIR 7804 / 7804-1 — EHR usability and safety review checklist; our usability test protocol.
4. JAMA Netw Open (PMC7658731) — patient photo in banner reduces wrong-patient errors.
5. Microsoft/NHS Common User Interface — patient banner and identifier display rules.
6. IBM Carbon motion — productive vs expressive.
7. Superhuman / Linear — command palette that teaches shortcuts; optimistic UI; sub-100 ms targets.
8. ZEISS FORUM Glaucoma Workplace — OD/OS side-by-side + trend + single change alert.
9. Mobbin, Refero, Page Flows — shipped-UI galleries for iPad and dense-table patterns.

## 9. Decisions

Decided 2026-10-06 (full log: [`docs/DECISIONS.md`](../DECISIONS.md)).

| # | Decision | Outcome |
|---|---|---|
| 1 | License | **Apache-2.0, clean-room.** eye_mag is a feature spec only; no eye_mag code or verbatim GPL text enters the repo |
| 2 | Stack | **Svelte + SQLite, single install.** Postgres optional later for larger practices. Accessible primitives: Bits UI / Melt UI |
| 3 | Drawing | Own vector canvas (MIT/Apache-compatible base); not EyeDraw (AGPL) |
| 4 | Panel order | OD-left doctor view, user-flippable |
| 5 | Product name | **OpenVision** (repo `openvision-ehr`) |
