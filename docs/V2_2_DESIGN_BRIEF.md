# v2.2 redesign — design brief (pre-Figma)

**Status: no Figma file exists yet.** The session that wrote this brief had no Figma connector, so no screens were created. This document holds the parts of the v2.2 deliverable that do not depend on Figma: the source audit, the screen-to-route map, the proposed UX changes, the token and component inventory to build, and the open decisions. It is the input for the Figma work, not a substitute for it.

Nothing in `public/`, `server/`, `scripts/` or `tests/` was changed. All facts below were read from the v2.1 source on this branch.

## 1. Screen-to-route map

| # | Screen | Route | Markup | Script | Styles | Data it talks to |
|---|---|---|---|---|---|---|
| 1 | Homepage | `/`, `/index.html` | `public/index.html` | `js/pages/landing.js` (carries UTM query to links marked `data-carry-query`) | `landing.css` | none |
| 2 | Merchant application | `/apply.html` | `public/apply.html` (shell only) | `js/pages/apply.js`, rendered from `js/config/form-schema.js` | `apply.css` | `POST /api/inquiries` |
| 3 | ISO partner landing | **does not exist in v2.1** — new static page, name to be decided (see §6) | — | — | — | none |
| 4 | ISO partner application | `/partners.html` | `public/partners.html` | `js/pages/partners.js` | `apply.css`, `partners.css` | `POST /api/iso/applications` |
| 5 | Admin dashboard | `/admin/` | `public/admin/index.html` | `js/pages/dashboard.js` | `dashboard.css` | `GET /api/admin/leads`, `GET /api/admin/audit`, review POST |
| 6 | ISO CRM | `/admin/iso.html` (list and detail are two views in one page) | `public/admin/iso.html` | `js/pages/iso-admin.js` | `dashboard.css`, `iso.css` | `/api/admin/iso/…` (see `VERSION_2_1_NOTES.md` §3) |
| – | Admin sign-in | `/admin/login.html` | `public/admin/login.html` | `js/pages/admin-login.js` | `login.css` | `POST /api/auth/login` |

Admin sign-in was not in the requested screen list but shares the shell and must be restyled with it.

Every page carries a demo strip (`.demo-strip`, `role="note"`) above the header and `noindex, nofollow`. Both must survive the redesign.

## 2. What each screen must keep

### Merchant application (`/apply.html`)

Already a five-screen flow: four steps plus a review screen, then a confirmation that replaces the form.

| Step | Fields (type; required?) |
|---|---|
| 1 About the business | Industry (select, 12 options; required) · State (select, 50 + DC; required) · Time in business (radio, 5 bands; required) |
| 2 Revenue and request | Approximate monthly revenue (currency; required) · Amount requested (currency; required) · Intended use of funds (select, 9; required) · Details (textarea, 280 chars; optional) |
| 3 Existing financing | Still repaying financing? (radio yes/no/not sure; required) · if yes: Kinds (checkboxes, 7; optional) · Approximate total owed (currency; optional) |
| 4 Contact details | Read-only fictional identity card with "use a different fictional contact" · Demo acknowledgement (checkbox; required) |
| 5 Review | Per-step summary with a "Change" link each; after first reaching review, Continue returns straight to review |
| Confirmation | Reference only; no outcome, score or decision |

States to draw: default, focus, field error (inline message under the field), error summary at the top ("Fix N answers to continue", focusable, links to fields), conditional fields shown/hidden, submitting, submit failure, confirmation, and the `noscript` notice.

### ISO partner application (`/partners.html`)

Single page, one submit. Identity is not typed: it is one of five built-in fictional organizations (`js/data/iso-demo-identities.js`) shown as a read-only card with "Use a different fictional organization". The server rejects anything else.

Fields: relationship type (radio: ISO / broker / referral partner; required) · main state (select; required) · product focus (checkboxes, 7; at least one) · typical monthly referrals (select, 4 bands; required) · time active (select, 4 bands; required) · demo acknowledgement (checkbox; required).

Confirmation: "Your partner application is in the review queue", reference only, "What happens next in the demo", "Submit another demo application".

### Admin dashboard (`/admin/`)

- Header: brand, workspace nav (Merchant inquiries / ISO partners), signed-in user, Sign out, Public site.
- KPI stats; current stages bars (6 stages); campaign source bars (7 sources).
- Preliminary screening insights: stats, most common review flags, screening-by-source table.
- Funnel instrumentation, including the explicit "Not yet measurable" note.
- Inquiries table, 12 columns: Reference, Business, Industry, State, Requested, Monthly revenue, Stage, Validation, Reason codes, Source, Received, and a details control. Six columns are hidden on narrow screens (`.wide`).
- Filters: search, stage, source, preliminary screen, review flag; Clear filters; Export filtered demo CSV.
- Detail is a `<dialog>`: Status, Review workflow (stage select limited to allowed transitions, reason required for Needs info and Closed, optional note), Review history, Preliminary validation, Inquiry, Contact (fictional).

Stages: New → Needs info / In review → Ready for handoff → Handed off (simulated) → Closed. None is a financing decision; the wording must stay.

### ISO CRM (`/admin/iso.html`)

List view: stats; relationship-stage bars (11 stages); tier bars (A–D plus Not scored) and acquisition source; pipeline health; organizations table (Organization, Domain, Region, Stage, Verification, Tier, Score, Source, Reviewer, Updated — rows already open the record via the organization link); 7 filters including sort; organization-level CSV export; CSV import (file → preview with column mapping → commit); duplicate review queue (decision: create separate / attach contact / skip, with a required reason); import history.

Detail view: header with stage, verification, tier and "Synthetic record" tags; Organization profile; Review workflow (stage move, disqualification reason, note; verification state with "what was checked"; assign to me); Partner-priority score (six factors — identity 25, relevance 20, contact 20, recent activity 15, fit 10, traceability 10 — each with reason codes; tiers A ≥ 80, B ≥ 60, C ≥ 40, D < 40; red-flag cap at D; recalculate; manual override with required justification; clear override; score history); Evidence and vetting checklist (9 categories, asserted / confirmed / refuted, add and review forms); Contacts (fictional, with status); Notes, follow-ups and history; audit log.

Wording that must stay: the score is a "ranking aid, not a credit score"; court-record context is never scored; contacted/engaged/active are manual records and nothing sends outreach.

## 3. Proposed UX changes

| Screen | Proposed change | Needs code beyond HTML/CSS? |
|---|---|---|
| All public | One shared header and footer (apply and partners currently use a reduced header). Mobile navigation as a disclosure menu. | Small JS for the menu toggle |
| Homepage | Hero with two equal acquisition paths: **Get business funding** → `/apply.html`, **Become an ISO partner** → partner landing. Sections in order: process (3 steps), financing categories (existing 4 "business needs" cards, still labelled as purposes rather than offers), partner recruitment band, FAQ, footer with disclosures. Facts band kept only for statements already true in v2.1 (7 core questions, no bank login, sample-only records). | No |
| Merchant application | Numbered stepper with completed / current / upcoming states and a compact "Step 2 of 5" form on mobile; sticky action bar on mobile; summary card beside the form on desktop; review screen as grouped cards. Fields, order, validation and copy unchanged. | No — the step model already exists |
| ISO partner landing | New page: who the program is for, merchant vs referral partner comparison, workflow (apply → human review → verification → relationship), what the demo does and does not do, CTA to `/partners.html`. No commission, payout, volume or approval figures. | New static file only |
| ISO partner application | Same form shell as the merchant application; identity card restyled; fields grouped into "Your organization" and "How you refer". Optionally a two-step presentation (see §6). | Two-step would need a small change in `partners.js` |
| Admin shell | Left sidebar on desktop (Merchant inquiries, ISO partners, Public site, session, Sign out), top bar on mobile. | No |
| Admin dashboard | KPI cards; stage pipeline as a segmented overview; stage and screening chips; filters in a toolbar with active-filter chips; **whole row clickable**, opening the record, with the business name as the real link for keyboard and screen-reader users (same pattern the ISO table already uses). Detail as a right-hand side panel on desktop, full-screen sheet on mobile. | Row click: a few lines in `dashboard.js`. Side panel can stay a `<dialog>`, restyled |
| ISO CRM | Master–detail layout on wide screens (searchable list left, record right); detail sections as tabs or anchored sections: Overview, Verification, Score, Contacts, Evidence, Activity; verification checklist with one row per evidence category and its status; score card with factor bars, reason codes and an override history timeline; CSV import as a three-step modal (upload → preview and mapping → result) with the duplicate queue as its own view. | Master–detail and tabs need changes in `iso-admin.js`; no API change |

### Unchanged

Backend, API routes and payloads, database, migrations, validation rules, stage transition tables, scoring rubric, CSV import rules, demo-identity restrictions, demo-only mode, authentication and CSRF, UTM attribution carry-over, CSV exports, `noindex`, the demo strip, and all legal wording that says this is a prototype and not a lender. No framework migration. No change to the Railway deployment.

## 4. Design tokens to build as Figma variables

Starting point is `public/styles/tokens.css`; the palette already matches the requested navy / white / restrained blue direction.

| Group | Tokens |
|---|---|
| Colour — brand | navy `#14293B`, deep blue `#0F3048`, blue `#147AA8`, blue dark `#0E547D`, sky `#2BB3CC`, pale blue `#E5F5F9` |
| Colour — surface and text | paper `#F7FBFD`, sheet `#FFFFFF`, ink `#14293B`, ink soft `#536B7F`, rule `#DCE7EE`, rule soft `#ECF3F7` |
| Colour — status | error `#9A2737` / tint `#FFF0F1` exist. **To add:** success, warning and neutral pairs for stage, verification and tier indicators |
| Type | display: Aptos Display → Segoe UI; body: Inter. Scale 14 / 16 / 20 / 26 / 34 and a fluid 44–75 display size |
| Space | 4, 8, 12, 16, 24, 32, 48, 72 |
| Radius | 14 (single value today; propose 6 / 10 / 14) |
| Layout | page width 1200, text measure 62ch |
| Breakpoints | propose 3 frames: mobile 390, tablet 834, desktop 1440. Current CSS breaks at roughly 416, 576, 608, 672, 832, 880, 928, 960, 992, 1024 and 1088 px across files and should be consolidated |

Contrast notes: blue `#147AA8` on white is about 4.8:1 (passes AA for body text); sky `#2BB3CC` on white is about 2.5:1 and must be decorative only.

Aptos is a Microsoft font and may not be available in Figma or to visitors without Microsoft 365. See §6.

## 5. Component library to build

Navigation (public header, mobile menu, admin sidebar, admin top bar, footer, demo strip, skip link) · Typography styles · Buttons (primary, light, quiet, small, link; default / hover / focus / disabled) · Form controls (text, currency, select, textarea with counter, radio group, checkbox group, single checkbox, file input; default / focus / error / disabled; label, hint, error text) · Error summary · Stepper · Identity card · Review section · Confirmation panel · Cards (KPI, solution, process step, info) · Bars and pipeline overview · Table (header, row default / hover / focus / selected, numeric cell, empty state, responsive column priority) · Filter toolbar and chips · Status indicators (6 merchant stages, 11 ISO stages, 4 verification states, tiers A–D and unscored, override marker, evidence asserted / confirmed / refuted, "Synthetic record") · Modal and side panel · Disclosure · Timeline item · FAQ accordion · Callouts.

Each with desktop and mobile variants on auto layout.

## 6. Open decisions

1. **Figma access.** A Figma connector with write access to a file must be available to the session that builds the designs, or the designs must be built another way and imported.
2. **Route for the partner landing page.** Options: a new `/partner-program.html` that links to the existing `/partners.html` form (no route changes), or move the form and make `/partners.html` the landing page (changes an existing route; not recommended).
3. **Partner application as one page or two steps.** One page needs no logic change.
4. **Typeface.** Keep Aptos Display with fallbacks, or switch headings to a freely licensed face that renders identically everywhere.
5. **Homepage "product" language.** v2.1 deliberately describes purposes of capital, not products or offers. A "financing product overview" must stay descriptive unless real product terms are supplied and reviewed.
6. **Brokerage positioning.** The current FAQ states the site is "not an operating lender or commercial-financing brokerage". Presenting it as a brokerage platform is a positioning choice that needs to be reconciled with that wording.
7. **Footer link to the admin dashboard** ("View synthetic dashboard") — keep for the demo or remove from the public footer.
8. **Admin detail pattern.** Side panel versus the current modal dialog.
9. **Stale footer text.** The homepage footer says "Demo v1.1" and the FAQ says nothing is stored on a server, while `/apply.html` says submissions are stored on the demo server. Copy should be corrected when the page is rebuilt.
