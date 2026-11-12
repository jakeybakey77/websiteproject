# v2.3 Gate B — frontend contract for Codex

**Branch:** `feat/v2.3-iso-referral-tracking` (v2.2 redesign `12d2977` + v2.3 referral backend, merged).
**Status of the frontend today:** no referral UI exists. Verified on the merged branch:

- `public/js/pages/apply.js` reads only `utm_*` (`parseAttribution`). It never reads `ref`, sends no `referralCode` and no `submissionId`. Opening `/apply.html?ref=<code>` and submitting creates a **direct** inquiry.
- `public/js/services/lead-service.js` posts `{ answers, identity, source, medium, campaign }` and throws `new Error(body.error)`, discarding the HTTP status and `body.code`.
- `apply.js` `send()` catches every failure with one generic message ("Reload the page and try again").
- `public/js/pages/landing.js` copies the whole `location.search` onto every `a[data-carry-query]`, so a `ref` value is forwarded to `/apply.html` **and** to `/partner-program.html` / `/partners.html`.
- `dashboard.js` and `iso-admin.js` ignore the new API fields. The ISO timeline shows the new activity types by their raw names (`referral_code_issued`, `referral_code_revoked`, `referral_code_rotated`).

Gate B is frontend only. **Do not change** anything under `server/`, the migration, or the API shapes below. Do not deploy. Synthetic data only.

## Rules that must hold

1. The browser never decides credit. It passes the code through; the server decides. Never send an ISO id, name or UTM value as attribution.
2. No `ref` = normal direct inquiry, exactly as today.
3. A repeated or malformed `ref` is an error state. Never pick one value, never silently drop it.
4. Never show the applicant a partner name, id, score, tier or contact. Never promise faster or preferential treatment.
5. Keep the code out of `localStorage`/`sessionStorage`, analytics, and `console`. Hold it in module memory only.
6. `public/js/pages/apply.js`, `dashboard.js` and `public/js/services/lead-service.js` must not import or mention `iso-pipeline`, `iso-store`, `iso-scoring` or `iso_organizations` (an existing test enforces this). Use the helper below, which is allowed.

## Shared helper (already on the branch — use it, do not re-implement)

`public/js/lib/referral-code.js`

```js
readReferralParam(new URLSearchParams(location.search))
// { status: 'none' } | { status: 'ok', code } | { status: 'invalid', reason: 'multiple' | 'malformed' }
isWellFormedReferralCode(value)   // /^gcp_[A-Za-z0-9_-]{24}$/, case-sensitive
referralPath(code)                // '/apply.html?ref=<code>'
REFERRAL_PARAM                    // 'ref'
```

## 1. Merchant application — `apply.html`, `apply.js`, `lead-service.js`, `apply.css`

**Request** — `POST /api/inquiries`, existing fields unchanged, plus:

```json
{ "referralCode": "gcp_…24 chars…", "submissionId": "<crypto.randomUUID()>" }
```

- Omit `referralCode` entirely for a direct inquiry (do not send `""`; it is rejected).
- Always send `submissionId`. Generate it once when the user first presses Submit, keep it in memory, and **reuse the same value** for every retry of that same application. Generate a new one only if the user edits an answer or deliberately removes the referral. A page reload starts a new submission.

**Responses**

| Status | Body | UI |
|---|---|---|
| `201` | lead receipt + `referralAttribution: { recorded: true \| false }` | Confirmation. If `recorded` is true add the line **"Referral recorded"**. Nothing else about the partner. |
| `200` + header `Idempotent-Replay: true` | the same receipt as the original `201` | Treat exactly as success. |
| `422`, `code: "referral_unavailable"` | `{ error, code }` | Show the referral error state (below). Keep all answers. |
| `422` with `fieldErrors` | existing validation shape | Existing behaviour. |
| `409`, `code: "submission_conflict"` | `{ error, code }` | Generate a new `submissionId` and let the user submit again. |
| `429`, `503`, `5xx`, network failure | existing | Keep answers, allow retry **with the same `submissionId`**. |

`lead-service.js` must surface `status` and `code` (for example `Object.assign(new Error(body.error), { status: response.status, code: body.code, fieldErrors: body.fieldErrors })`) and return the parsed body on both `200` and `201`.

**States to build (v2.2 components and tokens only)**

| State | Trigger | Content |
|---|---|---|
| Detected | `readReferralParam` → `ok` | Neutral banner: **"Referral link detected (demo)"**. |
| Invalid on load | `readReferralParam` → `invalid` | Error banner explaining the link is not valid, with the button **"Remove referral and continue directly"**. Submitting is blocked until the user chooses. |
| Rejected on submit | `422 referral_unavailable` | Same error banner and the same button. Announce it (`role="alert"`), move focus to it. |
| Removed | user presses the button | Drop the code from memory, remove `ref` from the address bar with `history.replaceState` (keep `utm_*`), remove the banner, new `submissionId`. The next submit is a direct inquiry. |
| Recorded | success with `recorded: true` | "Referral recorded" on the confirmation. |

Removal is always an explicit user action. The form must never fall back to direct by itself.

## 2. Query forwarding — `landing.js`

Replace the raw `destination.search = location.search` copy. Build with `URL`/`searchParams`:

- Forward `utm_source`, `utm_medium`, `utm_campaign` to every `data-carry-query` link as today.
- Forward `ref` **only** to links whose path is `/apply.html` or `/` (home). Do not forward it to `/partner-program.html` or `/partners.html`.
- Forward `ref` only when `readReferralParam` returns `ok`. If it returns `invalid`, forward the original `ref` values unchanged to `/apply.html` so that page shows the error state; never reduce two values to one.

## 3. Merchant admin — `admin/index.html`, `dashboard.js`, `admin-service.js`

**Data**

- `GET /api/admin/leads` → each lead now has `referral: { isoOrganizationId, isoDisplayName, method: 'public_code' | 'manual', attributedAt } | null`. Optional server filter `?referredBy=<isoId>` or `?referredBy=direct`.
- `GET /api/admin/leads/:id/referral` → `{ referral: { leadId, current, original, history[] } }`
  - `current`: `{ isoOrganizationId, isoDisplayName, method, referralCodeId, firstAttributedAt, updatedAt, updatedBy } | null`
  - `original`: `{ isoOrganizationId, isoDisplayName, referralCodeId, method: 'public_code', at } | null` (the public-link credit, if there ever was one)
  - `history[]`: `{ id, eventType: 'created' | 'corrected' | 'removed', oldIsoOrganizationId, oldIsoDisplayName, newIsoOrganizationId, newIsoDisplayName, referralCodeId, actor, reason, at }`, oldest first
- `POST /api/admin/leads/:id/referral` with `{ isoOrganizationId: "<id>" | null, reason, requestId? }` → `{ changed: boolean, replayed?: true, referral }`. `422` for a reason under 10 non-whitespace characters, an unknown target, or a target that is not currently active + verified. `403` without the CSRF token.

**UI**

- **"Referred by"** column: partner name, or **"Direct / unattributed"**. Sortable and filterable. Rows stay clickable and keyboard-operable.
- Partner name links to `/admin/iso.html#org=<isoOrganizationId>`.
- Lead detail card: current credit, original credit, attribution date, full history (actor, reason, time).
- Correction action: choose an eligible partner or "Remove attribution", reason required (10+ characters), confirm. Populate the partner picker from `GET /api/admin/iso/organizations?stage=active_partner&verification=verified`. Send a `requestId` (`crypto.randomUUID()`) and reuse it on retry. On `changed: false` show "No change".
- CSV export: if "Referred by" is added, pass values through the existing `csvCell` helper.

## 4. ISO admin — `admin/iso.html`, `iso-admin.js`, `iso-service.js`

**Data** (all under `/api/admin/iso`)

| Call | Response |
|---|---|
| `GET /organizations/:id/referral-codes` | `{ eligibility: { eligible, stage, verificationStatus }, activeCode, codes[] }`; code = `{ id, status, code, referralUrl, createdBy, createdAt, revokedBy, revokedAt, revokeReason }`; `referralUrl` is `null` for a revoked code |
| `POST /organizations/:id/referral-codes` | `201 { created: true, code }` / `200 { created: false, code }` / `422` when not eligible |
| `POST /organizations/:id/referral-codes/rotate` `{ reason }` | `201 { rotated, revoked, code }` |
| `POST /referral-codes/:codeId/revoke` `{ reason }` | `200 { revoked: true \| false, code }` |
| `GET /organizations/:id/referrals?page&pageSize&from&to` | `{ items[{ leadId, receivedAt, merchantStage, method, attributedAt }], page, pageSize, total, summary, notes, notMeasured }` |
| `GET /analytics?from&to` | existing object + `referrals` |

`summary`: `attributedInquiries`, `totalMerchantInquiries`, `partnerShareOfSubmissions` (number or `null`), `merchantStageBreakdown` (all six stages), `reviewReadyCount`, `simulatedHandoffCount`, `newReferralsByDay[{ date, count }]`.

**UI** — a **Referrals** tab on the organization detail:

- Eligible: **Issue demo referral link** (or the active link with **Copy**, **Rotate**, **Revoke**). Rotate and Revoke need a reason.
- Not eligible: disabled actions plus the reason ("Available only while the partner is Active and Verified"). The score/tier must not appear here.
- `referralUrl` may be relative. For display and copy use `new URL(referralUrl, location.origin).href`.
- Issuance history table (status, created, revoked by / when / why).
- Inquiry table (id, received date, merchant stage) with paging from `total`; inquiry id links to the merchant admin.
- Counts labelled **"Synthetic demo"**. `partnerShareOfSubmissions === null` renders as **"No data"**, never `0%`. Label `reviewReadyCount` "not an approval" and `simulatedHandoffCount` "simulated, not funded".
- Do not add clicks, conversion, close rate, funded, revenue or commission figures. The API returns them as `null` under `notMeasured`.
- Add `ACTIVITY_LABELS` for `referral_code_issued`, `referral_code_revoked`, `referral_code_rotated`.
- After a stage change away from Active partner, reload the tab: the server has already revoked the link.

## Acceptance for Gate B

- Home with `?ref=<valid>&utm_source=meta_ads` → Apply → submit → confirmation shows "Referral recorded"; merchant admin shows the partner under "Referred by"; ISO Referrals tab lists the inquiry. Still true after a server restart.
- No `ref` → identical to today's flow.
- `?ref=a&ref=b`, a malformed `ref`, and a revoked code each show the error state; "Remove referral and continue directly" then produces a direct inquiry.
- Double-clicking Submit, or retrying after a dropped connection, produces one inquiry.
- Keyboard-only and screen-reader passes on the new banner, button, column, tab and dialogs; screenshots reviewed against the v2.2 Figma file.
- `npm test` and `npm run check` pass; add a browser smoke test for both paths.
- Diff touches only `public/` (and tests/docs). No `server/` changes.
