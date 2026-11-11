# GREENWICH CREDIT PARTNERS — v2.2
# MASTER CODEX → FIGMA CONTINUATION DIRECTIVE

**Execution mode:** Continue the existing, partially initialized Figma Design file. **Create editable designs now**; do not stop at planning, coding mockups, or writing more specifications.

**Project:** Greenwich Credit Partners — premium, institutional small-business financing **demonstration prototype**. Preserve this brand.
**Repository:** [jakeybakey77/websiteproject](https://github.com/jakeybakey77/websiteproject)
**Working branch:** `feat/v2.2-figma-redesign` — never commit work to the default branch, `-Copy` branch, or an unrelated branch.
**Existing Figma file:** [Greenwich Credit Partners — v2.2 Redesign](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu)
**Figma file key:** `9NMvRWv48ixyvhT5kuRUJu`
**Authoritative source order:** (1) actual v2.1 code on the named branch, (2) `VERSION_2_1_NOTES.md`, (3) `docs/V2_2_DESIGN_BRIEF.md`, (4) historical checkpoint preserved below. When documents conflict with source, source wins for existing behavior; approved v2.2 decisions govern *proposed visual design and copy*. Read the sources rather than relying on chat history or an old ZIP.

> **Handoff verification, 2026-11-11:** The GitHub repository, correct branch, design brief, and earlier checkpoint were fetched. This Figma file was opened through metadata reads: `00 Design system (0:1)`, `01 Public screens (2:2)`, and `02 Admin screens (2:3)` are present and each page has **zero canvas elements**. The earlier checkpoint reports 44 variables, 18 text styles, and 4 effect styles; these assets are *reported by the prior design session*, not independently re-counted in this handoff. Verify them before use. This handoff is a documentation update **only**; it does not implement Figma screens or change the deployed site.


## Current execution checkpoint — 2026-11-11

### Write access and existing assets

- Source branch HEAD at start: `7275783dc97d8c4b3a6ab480df9a5d64d3e3b97d`. Branch source was read through GitHub because the local workspace is empty and has no Git executable.
- Verified the three original Figma pages (`0:1`, `2:2`, `2:3`), all initially empty. Verified `GCP Tokens` (`VariableCollectionId:2:4`), 25 color variables (`VariableID:2:5`–`2:29`), 19 numeric variables (`VariableID:2:30`–`2:48`), 18 text styles and four effect styles.
- Write access verified by building and independently reading [Actions](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=4-2), [Button](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=4-67) and [Button compact](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=4-68). Both are native auto-layout component sets, with 16 variants each. Confirmed bindings for fills, padding and radii. Remaining: foundations and shared UI, then all six desktop/mobile screen types.

### Foundations and homepage

- [02 Foundations](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=5-2)
- [03 Navigation & disclosures](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=5-144)
- [04 Forms & content](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=5-223)
- [05 Admin shell](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=5-475)
- Component IDs: Demo strip `5:149`, Public header `5:197`, Public footer `5:220`, Skip link `5:221`, Form field `5:334`, Choice control `5:367`, Inline error `5:368`, Error summary `5:371`, Demo callout `5:374`, Identity card `5:377`, Review block `5:380`, Confirmation `5:383`, Process card `5:386`, KPI card `5:389`, Activity item `5:392`, Detail panel `5:395`, Import stepper `5:398`, Score factor `5:401`, Checklist row `5:406`, Table header `5:409`, Filter chip `5:412`, Tab `5:415`, Pipeline bar `5:418`, FAQ item `5:428`, Status badge `5:439`, Stepper step `5:449`, Table row `5:474`, Admin navigation `5:516`.
- Local text style IDs: Display/XL `S:cd8a98fbca5659d3e147f3150854b30ba2e30191,`, Display/L `S:ff4ea1a24280a7bacc3a10a18de897658e73f70c,`, Display/M `S:31e30e11b43277acca5580ad607650c47a718950,`, Display/S `S:1aee8fd721a0d148824266594e02f3d3dc020cce,`, Heading/L `S:c7f3dfe0722cdc62e3fa28123ae98983ede6bcb1,`, Heading/M `S:a9d1ec34e929881b1ceca3ff6d42f590e151d43b,`, Heading/S `S:ae0ae8c5d45ee24a70a766aa4a3cc758b57ab4d6,`, Body/L `S:13686fb92f46891ebdb72a042d67306614023dcd,`, Body/M `S:24d105c0f651e220e71356d08a3b9ba5f30ba145,`, Body/M Strong `S:23de1cafb8a310302b72f600aedab47d2abc1f1f,`, Body/S `S:3d44e2700315dc428c7d0535cc1cbef7c202d54a,`, Body/S Strong `S:74e4c50e21fe7782453a23878208af93b3d6af54,`, Label/M `S:3748b24c72b530fdcdabbaf1437b0761a555d8d4,`, Label/S `S:74625da217332adebfc7d86b6e1fb91716531700,`, Overline `S:156d5faea41f07c05a892c614c723ad974b10bc6,`, Numeric/XL `S:3f246ec2ac185cb9dce6c956b52590c96574ecec,`, Numeric/L `S:37798b4fcf3873be65207de98539e50b17e15cc6,`, Mono/S `S:442a4027aef4890aad103e7a92287c34aeb75fb0,`.
- Local effect style IDs: Shadow/SM `S:2298c3ecac50e60a39e5387330d1ab3fea4a3df8,`, Shadow/MD `S:15845c2280617fdaf0ef65d9f309c3f25194d32c,`, Shadow/LG `S:54723061806156df95cd1649904441e95ba8c8ab,`, Focus ring `S:c6f39e52f8d01351798fc3d09c622277529a2445,`.
- Token contrast measured from Figma: white/blue 4.80:1, white/navy 14.89:1, secondary text/white 5.56:1, control border/white 3.21:1, error/tint 6.98:1, success/tint 5.74:1, warning/tint 5.43:1, dark blue/pale blue 7.26:1.
- Homepage `/`, `/index.html`: [Desktop 1440](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=6-7), [Mobile 390](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=6-128), [Mobile menu](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=6-247). Screenshot-reviewed both sizes and menu. Corrected FAQ toggle wrapping and rechecked both widths. Desktop and mobile retain merchant and ISO paths and the server-storage disclosure. UTM carry-over remains in the future implementation map.
- Remaining: five screen types and supporting admin sign-in.

### Merchant application — `/apply.html`

[Merchant application section](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-119). Native 1440px and 390px frames preserve four steps, conditional financing fields, review and fictional contact restrictions.

| State | Desktop | Mobile |
|---|---|---|
| Step 1 Business | [7:120](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-120) | [7:1050](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1050) |
| Step 2 Revenue | [7:205](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-205) | [7:1121](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1121) |
| Step 2 Error | [7:284](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-284) | [7:1186](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1186) |
| Step 3 No existing financing | [7:368](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-368) | [7:1256](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1256) |
| Step 3 Conditional fields | [7:438](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-438) | [7:1312](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1312) |
| Step 4 Fictional contact | [7:536](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-536) | [7:1396](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1396) |
| Review | [7:603](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-603) | [7:1449](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1449) |
| Submitting | [7:721](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-721) | [7:1553](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1553) |
| Submit failure | [7:839](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-839) | [7:1657](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1657) |
| Confirmation | [7:960](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-960) | [7:1764](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1764) |
| JavaScript disabled | [7:1009](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1009) | [7:1807](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=7-1807) |

Figma rendered each application workspace. Structural audit reported zero horizontal overflow. Remaining: ISO landing, ISO application, merchant admin, ISO CRM and supporting sign-in.

### ISO partner landing — proposed `/partner-program.html`

[Desktop 1440](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=9-986) · [Mobile 390](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=9-1074). Both screenshot-reviewed with zero horizontal overflow. Covers the audience, merchant/partner paths, evidence and human review, storage disclosure, and CTA to `/partners.html`. Remaining: ISO application, merchant admin, ISO CRM and supporting sign-in.

### ISO partner application — `/partners.html`

[ISO partner application section](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1051). Single-page form, read-only fictional profile from the five allowed organizations, native validation states and reference-only receipt.

| State | Desktop | Mobile |
|---|---|---|
| Default | [10:1052](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1052) | [10:1552](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1552) |
| Validation | [10:1159](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1159) | [10:1653](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1653) |
| Submitting | [10:1273](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1273) | [10:1761](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1761) |
| Submit failure | [10:1383](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1383) | [10:1865](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1865) |
| Confirmation | [10:1496](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1496) | [10:1972](https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu?node-id=10-1972) |

Visually checked representative desktop and mobile form/validation/receipt renders. Structural audit reported zero horizontal overflow across all ten frames. Remaining: merchant admin, ISO CRM, supporting sign-in and final verification.

---

## A. YOUR JOB — EXECUTE, DON'T RE-PLAN

1. Load the actual repo and work on `feat/v2.2-figma-redesign`. Read the two existing notes and the relevant v2.1 frontend files before creating the corresponding screens. Preserve all current workflows and real labels.
2. Connect the **same** Figma account and gain access to the **existing** Design file with key `9NMvRWv48ixyvhT5kuRUJu`. Verify tool **write** capability, not merely screenshot/context/read access. Confirm the three pages; read local collection `GCP Tokens` and style inventory before adding anything.
3. **Do not create another Figma file** unless the owner explicitly authorizes replacing the existing file. **Do not recreate tokens/styles** whose identities and values already exist. Continue from the exact pages/nodes below, and keep the existing variables intact.
4. Build actual **editable Figma native components, variant sets, auto-layout frames and instances**, then compose **all six screen types in desktop 1440px and mobile 390px**. Add tablet 834px variants where practical after the desktop/mobile priority is met. Use sections inside the three existing pages; page-count constraints must not trigger new files.
5. Take screenshots or equivalent visual inspections after each composed screen and correct clipping, alignment, truncation, inaccessible contrast and poor responsive layouts. Validate key copy and state variants against source; record real Figma frame/node IDs.
6. Keep updating this document with a **completed/remaining checklist, frame links/IDs and blockers** as work progresses; commit **documentation only** on the correct branch. If the run is interrupted, the next Codex or Claude session must be able to continue **without duplicating created nodes**.
7. Once all six screen types have reviewable desktop and mobile designs, share the Figma file URL, inventory of components/tokens, screen-to-route map, UX changes versus unchanged functionality, outstanding decisions, and QA evidence. **Stop and request design approval. Do not implement the frontend.**

**Nonnegotiable boundaries:** No changes to `public/`, `server/`, `scripts/`, `tests/`, `data/`, APIs, SQLite, business logic, auth, scoring, validation, demo identity restrictions, environment configuration, migrations, Railway, or deployment. No React/Next.js migration. No paid assets without approval. No real merchant data. No real funding/approvals/commissions, claims of being an operational lender or brokerage, manufactured testimonials, funding volumes, rates, terms, or eligibility claims. Do not submit real leads.

**Failure policy:** If Codex lacks Figma write access, *stop design writes* and report the exact permission/tool blocker and the next user action. A read-only MCP, PNG, diagram, HTML mockup, design plan, or generated code **is not an acceptable substitute** for native editable Figma screens. Do not imply a screen is finished until its frame exists in the named Figma file.

## B. STARTUP CHECKS — RUN FIRST

- `git status --short`; `git branch --show-current`; `git fetch origin`; check out `feat/v2.2-figma-redesign` and `git pull --ff-only` when safe. Avoid resetting or discarding uncommitted work. Record `git rev-parse HEAD`.
- Open `docs/V2_2_DESIGN_BRIEF.md` and `VERSION_2_1_NOTES.md`. The design brief's opening text saying that no Figma file exists is **obsolete**; correct it in a documentation-only commit after independently verifying the file.
- Read `public/styles/tokens.css`; `public/index.html`, `public/apply.html`, `public/partners.html`, `public/admin/index.html`, `public/admin/iso.html`, `public/admin/login.html`; `public/js/config/form-schema.js`; `public/js/pages/{landing,apply,partners,dashboard,iso-admin}.js`; the relevant existing CSS and pipeline/scoring enums. Inspect code paths to capture dynamic labels, validation, tables and states rather than guessing from the HTML shells.
- Authenticate the Figma MCP that exposes **writing/editing** of Figma Design documents (via Figma Plugin API or equivalent) for file `9NMvRWv48ixyvhT5kuRUJu`. If only read tools exist, treat it as blocked. Check that you can access and use the exact existing file, not merely a different draft.
- Read Figma pages `0:1`, `2:2`, `2:3`; ensure they are still empty before any first build, otherwise inventory what's already been created. Inventory existing `GCP Tokens`, 18 text styles, 4 effects, and any pre-existing components. Record asset IDs. **Never blindly run node-creation twice.**
- First actual write should create a meaningful, reusable foundation/component on `00 Design system`, not a throwaway test, then read it back to prove the editing API works. Ensure it is editable, auto-layout based, and token-bound before proceeding.

## C. FIGMA FILE LAYOUT — REUSE THESE PAGES

| Existing page | Node ID | What to create inside it |
|---|---|---|
| `00 Design system` | `0:1` | Foundation swatches/specimens, local component sets and documented interaction/validation variants |
| `01 Public screens` | `2:2` | Homepage, merchant application, ISO partner landing page, ISO partner application: desktop and mobile sections |
| `02 Admin screens` | `2:3` | Admin dashboard, ISO CRM: desktop and mobile sections; consider admin login consistency |

Use naming like `01 Homepage / Desktop 1440 / Default`, `01 Homepage / Mobile 390 / Default`, `02 Merchant / Desktop 1440 / Step 2 Error`, `05 Admin / Desktop 1440 / Inquiry Detail`, `06 ISO CRM / Mobile 390 / Verification`. Keep logically separate screen variants and states as actual reviewable frames. Ensure design components are local main components and screens are made using instances; do not flatten to images or detach components by default.

## D. BUILD ORDER AND REQUIRED FRAME COVERAGE

**Milestone 1 — component foundations**
- Color/typography/spacing/radius/width specimens sourced from existing `GCP Tokens`. Use Source Serif 4 (display), Inter (body/UI), and IBM Plex Mono (reference codes) as already established in this Figma draft; the serif direction is **provisional and requires design approval**, not an approved brand redefinition.
- Component sets: public header + mobile menu, admin nav/sidebar/top bar, footer, persistent demo strip, skip link, button variants (primary/secondary/quiet/on-dark, size/state), input/select/currency/textarea/counter, radio/checkbox and groups, inline error and error summary, stepper/progress, fictional identity card, review and confirmation blocks, FAQ, KPI card, pipeline bar, table header/row/cells, filter/search and chips, stage/verification/tier/evidence badges, tabs, checklist row, score-factor meter, modal/side panel, activity timeline, import stepper and callouts.
- Make focus, hover, disabled, error and selected states visibly distinct. Reuse instances in screens, use variable-bound colors/space/radius where supported, apply text styles, and use accessible text contrast.

**Milestone 2 — Homepage (highest priority)**
- `/` and `/index.html`. Desktop 1440 and mobile 390. Public hero, dual CTAs **Get Business Funding** → `/apply.html` and **Become an ISO Partner** → proposed partner-program route, simple 3-step process, financing purposes/categories (not actual product offers), partner recruitment, FAQ, footer, demo disclosure, mobile nav. Preserve UTM carry-over intent in the implementation map. No claim of lending decisions, funding guarantees or approval outcomes.

**Milestone 3 — Merchant application**
- `/apply.html`. Desktop/mobile frames for default steps, validation/error-summary state, review, submitting/failure if relevant, confirmation. **Existing flow is already 4 steps + review + confirmation**; do not invent new form fields or rewrite validation. Use current industry/state/business-age, revenue/request/use/details, existing financing, *read-only fictional contact + required demo acknowledgment* and review content. Preserve conditional controls and navigation.

**Milestone 4 — ISO partner landing**
- New *proposed* design route `/partner-program.html` (not an existing v2.1 route; **do not implement it yet**). Who it is for, merchant vs referral partner distinction, human-review/verification workflow, permissible benefits, demo caveat, CTA to existing `/partners.html`. No invented commissions or promises.

**Milestone 5 — ISO partner application**
- `/partners.html`. Desktop/mobile input, validation and confirmation states. Preserve one-page behavior unless approved otherwise; fictional organization read-only identity selector, relationship type, primary region, specialization(s), monthly referral range, years active, required demo acknowledgment. Respect exact five-identity server restriction.

**Milestone 6 — Merchant admin dashboard**
- `/admin/`. Desktop/mobile KPI, six-stage pipeline, sources, preliminary review flags, filters, synthetic lead table and record detail dialog/sheet, audit/review workflow. **Design clickable merchant table rows** with the same detail action as the small existing Open control; retain a real keyboard-focusable link/button with visible focus. Stage changes remain constrained; needs-info and closed reasons still required. This is a design proposal only—not a JS code change.

**Milestone 7 — ISO CRM**
- `/admin/iso.html`. Desktop/mobile list, filters, 11-stage relationship pipeline, tier A–D plus Not scored, organization detail, four verification states, evidence checklist (9 categories), six-factor score (25/20/20/15/10/10), override rationale/history, fictional contacts, manual follow-ups, activities, CSV import preview/mapping, duplicates review. Preserve the caveat **“ranking aid, not a credit score”**, and that manual status and activities send no outreach. The list already has organization-link/row navigation; do not mischaracterize it.

**Cross-screen:** Include `/admin/login.html` in the shell consistency pass as a supporting design, but it is not a seventh required screen type. Every public screen retains the demo strip and a clear prototype disclosure. Include the real fact that synthetic demo submissions **are stored server-side**. Never reuse stale “Demo v1.1” copy.

## E. DESIGN & ACCESSIBILITY REQUIREMENTS

- Institutional-finance aesthetic: navy/white/paper surfaces, restrained blue, generous hierarchy, minimal clutter, strong dual conversion paths, modern SaaS administrative tables.
- **Already-created collection:** `GCP Tokens` (25 color + 19 numeric variables, Light mode). No second collection. Existing text styles 18, effect styles 4. Existing file palette: `#14293B` navy, `#0F3048` navy deep, `#147AA8` blue, `#0E547D` darker blue, `#2BB3CC` sky (decorative only on white), `#E5F5F9` pale, `#F7FBFD` paper, `#FFFFFF` sheet, `#536B7F` secondary text, `#DCE7EE` rule. Check actual variables for canonical names/values before binding.
- Mobile 390; desktop 1440; optional tablet 834. Content width 1200. Responsive behavior should be modeled with auto layout, appropriate hug/fill rules, tables adapted for narrow screens, and no overflow. Screens must be readable at zoom.
- AA contrast for normal text and meaningful focus indicators; 44px-ish touch targets where feasible; real label/hint/error relationships in the proposed implementation notes; accessible dialog and table row navigation. Measure unverified status/control-border contrast before approval.
- Figma API caution: load fonts before editing text; switch pages asynchronously and only within valid file context; inspect existing assets first; return created node IDs from write calls; use safe retries and verify actual canvas output instead of assuming success. Prefer a few complete, retry-safe construction operations over redundant tool calls.
- Screens must show representative **synthetic** content from the repository; no personal contact information or real merchant records.

## F. ACCEPTANCE CRITERIA — DO NOT MARK COMPLETE EARLY

- [ ] Verified **write** connection to existing Figma file, with no duplicate file
- [ ] Existing `GCP Tokens` and styles inventoried and reused
- [ ] Foundations and actual reusable Figma component/variant library created
- [ ] Homepage desktop + mobile exist, visually checked
- [ ] Merchant intake desktop + mobile, relevant error/review/confirmation states exist
- [ ] ISO partner landing desktop + mobile exist
- [ ] ISO partner application desktop + mobile exist
- [ ] Admin dashboard desktop + mobile, lead detail, filters and clickable-row interaction design exist
- [ ] ISO CRM desktop + mobile, partner detail/score/verification/import/duplicate states exist
- [ ] Every frame visually reviewed for clipped/overlapping content and responsive behavior
- [ ] Complete screen-to-route mapping and unchanged-functionality list documented
- [ ] Frame names/node IDs/Figma URLs and QA results entered into handoff
- [ ] `git diff --name-only` shows documentation changes only; no Railway interaction
- [ ] Stop for design approval; **no application code implementation**

**Final report format:** Figma file URL; branch and head SHA; completed frame checklist with names and deep links; token/component inventory; copy/UX proposals; unchanged app behavior; unresolved design decisions; actual visual QA; tests run or not run; explicit statement that v2.1 production code/deployment remains unchanged.

### Interruption/resume protocol

After each meaningful milestone: (a) save in the same Figma file, (b) read back created node IDs/names, (c) note completed and remaining screens here, (d) commit the **handoff documentation only**. On restart, check for existing nodes first and **continue, not regenerate**. Never claim a file created merely from a returned plan. If Figma tool quotas or Codex limits are reached, preserve the current Figma frames and checkpoint exact remaining tasks; stop cleanly.

---

## G. ORIGINAL CLAUDE CHECKPOINT (PRESERVED AS REFERENCE)

The following is the full original 2026-11-11 Claude/Fable handoff. It documents precise tokens, styles, source audit, and remaining detailed requirements. Its status is a **point-in-time snapshot**, not a new request to create another Figma file.

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
