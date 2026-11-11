# v2.2 Figma redesign — continuation handoff

Checkpoint written 2026-11-11, when the Figma build session was interrupted early.

**Status in one line: the Figma file exists and holds the design tokens, but no components and no screens have been built. None of the six screen types is reviewable yet.**

## 1. Branch and commit

- Repository: `jakeybakey77/websiteproject`
- Branch: `feat/v2.2-figma-redesign`
- Base commit before this checkpoint: `0107d0c` ("Record v2.2 design decisions in the redesign brief")
- This checkpoint adds one commit on top of it containing only this file. Run `git log -1` for its SHA.
- No file in `public/`, `server/`, `scripts/`, `tests/` or `data/` has been changed on this branch during the v2.2 work. Railway was not touched.

## 2. Completed vs incomplete

| Item | State |
|---|---|
| Source audit of v2.1 frontend, forms, admin tables, pipelines, scoring | Done (see §4 and `docs/V2_2_DESIGN_BRIEF.md`) |
| Figma connection verified | Done — file creation and Plugin API writes both work |
| Figma file created | Done |
| Pages created (3) | Done, all empty of canvas content |
| Design tokens as Figma variables (44) | Done |
| Text styles (18) and effect styles (4) | Done |
| Foundations documentation frames (swatches, type specimen) | **Not started** |
| Component library | **Not started** — zero components exist |
| Homepage, desktop and mobile | **Not started** |
| Merchant application | **Not started** |
| ISO partner landing page | **Not started** |
| ISO partner application | **Not started** |
| Admin dashboard | **Not started** |
| ISO CRM workspace | **Not started** |
| Screen-to-route map | Done, in `docs/V2_2_DESIGN_BRIEF.md` §1 |
| Proposed UX changes vs unchanged list | Done as a proposal, in the brief §3; not yet drawn |
| Frontend implementation | Not started, and must not start before design approval |

## 3. Figma file

- URL: https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu
- File key: `9NMvRWv48ixyvhT5kuRUJu`
- Name: "Greenwich Credit Partners — v2.2 Redesign"
- Location: drafts of the Figma account's team (`team::1702436162824164275`, Starter tier; the account's seat is "View", which did not block creating or editing the draft through the connector).

Pages:

| Page | Node id | Canvas content |
|---|---|---|
| `00 Design system` | `0:1` | empty |
| `01 Public screens` | `2:2` | empty |
| `02 Admin screens` | `2:3` | empty |

**Frames created: none.** Three pages rather than one per screen was a deliberate choice, because Starter-tier files can be limited to three pages. Use Figma sections inside each page to separate screens.

What exists in the file is local styles and variables only:

- Variable collection `GCP Tokens` (`VariableCollectionId:2:4`), one mode named `Light`.
- Text styles and effect styles listed in §5.

## 4. Source files inspected

Read directly from this branch:

- `docs/V2_2_DESIGN_BRIEF.md`, `VERSION_2_1_NOTES.md`
- `public/index.html`, `public/partners.html`, `public/admin/index.html`, `public/admin/iso.html`
- `public/styles/tokens.css`
- `public/js/config/form-schema.js`, `pipeline.js`, `iso-pipeline.js`
- `public/js/data/demo-identities.js`, `iso-demo-identities.js`, `sample-leads.js`
- `public/js/pages/apply.js`, `partners.js`, `iso-admin.js` (UI strings and structure, not every line)
- `public/samples/iso-partners-sample.csv`
- `server/iso-scoring.mjs` (factor labels and maximums)

Not read in this session: `public/apply.html`, `public/admin/login.html`, `public/js/pages/dashboard.js`, the other CSS files, and the remaining server modules. The brief's audit covers them, but re-read `dashboard.js` and `dashboard.css` before drawing the admin dashboard.

Facts confirmed against source that the designs must respect:

- Merchant form: 4 steps plus review plus confirmation; fields, labels, hints and error messages are in `form-schema.js`. Step 4 is a read-only fictional identity card plus the demo acknowledgement checkbox.
- Partner form: single page; identity is one of five built-in fictional organizations; six fields in `partners.js` (`relationshipType`, `region`, `specializations`, `referralVolume`, `yearsActive`, `demoAcknowledged`).
- Merchant stages (6): New, Needs info, In review, Ready for handoff, Handed off (simulated), Closed. Sources (7).
- ISO stages (11), verification states (4), evidence categories (9), evidence statuses (3), tiers A–D plus Not scored.
- Score factors and maximums: identity 25, relevance 20, contact 20, activity 15, fit 10, traceability 10.
- The current homepage strip and FAQ say no data is stored, which is wrong for v2.1; the footer still says "Demo v1.1". Both are to be corrected in the designs (brief §6, decided item 4).

## 5. Design decisions and tokens

### Decisions made in this session

1. **Typefaces.** Aptos Display is not available in Figma. Styles were built with **Source Serif 4** for display headings, **Inter** for body and UI, and **IBM Plex Mono** for reference codes. All three are open-licensed. This is a proposal that changes the heading face from sans to serif; it is **not yet approved** by the owner (it answers open item 3 in the brief).
2. **Palette.** The v2.1 palette from `tokens.css` is kept unchanged. Added: a control border colour with at least 3:1 contrast on white, on-dark text and border colours, and success / warning / neutral status pairs, which v2.1 lacks.
3. **Radius.** Three steps (6 / 10 / 14) plus pill, replacing the single 14px value.
4. **Spacing.** v2.1 scale kept; 20 and 96 added.
5. **Frame widths.** Mobile 390, tablet 834, desktop 1440; content max width 1200.

Decisions already recorded in the brief (partner landing route `/partner-program.html`, positioning, copy corrections, all routes and APIs preserved) still stand.

### Variables in `GCP Tokens`

Colour (25), all named `color/<group>/<name>`:

| Name | Value | | Name | Value |
|---|---|---|---|---|
| brand/navy | `#14293B` | | text/ink | `#14293B` |
| brand/navy-deep | `#0F3048` | | text/ink-soft | `#536B7F` |
| brand/blue | `#147AA8` | | text/on-dark | `#FFFFFF` |
| brand/blue-dark | `#0E547D` | | text/on-dark-soft | `#B8CBD8` |
| brand/sky | `#2BB3CC` (decorative only; fails text contrast) | | border/rule | `#DCE7EE` |
| brand/pale | `#E5F5F9` | | border/rule-soft | `#ECF3F7` |
| surface/paper | `#F7FBFD` | | border/control | `#7A93A5` |
| surface/sheet | `#FFFFFF` | | border/on-dark | `#2F4A60` |
| surface/subtle | `#ECF3F7` | | status/neutral, neutral-tint | `#536B7F`, `#ECF3F7` |
| status/error, error-tint | `#9A2737`, `#FFF0F1` | | status/success, success-tint | `#1F6B4A`, `#E8F5EE` |
| status/warning, warning-tint | `#8A5A00`, `#FFF4DC` | | | |

Number (19): `space/4, 8, 12, 16, 20, 24, 32, 48, 72, 96` · `radius/sm 6, md 10, lg 14, pill 999` · `layout/page-max 1200, measure 680, breakpoint/mobile 390, breakpoint/tablet 834, breakpoint/desktop 1440`.

The status and control-border colours were chosen for contrast by estimate. Their contrast ratios have **not been measured**; check them before approval.

### Text styles (size / line height)

Display/XL 64/70, Display/L 46/52, Display/M 34/40, Display/S 26/32 (Source Serif 4 SemiBold) · Heading/L 24/32, Heading/M 20/28, Heading/S 16/24 (Inter Semi Bold) · Body/L 18/28, Body/M 16/24, Body/S 14/20, each Regular, plus Body/M Strong and Body/S Strong · Label/M 14/20, Label/S 12/16 (Inter Medium) · Overline 12/16 uppercase, 8% tracking · Numeric/XL 32/36, Numeric/L 24/28 · Mono/S 13/20 (IBM Plex Mono Medium).

### Effect styles

Shadow/SM, Shadow/MD, Shadow/LG, Focus ring (2px white plus 4px `#147AA8`).

## 6. Outstanding tasks, in priority order

1. Component library on `00 Design system`: buttons (primary, secondary, quiet, on-dark; default / hover / focus / disabled; two sizes), form controls (text, currency, select, textarea, radio, checkbox; default / focus / error / disabled, with label, hint and error text), status badges, tier badges, demo strip, public header and footer (desktop and mobile), admin sidebar and mobile top bar, stepper step, identity card, error summary, callouts, KPI card, table cells and rows, filter chip, tabs, modal and side-panel shells, FAQ item, timeline item, checklist row, score factor bar.
2. Homepage, desktop 1440 and mobile 390 (highest-priority screen). Tablet 834 if time allows.
3. Merchant application: step with default state, step with field errors and error summary, review, confirmation; desktop and mobile.
4. ISO partner landing page (new route `/partner-program.html`); desktop and mobile.
5. ISO partner application: form, confirmation; desktop and mobile.
6. Admin dashboard: overview with KPI cards and pipeline, lead table with clickable rows and filters, detail panel; desktop and mobile.
7. ISO CRM: organization list, partner detail (verification checklist, score with override history, contacts, evidence, follow-ups, timeline), CSV import flow, duplicate resolution; desktop and mobile.
8. Foundations documentation frames (colour swatches, type specimen, spacing).
9. Screenshot every screen and fix clipped text and overlaps.
10. Update `docs/V2_2_DESIGN_BRIEF.md`: its header still says no Figma file exists and open item 1 says the connector is not installed. Both are now out of date.
11. Stop and request design approval. No frontend code before that.

## 7. Blockers and validation

Blockers: none technical. The Figma connector works in the Claude session that produced this checkpoint.

**For Codex specifically:** continuing the Figma build needs a Figma connection that can write to file `9NMvRWv48ixyvhT5kuRUJu` under the same Figma account. If Codex has no such connection, it cannot do tasks 1–9 and should say so rather than substitute HTML mockups, which the owner has ruled out (brief §6, decided item 1).

Validation run at this checkpoint:

- `npm test`: 101 passed, 0 failed.
- `git status` before this commit: clean; the application is byte-for-byte the v2.1 code at `0107d0c`.
- Figma: the write call returned 3 pages, 25 colour variables, 19 number variables and 18 text styles. No visual check was made because there is nothing on the canvas.
- `npm run check` was not run.

## 8. Exact next steps

1. Check out `feat/v2.2-figma-redesign` and pull.
2. Confirm Figma write access by reading the page list of file `9NMvRWv48ixyvhT5kuRUJu`; expect the three pages in §3 and the `GCP Tokens` collection.
3. Get the owner's answer on the serif heading face (§5, decision 1) or proceed with it and flag it at review.
4. Build components on page `0:1`, binding fills, strokes, spacing and radii to the `GCP Tokens` variables and using the existing text styles. Do not create a second collection or duplicate styles.
5. Build screens in the order in §6, public screens on page `2:2` and admin screens on page `2:3`, one section per screen, composed from component instances with auto layout.
6. Take copy from the v2.1 source. Do not add funding volumes, approval rates, testimonials, commission figures or lending claims. Keep the demo strip and prototype disclosures on every screen, with the corrected storage wording.
7. Keep every existing field, label, validation message, stage name and scoring caveat ("ranking aid, not a credit score").
8. Record created frame ids and names in this file as each screen is finished.
9. When all six screen types are reviewable, stop for design approval.

Constraints that still apply: work only on this branch; no backend, API, database or business-logic changes; no framework migration; no Railway changes; no paid assets.
