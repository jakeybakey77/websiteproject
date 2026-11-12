# v2.3 — ISO referral tracking (Gate A: backend)

Synthetic demo data only. Not implemented, by design: real merchant or ISO data, partner login, outreach, funder submission, payouts, commissions, financing decisions. Nothing in this change deploys anything or touches Railway.

**Scope of this change:** the backend half of the v2.3 specification (migration, services, APIs, tests). The visible UI — referral banner on `/apply.html`, "Referred by" in the merchant admin, the Referrals tab in the ISO admin — is Gate B and is intentionally **not** included, so it can be built from the approved v2.2 design system without competing edits. No existing page, stylesheet or page script was changed.

**Baseline:** branched from `e7ce67b` (tip of `claude/compassionate-fermi-uk97tm`: v2.1 `9a0b5ed` plus three ISO-table UI commits). The v2.2 Figma branches add documents only on top of that same commit. 101/101 tests passed on the baseline before any change.

## Rule that governs everything

A partner can be issued a demo referral link, and can receive credit for a new inquiry, only while **relationship stage = `active_partner` AND business verification = `verified`**. This is checked inside the write transaction on every issuance, every public submission and every manual assignment, and again by database triggers. The A–D partner score and tier are never consulted.

## Migration 3 (`iso_referral_tracking`) — forward-only

Migrations 1 and 2 are untouched. No column was added to `leads`.

| Table | Purpose |
|---|---|
| `iso_referral_codes` | Opaque code per partner. `status` active/revoked, issuer and revoker audit columns. `UNIQUE(code)`; partial unique index = at most one active code per organization. |
| `lead_referrals` | Current effective credit. `lead_id` is the primary key, so at most one partner per inquiry. No row = direct. |
| `lead_referral_events` | Append-only history: `created` (public code), `corrected`, `removed`, with actor, reason, time. |
| `lead_submission_keys` | Idempotency key -> payload digest -> the one stored inquiry. |

Database-level guards (hold even if the service layer is bypassed): a code can only be inserted active for an eligible partner; the only permitted update is active -> revoked; codes are never deleted; credit can only be inserted or reassigned to an eligible partner, and only through a live code owned by that partner; events cannot be updated or deleted; a human correction must carry a reason; and an `AFTER UPDATE OF stage` trigger revokes any still-active code when a partner leaves `active_partner`.

**Before deploying:** back up the SQLite file (after a clean shutdown, or including the `-wal` file), rehearse the restore, and run this migration against a copy first. The v2.1 binary refuses to start on a v3 database, so rolling back means restoring the backup, not just redeploying the old image.

## Codes

`gcp_` + 24 base64url characters (`crypto.randomBytes(18)`, 144 bits). Format rules live in one place: `public/js/lib/referral-code.js`. Comparison is exact and case-sensitive. A code is an attribution marker, not a credential. Its value appears only in authenticated admin responses — never in the audit log, the partner timeline, the referral history or the server log (those carry the `RC-…` record id).

Links are returned as `/apply.html?ref=<code>`. They are made absolute only from `GCP_PUBLIC_ORIGIN` (alias `PUBLIC_BASE_URL`), which must be a bare `https://` origin (`http://` for localhost only) or the server refuses to start. `Host` / `X-Forwarded-Host` are never used.

## API

Public — `POST /api/inquiries` (existing fields unchanged)

- Optional `referralCode`, `submissionId` (UUID or 16–64 chars of `A-Za-z0-9_-`).
- Response is the existing lead receipt plus `referralAttribution: { recorded: true|false }`. No partner name, id, score or contact.
- Unknown, revoked, malformed, array-valued or ineligible-partner code: `422`, `code: "referral_unavailable"`, nothing stored. No code = normal direct inquiry.
- Same `submissionId` + same canonical request: `200`, header `Idempotent-Replay: true`, the original receipt, nothing new stored. Checked before the code is re-validated, so a retry still succeeds after the link is revoked. The receipt is pinned to submission-time state, so a retry cannot read later review activity.
- Same `submissionId` + different request: `409`, `code: "submission_conflict"`.
- Requests without `submissionId` are accepted as before and are not deduplicated.

Admin (session required; CSRF token on every POST)

| Route | Result |
|---|---|
| `GET /api/admin/iso/organizations/:id/referral-codes` | `{ eligibility, activeCode, codes[] }` |
| `POST /api/admin/iso/organizations/:id/referral-codes` | `201 { created: true, code }`; repeat `200 { created: false, code }` (same code, no new audit event); ineligible `422` |
| `POST /api/admin/iso/organizations/:id/referral-codes/rotate` `{ reason }` | `201 { rotated, revoked, code }` — revoke + issue in one transaction |
| `POST /api/admin/iso/referral-codes/:id/revoke` `{ reason }` | `200 { revoked: true|false, code }` — repeat is a no-op |
| `GET /api/admin/iso/organizations/:id/referrals?page&pageSize&from&to` | `{ items[{ leadId, receivedAt, merchantStage, method, attributedAt }], page, pageSize (≤100), total, summary }` |
| `GET /api/admin/iso/analytics?from&to` | existing object plus `referrals` |
| `GET /api/admin/leads?referredBy=<isoId>|direct` | existing leads, each with `referral: { isoOrganizationId, isoDisplayName, method, attributedAt } | null` |
| `GET /api/admin/leads/:id/referral` | `{ referral: { current, original, history[] } }` |
| `POST /api/admin/leads/:id/referral` `{ isoOrganizationId | null, reason, requestId? }` | `{ changed, referral }` |

Reasons are 10+ non-whitespace characters. A correction target must be eligible *now*; removal to direct is always allowed; assigning the value already in effect returns `changed: false` and appends nothing. Each real change appends one history event and writes an audit row for the inquiry and for each affected partner.

Leaving `active_partner` (to `engaged`, `disqualified` or `archived`) revokes the active code in the same transaction as the stage change, recorded as `system:<reviewer>` / `partner_stage_changed`. If the revocation cannot be written the stage change rolls back. Reactivation never revives a code and never issues one; a reviewer issues a new one deliberately. Inquiries already credited keep their attribution.

## Analytics

Counts of stored rows only, computed in SQL, by **current effective credit** and the inquiry's `received_at` (UTC): `totalMerchantInquiries`, `referredInquiries`, `directOrUnattributedInquiries`, and per partner `attributedInquiries`, `merchantStageBreakdown` (all six stages, zeros included), `reviewReadyCount` (not an approval), `simulatedHandoffCount` (not funded), `partnerShareOfSubmissions` (`null` when there are no inquiries in the window), `newReferralsByDay`. Clicks, conversion, close rate, funded amount, revenue and commissions are returned as `null` under `notMeasured` because nothing records them.

## Files

New: `server/referral-store.mjs`, `server/tx.mjs`, `public/js/lib/referral-code.js`, `tests/referral-tracking.test.js`.
Changed: `server/migrations.mjs` (migration 3 appended), `server/db.mjs`, `server/app.mjs`, `server/inquiry.mjs`, `server/iso-routes.mjs`, `server/iso-store.mjs` (shared transaction helper, stage-change hook, timeline helper), `server/config.mjs`, `package.json`, `.env.example`, `tests/iso-migrations-and-hardening.test.js` (schema version 2 -> 3 expectations only).

## Verification

`npm test`: 118 passing (the 101 existing tests plus 17 new). `npm run check`: clean. The new suite covers the §12.9 matrix except the two UI rows: migration 2 -> 3 on a populated v2.1 database, rollback, repeat startup, old binary refusing the new schema; every ineligible stage refused; issue/rotate/revoke; stage-linked revocation and its rollback; direct vs referred; UTM independence; malformed/unknown/revoked/array codes with no partial rows; replay, conflict, replay after revocation, restart, real-process SIGTERM + retry; corrections and immutability; concurrent retries, issuance and rotation; 401/403 on every new route; no code value in logs or audit; analytics.

## Open items

1. **Gate B (UI) is not built.** Until then a referral link works only if the `ref` value is sent as `referralCode` by the client; the shipped `/apply.html` does not read `ref` yet, so opening a referral link today produces a direct inquiry. `landing.js` still forwards the raw query string. `readReferralParam()` in `public/js/lib/referral-code.js` is ready for that work.
2. **Rate limiting still trusts the first `X-Forwarded-For` value** (pre-existing, documented in v2.1). Must be fixed before any public launch.
3. **A link proves nothing about a real referral agreement.** Anyone holding it can attribute a demo inquiry. Do not hang compensation, data sharing or privileged treatment on it.
4. Proposed defaults in the spec that were implemented as written and still await owner confirmation: issuance is a manual admin action; rotation requires a reason; corrections may only target a currently eligible partner; codes do not expire on a timer.
5. Submission keys are kept indefinitely; a retention policy needs legal review before any real-data mode.
6. Single shared admin account, no MFA/RBAC — unchanged from v2.1.
