# Greenwich Credit Partners (MCA Site) — Master Objective, Living Roadmap & Revenue Ramp

**Intended repository path:** `docs/MCA_SITE_MASTER_PLAN.md`  
**Snapshot verified:** November 14, 2026 (America/New_York)  
**Repository:** https://github.com/jakeybakey77/websiteproject  
**Production demo:** https://websiteproject-production-d9df0cac.up.railway.app  
**Status:** Living project-control document; not a replacement for legal, funding-partner, or security approval.  
**Important:** This document is supplied for Codex to import into the repo. It is **not** itself committed or deployed by its creation.

> **North-star objective.** Build a trustworthy, compliant, measurable lead-acquisition and preliminary-qualification platform for small-business financing. Once separately authorized for real operations, attract merchants and ISO/referral partners, capture consented inquiries, identify missing information and material review flags, manage human review, attribute referrals correctly, hand off to contracted funders through authorized channels, and measure actual funded outcomes and cash collections. Until those gates are satisfied, the product remains a **fictional/synthetic-only demonstration**.

## 0. Codex operating contract — keep this file current

**Read this file at the beginning of any substantial task affecting the MCA site; update it as part of that task's reviewed documentation diff.** The checklist is a snapshot, not permission to execute outstanding work automatically.

1. Before altering code, fetch the actual default branch, open PRs, Railway live deployment SHA/schema (when accessible), and relevant source/tests. Date the `Last verified` entry and add links/SHA evidence. Never trust an older chat summary over current code.
2. Keep **DESIGNED / DOCUMENTED / CODE COMMITTED / MERGED / DEPLOYED / TESTED / LIVE-COMMERCIAL** as distinct states. An agent's description or passing local test does not prove production deployment or commercial readiness.
3. Close checklist items only with concrete proof: PR, merged commit, live deploy SHA, test log, direct UI inspection, or signed decision. Mark uncertain items **UNVERIFIED** with the needed evidence.
4. After each significant PR/release, update the status table, migration inventory, regressions, blockers, next three tasks, revenue model assumptions if market economics changed, and changelog. Do not overwrite historical checkpoints.
5. Prevent double work: inspect open branches and existing implementation before drafting another Codex/Fable assignment. Avoid parallel agents editing the same branch/files or deploying independently.
6. No production data migrations without fresh, independently verified backup, restore rehearsal, owner-authorized deployment and rollback plan. No production seed/reset, destructive schema edit, or silent volume/region changes.
7. No real merchant intake, data uploads, outreach, underwriting decisions, referral compensation, or funder transmission without legal/privacy/security/funder agreements and explicit owner approval. `GCP_DEMO_MODE=true` remains authoritative for today's deployment.
8. Treat all forecasts as **unvalidated scenarios** until actual funder contract economics and consented/authorized operating data exist. Do not copy forecast amounts onto public marketing pages.
9. If this document conflicts with the code, create an **OPEN DISCREPANCY** row with an evidence link instead of silently rewriting business requirements. Document any rejected task and why.
10. Never expose Railway secrets, private database snapshots or merchant/ISO personal information in this file, issues, commits, logs or forecasts.

**Source hierarchy:** (1) current merged source and tested migrations; (2) live Railway deployment metadata + verified backups; (3) signed business/legal/funder documents; (4) approved project docs and Figma designs; (5) agent reports/research; (6) scenario assumptions below. External promotional websites are not binding funder agreements.

## 1. Product scope and intended business model

**Two acquisition funnels, one controlled operations layer:**

```text
Organic / paid / direct / referral traffic
           |                                  ISO applicants / researched partners
           v                                             |
Merchant landing and intake (synthetic now)       ISO intake and reviewer CRM
           |                                             |
Server validation + documented review flags       Identity/evidence/verification
           |                                             |
Human merchant-review pipeline                 Verified + active_partner gate
           |                                             |
Approved, consented authorized handoff <---- Stable referral-code attribution
           |
Actual funder-reported outcomes (FUTURE; not available today)
           |
Collected platform compensation + audited partner shares (FUTURE)
           |
Conversion/quality/cost dashboards + growth decisions
```

- **Present product:** Node 22.13+, native HTML/CSS/JS, built-in SQLite (`node:sqlite`), session authentication/CSRF, synthetic merchant/ISO profiles, audit history, and Railway-hosted demo. The site is **not** an operating lender or brokerage today.
- **Future monetization hypothesis (NOT signed/operational):** GCP may retain an agreed share of commissions paid by contracted funders when actual transactions fund, or earn another agreed referral/lead fee if lawfully structured. The funder, GCP and referring ISO must have written terms specifying attribution, fee base, chargebacks, clawbacks, sharing consent and payment timing. Do not assume GCP owns the entire ISO commission.
- **Separate products:** ISO priority score is a reviewer ranking aid, not underwriting; referral eligibility is a hard server-side `active_partner && verified` condition independent of score; merchant flags are separate; performance reporting cannot substitute simulated handoffs for funded deals.
- **Excluded today:** real merchant contact/bank data, real ISO payouts, live credit decisions, automatic approvals/denials, funder API handoff, funded volume, real deal revenue and live sales conversion claims.

### Current measurable event glossary

| Event / metric | Definition | Status |
|---|---|---|
| Unique merchant inquiry | A server-accepted synthetic intake record; deduplicate network retries by submission key where applicable | Measurable in demo |
| Referred inquiry | Inquiry with effective current ISO credit, with separate append-only original/correction history | Measurable in demo |
| Direct/unattributed | Inquiry without current effective ISO attribution | Measurable in demo |
| Ready for handoff | Internal review stage; **not funding approval** | Measurable in demo |
| Handed off (simulated) | Simulated operational stage; **not actual transmission/funding** | Measurable in demo |
| Ever reached ready / handoff | Derived from recorded `workflowMilestones` when present; seed/legacy rows can lack milestones | Conditional; audit denominator |
| Unique visits / paid campaign spend | Requires privacy-reviewed attribution and analytics, not inferred from lead count | Not established |
| Funder accepted / funded | Verified external funder event plus original consent, transaction identifiers | Not captured |
| Commission earned/collected / clawback | Contract-backed, reconciled accounting record | Not captured; model only |

## 2. VERIFIED engineering/release snapshot — November 14, 2026

| Workstream | Status | Evidence / comments |
|---|---|---|
| v2.0 merchant backend | **MERGED + DEPLOYED** | SQLite merchant inquiry, authentication, CSRF, audit and server-side review, carried into current baseline |
| v2.1 ISO Partner Intelligence | **MERGED + DEPLOYED** | ISO applications, stages, verification, scoring v1, CSV import, audit; see `VERSION_2_1_NOTES.md` |
| v2.2 Figma visual redesign | **MERGED + DEPLOYED** | PR #1; native approved design covers six screen types and admin login |
| v2.3 Gate A+B ISO referral tracking | **MERGED + DEPLOYED** | PR #3: code issuance/rotation/revocation, attribution corrections, idempotent merchant submissions, UI and tests |
| v2.4 referral controls UX | **MERGED + DEPLOYED** | PR #4: clearer eligibility messaging and pagination |
| v2.5 merchant funnel context | **MERGED + DEPLOYED** | PR #5: optional construction invoice timing, existing financing payment frequency and remaining term; migration **4** |
| Merchant amount range inputs | **PR OPEN — NOT MERGED** | PR #6 `feat/merchant-amount-ranges`; bands replace exact merchant amounts for new inputs, historical amounts remain readable; review before merge |
| Merchant hard-stop screening | **DOCUMENTED, NOT IMPLEMENTED** | PR #2 `docs/iso-merchant-hard-stops-2026-11`, docs only; requires updated migration plan and server guard |
| ISO shadow score defect fixes | **RESEARCH / REVIEW ONLY** | Opus Revision 2 recommends keep v1 weights, fix traceability, invalid future dates, and missing-evidence semantics |
| Two-distinct-reviewer exceptions | **BLOCKED** | Single shared admin identity; hard-stop overrides must fail closed pending RBAC/MFA and identity audit |
| Funded-outcome reporting & payment ledger | **NOT IMPLEMENTED** | No real funder agreements/event data confirmed; never claim current funding volumes/revenue |
| Real-data launch | **NOT AUTHORIZED** | `GCP_DEMO_MODE=true`; pre-launch legal, security, consent, access, and integration gates open |

**Verified GitHub state:** default branch `claude/compassionate-fermi-uk97tm`; deployed head `d2aff9a9e03596a486b4bda5ba894296cc85c1b7` (PR #5). PRs #1, #3, #4, #5 merged; PRs #2 and #6 open at snapshot. A feature branch or merged PR is not proof of a completed external business process.

**Verified Railway state:** project `kind-insight`, production environment, service `websiteproject` from default branch. Latest deploy `c16dc66f-7b48-417f-b04c-7e54d55f7fb2` has status `SUCCESS`, created `2026-11-14T07:10:33Z`; one online replica, no active issue reported, no staged patch. Persistent `websiteproject-volume` (500 MB) mounted at `/data`; `/healthz` configured. No custom domain attached. Config identifies service region `us-west1` while volume reports `us-west2`; **verify actual runtime placement and rollback/recovery path**, do not change region on assumption. Live application pages and schema-version query were **not independently browser-tested in this snapshot**.

**Schema inventory (critical correction to old handoffs):**

| Migration | Name | Status |
|---|---|---|
| 1 | `baseline_merchant_leads_sessions_audit` | In merged source |
| 2 | `iso_partner_intelligence` | In merged source |
| 3 | `iso_referral_tracking` | In merged source |
| 4 | `merchant_funnel_context` | **Already in merged/deployed v2.5 source** |
| 5+ | Future additive changes | **UNASSIGNED** until new branch plan; **do not reuse migration 4** |

**Open discrepancy / verification:** PR #5 documents local migration rehearsal and calls for a fresh verified schema-v3 production backup before cutover, but this snapshot does **not** establish that an off-volume production backup and restore were independently verified. Audit backup/recovery evidence before claiming production recoverability. A healthy deployment is not a restore test.

## 3. Living prioritized worklist (update on every engineering checkpoint)

| ID | Priority | Work item | Current state | Exit / acceptance evidence |
|---|---|---|---|---|
| OP-01 | **P0** | Production backup, schema-v4 and restore readiness audit | **OPEN / VERIFY** | Confirm real schema 4, integrity, backup artifact/checksum stored off-volume, restore rehearsal, DB path/region; redact sensitive values |
| OP-02 | **P0** | Review PR #6 amount bands for fit and regression | **OPEN PR** | Tests incl old historical numeric records, amount-band validation, mobile form review; then explicit merge approval |
| OP-03 | **P0** | Update hard-stop PR #2 to current v2.5 baseline | **SPEC NEEDS REVISION** | Replace obsolete migration-4 instruction; precise rule definitions; bypass-resistant guard; fail-closed overrides; legal signoff for actual denial logic |
| OP-04 | **P0** | Identity/RBAC/MFA design for reviewer authorization | **NOT IMPLEMENTED** | Two distinct human reviewer identities, roles, separation-of-duties, distinct authenticated signatures, negative tests; no simulated two-approver pathway on shared login |
| OP-05 | **P1** | Merchant hold engine (synthetic only) | **NOT IMPLEMENTED** | Versioned separate evaluator, additive next migration, immutable evidence/override, server-side ready/handoff block; never alter ISO credit from merchant flags |
| OP-06 | **P1** | ISO v1 scoring defect-fix shadow pilot | **NOT IMPLEMENTED** | Keep 25/20/20/15/10/10; future activity earns no points; confirmed red-flag/court context/unverified/duplicated sources cannot boost traceability; label missing evidence; regression vectors, no v1 history mutation |
| OP-07 | **P1** | Policy adoption gate (Argon/Opus review) | **NEEDS OWNER APPROVAL** | Reconcile actual Opus Rev2 document, legal applicability, evidence definitions; version/freeze approved policy before new code |
| OP-08 | **P1** | Funnel and ISO partner event-quality analytics | **PARTIAL / FUTURE** | Separate current-stage snapshot from ever-reached milestones; cohort maturity, low-N, corrected attribution, no invented close/funding numbers |
| OP-09 | **P1** | Privacy/consent/real-data launch requirements | **NOT SATISFIED** | Legal entity role/state scope, notice+consent versioning, opt-out, data map, retention, MFA, secure document pipeline if ever enabled, third-party agreements |
| OP-10 | **P1** | Authorized funder handoff and outcomes pipeline | **NOT IMPLEMENTED** | Signed agreement, consent check, field map, delivery receipt, reconciliation, immutable stage history and verified funding/commission evidence |
| OP-11 | **P1** | Growth instrumentation and controlled acquisition | **NOT STARTED FOR REAL OPERATIONS** | Approved landing copy, campaign tagging + attribution, qualified lead definitions, cost per valid submitted lead, funnel QA, spend ceiling, attribution audit |
| OP-12 | **P2** | ISO evidence/confidence, compliance and performance panels | **RESEARCH / DEFERRED** | Maintain priority/eligibility/compliance/merchant flags independently; real performance never inferred from synthetic records |
| OP-13 | **P2** | Public conversion/accessibility polish | **ONGOING** | WCAG 2.2 AA audit, cross-browser mobile, load/perf review, no unsubstantiated product terms, demo copy clear |
| OP-14 | **P2** | Business operating plan, signed economics, bookkeeping | **NOT ESTABLISHED** | Verify fee contract, lead ownership, ISO share, payout timing, expenses, entity operating agreement, startup budget, runway, financial controls |

**Recommended next three tasks:** (1) audit v2.5 production backup/schema + restore evidence; (2) review PR #6 and hard-stop PR #2 without merging unsafe changes; (3) formalize individual reviewer identities and approved screening exception controls. Continue growth work as research-only until compliance gates are met.

### November 12 requested merchant screening rules — keep them OUT of the ISO score

| ID | Condition | Immediate **internal** action | What does NOT prove it |
|---|---|---|---|
| `DOC_PERSONAL_STATEMENT` | Verified personal vs business bank statement (future docs only; no upload in demo) | Hold document readiness; ask for appropriate bank evidence, allow reviewer assessment for sole proprietor/DBA | Personal title alone does not mean fraud |
| `MCA_DEFAULT_SUSPECTED` | Unverified claim or suggestive source about prior MCA/alternative-funder default | Risk verification queue, no handoff while unresolved if rule so requires | UCC, ordinary NSF/ACH return, existing MCA balance, negative bank balance are **not** proof of default |
| `MCA_DEFAULT_CONFIRMED` | Authorized reviewer records authentic funder, default event/date, reliable evidence and resolution/dispute status | Hold pending authorized final review | Automated keyword classifier or ISO allegation alone |
| `IND_CANNABIS` | Documented cannabis activity within approved narrowly scoped policy | Restricted-industry reviewer hold | Generic hemp/CBD, unrelated industry reference |
| `IND_TRUCKING` | Documented freight trucking / hauling within written rule | Restricted-industry reviewer hold | Broad transportation/logistics/warehouse/courier field |
| `IND_LEGAL` | Documented legal representation / law practice | Restricted-industry reviewer hold | General professional services/legal software |

The current merchant engine permits a single-reviewer `screening_exception_documented` override for existing flags. **Future hard-stop flags must not use that exception as an escape route**. A two-distinct-reviewer override is impossible under current shared-admin auth; the safe interim behavior is **no bypass** for confirmed-default or verified restricted-industry holds. External denials, notifications, and adverse-action handling require a separately approved legal policy.

## 4. Roadmap and release gates (not commitments or deadlines)

| Phase | Definition of done | Dependencies |
|---|---|---|
| **A — Demo reliability** | Current production backup/restore proven; current form, referral and auth tests; fixed repo documentation and release ledger | v2.5 deployed; PR #6 separately reviewed |
| **B — Policy and controls** | Approved hard-stop definitions, reviewer identities/RBAC, scorecard Shadow-A design, migration numbering agreed | A + owner/legal signoff; no accidental sharing between parallel features |
| **C — Controlled synthetic prototype** | Merchant flags with fail-closed handoff, corrected ISO scoring visible only in admin shadow, auditable partner/funnel metrics | B + fresh schema migration/rollback tests |
| **D — Live operating readiness** | Role/registration, commercial-financing disclosure assessment, privacy/consent, contracts, security review, data retention, authorized handoff and real funding outcome reconciliation | Outside current demo scope; explicit owner go/no-go |
| **E — Commercial acquisition** | Small test budgets, measured qualified inquiry economics, partner onboarding and source attribution; expand spend only against collected net unit economics | D + validated operations, not synthetic test counts |
| **F — Optimize and scale** | Partner-quality cohort dashboards, compliant performance scoring proposal, experiments, payback/runway tracking and incident response | E with sufficient observed samples |

**Non-negotiable release sequence:** document + review → fresh baseline/test → migration/backup/restore rehearsal → approved PR → deploy → smoke + rollback readiness → update this ledger. Never treat a docs-only PR as implementation or auto-enable real operations.

## 5. Revenue engine and forecast boundaries

### Current financial reality

- **Confirmed monetization from the current demo: none evidenced; modeled as $0.** The app accepts fictional submissions only. No funded deals, consented merchant data, funder payments, partner commissions, or real business revenue are evidenced by the repository and deployment. This does not assert that the business has no revenue outside the website.
- All numbers below are **illustrative post-authorization scenarios**, **not actual earnings, industry conversion benchmarks, predictions, or implied product promises**. **M1 = first month after a separately approved commercial launch**, not November 2026 or a guaranteed launch date.
- A vendor's public commission schedule is only evidence of **that vendor's advertised offer**, not a GCP contract or a representative market average. For example, Workable Funding publishes a contracted ISO program with per-deal rates *up to* 12 points and a separate $500 referral offer; that should not be applied to GCP without a signed agreement. See source register.
- Any paid/compensated referral must be reviewed for jurisdiction-specific legal applicability and contract authority before operating.

### Revenue definitions and formulas (all in USD)

```text
M_t        = valid, unique, submitted merchant inquiries in month t (not visits)
q          = percentage of M_t ultimately verified as actually funded by contracted funder
A          = mean verified funded principal / advance
c          = gross funder-paid channel commission as a fraction of A
D          = fraction of funded deals from GCP-owned/direct traffic
R_iso      = fraction of channel commission GCP keeps on ISO-sourced funded deals
B          = D + (1-D) * R_iso  [blended platform retention, after ISO's share]
r          = expected payout/clawback/noncollection reserve
P          = fraction of valid completed inquiries acquired using paid traffic
CPL        = ad cost per *paid, valid completed inquiry* (not cost per click)
F          = monthly fixed software/operations expense

Expected funded transactions_t = M_t * q
Expected funded volume_t = M_t * q * A   [NOT platform revenue]
Expected GCP earned net revenue_t = M_t * q * A * c * B * (1-r)
Paid acquisition expense_t = M_t * P * CPL
Contribution before owner pay/tax/legal/startup_t = earned revenue_t - paid acquisition_t - F
Cash collections stress = same earned revenue shifted 3 months after intake
  (simplified combined funding + payment delay, not an actual payment SLA)
```

**No double counting:** ISO commissions payable are already removed using `B`; do not also subtract the same partner share. The reserve `r` is a planning reduction, not a real clawback calculation. If the true model is a fixed per-accepted-introduction fee, **build and contract a separate fee model** rather than applying both fees to one inquiry. Funded volume is a pass-through activity metric, never GCP sales. If GCP is acting as an introducing lead generator instead of a broker, its actual monetization may differ radically.

### Scenario assumptions — invented planning inputs, NOT empirically validated

| Driver | Downside | Base | Stretch / high-execution case |
|---|---:|---:|---:|
| Submitted unique inquiries / year | 610 | 1,165 | 2,450 |
| Submitted unique inquiries / M12 | 120 | 210 | 500 |
| Inquiry → funded conversion | 2% | 4% | 6% |
| Average funded amount | $35,000 | $50,000 | $65,000 |
| Gross funder-paid commission | 4% | 6% | 7% |
| Direct-origin share | 30% | 40% | 50% |
| GCP retention on ISO-origin commission | 25% | 40% | 45% |
| Clawback / noncollection reserve | 15% | 10% | 8% |
| Paid acquisition share | 70% | 55% | 50% |
| Cost per paid completed inquiry | $80 | $65 | $55 |
| Monthly fixed operating cost | $1,500 | $2,500 | $3,500 |

**Methodology:** lead ramp below is the number of *unique, completed inquiries*. For simplicity, `q` compresses multiple future steps (screening, lender handoff, acceptance and final funding). These are NOT currently tracked in production. Real observed per-step conversion must replace `q` before making spending decisions. The stretch case is a high-sensitivity stress test, not the expected outcome.

### Computed Year 1 outcomes (M1–M12 after hypothetical legal launch)

| Output | Downside | Base | Stretch |
|---|---:|---:|---:|
| Weighted GCP commission retention | 47.5% | 64% | 72.5% |
| Expected net GCP revenue per funded deal | $565 | $1,728 | $3,035 |
| Expected GCP revenue per inquiry | $11 | $69 | $182 |
| Modeled funded transactions (expected value) | 12.2 | 46.6 | 147.0 |
| Implied funded volume (NOT GCP revenue) | $427,000 | $2,330,000 | $9,555,000 |
| Year 1 expected earned revenue | $6,896 | $80,525 | $446,123 |
| Year 1 paid marketing cost | $34,160 | $41,649 | $67,375 |
| Year 1 modeled fixed costs | $18,000 | $30,000 | $42,000 |
| Year 1 contribution, accrual-style | -$45,264 | $8,876 | $336,748 |
| Year 1 collected revenue with 3-month lag | $3,392 | $42,163 | $213,046 |
| Year 1 operating cash contribution with 3-month lag | -$48,768 | -$29,486 | $103,671 |

**Interpretation:** In the **base scenario**, approximately **1,165** valid inquiries over the first 12 commercial months lead mathematically to **46.6 expected funded transactions** (an expectation, not fractionally possible completed deals), about **$80,525 earned retained revenue**, and just **$8,876 contribution** before owner compensation, tax, legal expenses, startup costs or additional staffing. A **3-month intake-to-cash lag** reduces first-year expected cash receipts to **$42,163** and operating cash contribution to **-$29,486** before any startup outlays. Under the downside assumptions, acquisition is loss-making per inquiry; scaling spend makes losses larger. The stretch case should not be used for budgeting without validated conversion and operating capacity.

### Base-case monthly ramp (M1 is a hypothetical future launch month)

| Month | Valid inquiries | Expected fundings | Earned net revenue | Paid media spend | Fixed spend | Earned contribution | Collected revenue if 3-month lag |
|---|---:|---:|---:|---:|---:|---:|---:|
| M1 | 0 | 0.0 | $0 | $0 | $2,500 | -$2,500 | $0 |
| M2 | 20 | 0.8 | $1,382 | $715 | $2,500 | -$1,833 | $0 |
| M3 | 35 | 1.4 | $2,419 | $1,251 | $2,500 | -$1,332 | $0 |
| M4 | 50 | 2.0 | $3,456 | $1,788 | $2,500 | -$832 | $0 |
| M5 | 65 | 2.6 | $4,493 | $2,324 | $2,500 | -$331 | $1,382 |
| M6 | 80 | 3.2 | $5,530 | $2,860 | $2,500 | $170 | $2,419 |
| M7 | 100 | 4.0 | $6,912 | $3,575 | $2,500 | $837 | $3,456 |
| M8 | 120 | 4.8 | $8,294 | $4,290 | $2,500 | $1,504 | $4,493 |
| M9 | 140 | 5.6 | $9,677 | $5,005 | $2,500 | $2,172 | $5,530 |
| M10 | 160 | 6.4 | $11,059 | $5,720 | $2,500 | $2,839 | $6,912 |
| M11 | 185 | 7.4 | $12,787 | $6,614 | $2,500 | $3,673 | $8,294 |
| M12 | 210 | 8.4 | $14,515 | $7,508 | $2,500 | $4,508 | $9,677 |

**Base break-even in accrual-style contribution:** At `q=4%`, GCP's estimated revenue per valid inquiry is **$69**, with **$36** of paid-media acquisition spend per inquiry and **$2,500** fixed costs/month. That requires about **75 valid inquiries/month** to cover modeled marketing plus fixed costs, *before salaries, legal/compliance, taxes and delayed cash collection*. It is not a cash break-even threshold.

**Sensitivity to funded conversion at the same base-case 1,165 inquiry volume:**

| Inquiry → verified funding rate | Earned net platform revenue | Contribution after modeled acquisition + fixed expenses |
|---|---:|---:|
| 2% | $40,262 | -$31,386 |
| 4% | $80,525 | $8,876 |
| 6% | $120,787 | $49,138 |

### Budgeting, waterfall and launch controls

1. **Before first paid campaign:** signed fee & revenue-share agreements, legal role/state review, consent/storage/authorization, funder outcome reconciliation, opt-out and incident process. No projected revenue before these gates.
2. **Pilot spend:** set a capped approved marketing test budget and maximum acceptable *cost per valid inquiry*, not just click-through rate. Do not scale paid channels until trailing cohort **cash-collected, net retained revenue** exceeds acquisition + servicing cost with an appropriate buffer.
3. **Cash runway:** model at least three months of delayed receipts, possible fee clawbacks, extra compliance counsel, bookkeeping, payroll, professional liability, security/storage and support. These are **not fully captured** in the tables. Do not distribute founder profits from unpaid commissions.
4. **ISO splits:** if a partner originates an inquiry, use only the contractually agreed GCP retention; reconcile invoice, funding confirmation, payout schedule, offset and clawback. Avoid paying twice after referral corrections.
5. **Measurement:** each reporting period reconcile funder-reported funded deals to GCP inquiry IDs, approved referral credit, general ledger and bank payments. Never treat `handed_off (simulated)` as revenue.
6. **Forecast revision trigger:** update `q`, funded amount, gross fee and GCP share only after credible contract/funder data or material evidence. Maintain baseline assumptions and timestamp every revision.
7. **Founder distributions:** expense/profit-sharing and equity arrangements are excluded until documented, signed and connected to an accounting/tax plan. The contribution above is *not* distributable profit.

### Revenue KPI dashboard (planned, real operating mode only)

| Metric | Definition | Source required |
|---|---|---|
| Conversion to complete inquiry | Unique valid completed inquiries / consented eligible site sessions | Privacy-approved analytics + server intake |
| Review-ready share | Review-ready distinct inquiries / observed intake cohort | Server evaluation snapshot; denominator and cohort |
| Handoff share | Distinct eligible handoffs / reviewed inquiries | Immutable event log with consent and authenticated delivery |
| Funded conversion | Verified funded distinct inquiries / mature submitted cohort | Signed funder event feed; correction/duplicate rules |
| Funded volume | Sum of verified funded amounts | Provider confirmations only |
| Gross contracted channel commission | Funded amount × signed per-deal payable rate | Funder agreements and settlement reports |
| Net GCP fee / funded deal | Collected fee less ISO payout and actual clawback | Receivables + payable ledger + cash reconciliation |
| Revenue per inquiry | Collected net GCP fees / mature consented inquiries | Matched funding and cash data |
| Cost per valid inquiry | Paid campaign spend / distinct valid paid inquiries | Ad platform spend + identity-safe attribution |
| Cash payback | Time to collect net fees exceeding acquisition+servicing outlay per cohort | Cash ledger + cohort timing |
| ISO quality | Evidence-backed investigation burden and measured stage outcomes; low-N caveats | Internal case review and event trail; not ISO priority grade |

## 6. Governance and release decision ledger

| Decision ID | Decision needed | Current proposed default | Owner/date |
|---|---|---|---|
| D-01 | Commercial role / entity / geography | Demo only until counsel confirms broker vs lead generator scope | OPEN |
| D-02 | Contracted funding partners | No real funder transmissions without signed rights/terms | OPEN |
| D-03 | Exact ISO economics and GCP retained share | Forecast placeholders only; no actual payouts | OPEN |
| D-04 | Merchant hard-stop definitions and review approvals | Internal hold first, fail closed on confirmed restrictions/default | OPEN |
| D-05 | Distinct reviewer identity architecture | RBAC/MFA required before two-person exceptions | OPEN |
| D-06 | ISO priority v2 adoption | Pilot defect fixes with existing 25/20/20/15/10/10 weights, shadow only | OPEN |
| D-07 | Scorecard factor reweighting | Do not implement Argon or 20/20/15/10/15/20 reweighting without evidence | DEFER |
| D-08 | PR #6 amount-band merchant UI | Review new inputs against actual merchant requirements and historical numeric handling | OPEN |
| D-09 | Next schema migration numbers | Start with >4 after reviewing latest merged schema, proposed merchant flags before shadow scoring | OPEN |
| D-10 | Acquisition channel and spending cap | No real paid campaign before launch readiness | OPEN |
| D-11 | Profit distributions, cost allocations and governance | Require signed business arrangements and accounting | OPEN |

## 7. Evidence & links

**Current code / operations:**

- Repository: https://github.com/jakeybakey77/websiteproject
- PR #1 v2.2 design: https://github.com/jakeybakey77/websiteproject/pull/1
- PR #2 hard-stop policy (open, docs only): https://github.com/jakeybakey77/websiteproject/pull/2
- PR #3 v2.3 referrals: https://github.com/jakeybakey77/websiteproject/pull/3
- PR #4 referral-controls UX: https://github.com/jakeybakey77/websiteproject/pull/4
- PR #5 merchant-funnel context: https://github.com/jakeybakey77/websiteproject/pull/5
- PR #6 amount-range selector (open): https://github.com/jakeybakey77/websiteproject/pull/6
- `docs/PRE_LAUNCH_CHECKLIST.md`, `VERSION_2_1_NOTES.md`, `VERSION_2_3_NOTES.md`, `docs/V2_3_RELEASE.md`, `server/migrations.mjs`, `public/js/lib/review-workflow.js`.
- Figma native design: https://www.figma.com/design/9NMvRWv48ixyvhT5kuRUJu
- Railway service: https://websiteproject-production-d9df0cac.up.railway.app

**External context (checked November 14, 2026; limited interpretation):**

- Connecticut Department of Banking, registration information for certain commercial financing providers/brokers: https://portal.ct.gov/dob/consumer-credit-licensing-info/consumer-credit-licensing-information/commercial-financing-provider-or-broker-registration-information. Scope/exemptions must be assessed with counsel; not all referral activity necessarily qualifies.
- Connecticut statutes Chapter 669, Part XVI commercial financing: https://www.cga.ct.gov/2026/sup/chap_669.htm
- FTC advertising guidance: https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business (or the FTC's current equivalent page). Advertising needs support; don't promise approval or rates.
- FTC MCA enforcement case (illustrative of conduct risk, not directly applicable adjudication of GCP): https://www.ftc.gov/enforcement/refunds/yellowstone-capital-refunds
- Workable Funding publicly advertised referral and ISO compensation examples: https://workablefunding.com/become-a-broker and https://workablefunding.com/iso-partners/terms. This is a **single vendor's marketing/terms**, not a verified GCP arrangement or market-wide fee benchmark. Terms and payouts can change.

## 8. Changelog and next-session refresh template

| Date | Commit / deploy verified | Change | Evidence | Remaining risk |
|---|---|---|---|---|
| 2026-11-14 | `d2aff9a9e035` / Railway `c16dc66f…` | Snapshot confirms v2.3 referrals, referral UX, v2.5 funnel merged/deployed, migration 4 used; PRs #2/#6 open | GitHub PRs/branches, Railway live deployment + service inventory | Restore proof, schema live version, real-data gates, hard-stop bypass |

**For each Codex session, append (do not replace):**

```markdown
### YYYY-MM-DD — session / PR checkpoint
- Baseline SHA / working branch:
- Railway LIVE SHA (if checked):
- Tests actually executed (and counts):
- Migrations present / backup status:
- Changed: [links to PR/commit/docs]
- What is DONE vs REVIEWED vs DEPLOYED:
- New risks/blockers:
- Forecast assumption changes (if any; preserve original model):
- Top three next actions:
- Owner sign-offs needed:
```

**Last verified:** 2026-11-14. **Refresh this file on the next meaningful project change**, using sources rather than assuming every live feature remains unchanged.
