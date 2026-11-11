# Version 2.1 notes — ISO Partner Intelligence + deployment-readiness fixes

Synthetic data only. `GCP_DEMO_MODE=true` remains the only supported mode; `false` closes both public intakes.
Nothing in this release was deployed, and no claim is made that Railway deployment works.

## 1. Railway-readiness audit (fixes limited to demonstrated problems)

| Finding | Evidence | Change |
|---|---|---|
| One unauthenticated request with a malformed `%` path (e.g. `GET /%E0%A4%A`) crashed the process | Reproduced against unmodified v2.0: server exited, `/healthz` unreachable | URL parsing is guarded; returns 400. Regression test added. |
| Oversized request bodies reset the connection instead of returning 413 | Reproduced with a 400 KB POST | Body reader drains (bounded) and returns a clean 413. |
| SIGTERM could hang on idle keep-alive sockets, so the database was never closed | `server.close()` waits for keep-alive connections | `close()` drops idle sockets, force-closes after 5 s, checkpoints the WAL, exits 0. Tested with a real child process. |
| Production accepted the placeholder secrets from `.env.example` and any length | Config only checked non-empty | Production start-up now fails on placeholders, `ADMIN_PASSWORD` < 12 chars, `SESSION_SECRET` < 32 chars. |
| `/healthz` returned 200 without touching the database | Read of handler | Now runs `SELECT 1`; 503 if the database is unusable. Response shape unchanged. |
| `VOLUME ["/data"]` in the Dockerfile | Railway manages volumes itself and, to my knowledge, rejects the `VOLUME` instruction. **Not verified in this session.** | Removed; mount a Railway volume at `/data`. |

Already correct in v2.0 and left alone: `PORT`/`HOST=0.0.0.0` handling, `/data/gcp.sqlite` default in the image, secure cookies in production, required secrets, no secrets in logs.

Not verified here: the Docker image build and run (no Docker daemon was available), and anything on Railway itself.

## 2. Schema migrations

`server/migrations.mjs` adds a `schema_migrations` table and ordered, transactional, forward-only migrations.

- **1 `baseline_merchant_leads_sessions_audit`** — the v2.0 tables, `IF NOT EXISTS`, so an existing v2.0 database upgrades in place.
- **2 `iso_partner_intelligence`** — `iso_organizations`, `iso_contacts`, `iso_evidence`, `iso_activity`, `iso_score_snapshots`, `iso_import_batches`, `iso_import_rows`, plus `audit_log.iso_organization_id`.

Database-level invariants: `demo = 1` (CHECK) on every partner organization; stage/verification/tier/source enums; a stage that implies verification can only be stored with `verification_status = 'verified'`; confirmed/refuted evidence must name its reviewer; score snapshots are append-only (triggers); an override snapshot needs a justification; no key or column links `iso_*` tables to `leads`.

A failed migration rolls back. A database newer than the application refuses to start.

## 3. ISO module

**Public:** `/partners.html` → `POST /api/iso/applications`. Identity must exactly match one of five built-in fictional organizations (`public/js/data/iso-demo-identities.js`). The receipt contains a reference only — no score, tier or review state. Rate limited; 503 when demo mode is off.

**Admin API** (`/api/admin/iso/…`, session required, CSRF token on every POST):

| Method | Path | Purpose |
|---|---|---|
| GET | `/organizations` | List; `q, stage, tier, verification, source, reviewer, sort, dir` |
| GET | `/organizations/:id` | Detail: contacts, evidence, activity, score breakdown + history, possible duplicates, audit |
| POST | `/organizations/:id/stage` | Validated stage transition (`stage`, `note`, `reason`) |
| POST | `/organizations/:id/verification` | Business-verification state |
| POST | `/organizations/:id/assign` | Assign reviewer |
| POST | `/organizations/:id/contacts`, `/contacts/:id/status` | Fictional contacts only |
| POST | `/organizations/:id/evidence`, `/evidence/:id/review` | Add (always "asserted"), then confirm/refute |
| POST | `/organizations/:id/activities`, `/activities/:id/complete` | Notes and manual follow-ups |
| POST | `/organizations/:id/score/recalculate`, `/score/override`, `/score/override/clear` | Scoring |
| POST | `/imports/preview`, `/imports` | Dry run, commit |
| GET | `/imports`, `/imports/:id` | History, rows, duplicate queue |
| POST | `/import-rows/:id/resolve` | `create_separate`, `attach_contact` or `skip` |
| GET | `/analytics`, `/score-rules`, `/export.csv` | Counts, rubric, organization-level export |

**Stages:** `applied | imported → research_needed → under_review → verified → outreach_ready → contacted → engaged → active_partner`, plus `disqualified`, `archived` (transition table in `public/js/config/iso-pipeline.js`). Business verification (`unverified | in_review | verified | failed`) is a separate column. "Verified" requires at least one independently confirmed identity item and no confirmed red flag. Self-reported or imported statements cannot be confirmed without naming an independent source.

**Score** (`iso-priority-2026.11-v1`): identity 25, relevance 20, contact 20, recent activity 15, fit 10, traceability 10. Tiers A ≥ 80, B ≥ 60, C ≥ 40, D < 40. Every factor returns reason codes, including zero-point "missing" reasons. A confirmed red flag caps the tier at D without changing the score. Court-record context earns nothing and classifies nothing. Snapshots store rule version, inputs digest and assessment date; a new snapshot is written only when the result changes. Overrides are stored beside the computed tier with actor and justification. The weights are a first draft and have not been validated against any outcome.

**CSV import:** UTF-8, ≤ 256 KB, ≤ 500 rows, ≤ 30 columns. Rows are rejected (and their raw values not stored) for real-looking emails/phones/websites, formula-leading cells (`= + - @`), unknown enums or over-length values. Same file + mapping → original batch returned, nothing created. Rows seen in an earlier batch → `replayed`. Same domain, same normalized name or near-identical name → duplicate-review queue; organizations are never merged. The whole import is one transaction.

## 4. Security caveats

1. "Synthetic only" is enforced by pattern for imports and admin entry (reserved domains, 555-01xx phones) and by exact match for the public form. **Organization names, contact names and free-text notes cannot be proven fictional**; a reviewer could still type a real name. The `not_synthetic` disqualification reason exists for that case.
2. One shared admin account; no roles, MFA or per-user identity. "Assigned reviewer" and audit actors are that username.
3. Rate limits are in memory and keyed on the first `X-Forwarded-For` value, which a client can spoof unless the platform proxy overwrites it. Unchanged from v2.0.
4. No HSTS header is sent by the app.
5. Evidence URLs are stored as text and never fetched; in demo mode they must be on reserved domains.
6. The `contacted`/`engaged`/`active_partner` stages are manual records. Nothing in the code sends email or contacts anyone.
7. The container runs as root (unchanged), which is what a root-owned Railway volume expects.

## 5. Not built (still gated)

Outreach and email (P2), merchant portal, funder rules and commissions (P3), bank-statement parsing and underwriting support (P4), enrichment or scraping, manual organization creation in the admin UI, editing organization profile fields after intake, pagination beyond 500 records.
