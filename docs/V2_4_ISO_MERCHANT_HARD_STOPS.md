# v2.4 proposal — ISO merchant hard-stop screening

**Status:** policy/implementation specification only, NOT running code; synthetic/demo only. **Owner approval, legal review, and deployment are not implied.**

## Scope and placement

Implement merchant-level screening for every submitted inquiry, including those attributed to ISO partners. **Do not use these conditions in the ISO A–D scorecard**; do not change partner verification, stage, referral attribution, or partner compensation based on one merchant.

Existing architecture: `public/js/config/validation-rules.js` and `public/js/lib/validation-engine.js` accept only `ready_for_review`, `needs_info`, `manual_review` and intentionally prohibit financing decisions. The current platform accepts synthetic inquiries only and has no bank-document uploads. v2.3 Gate A / Gate B referral work is separate; do not modify in-progress branches or deploy.

## Versioned trigger matrix

| ID | Detection | Immediate response | Reviewer disposition |
| --- | --- | --- | --- |
| `DOC_PERSONAL_STATEMENT` | Synthetic doc metadata or, later, verified account evidence identifies a *personal* checking/savings statement instead of required business banking evidence | `hold_documents`: flag **Personal statement — request business statement**; block handoff | Request acceptable statement or document written policy exception. A sole proprietor / DBA / mixed use or unclear bank title requires review, **not automatic rejection** |
| `MCA_DEFAULT_SUSPECTED` | ISO says merchant defaulted, text mentions default, or parser detects a possible default with an MCA / alternative funder | `hold_risk_review`: flag **Possible funder default — verify**; block handoff | Verify with authorized and reliable evidence; never equate a UCC filing, existing advance, NSF, returned ACH, negative balance, or a funder mention with a confirmed default |
| `MCA_DEFAULT_CONFIRMED` | Authenticated reviewer confirms actual default, citing provider, date, evidence and dispute/resolution status | `policy_ineligible_pending_final_review`: keep handoff blocked | Final authorized reviewer disposition and, if applicable, legally approved adverse-action notice |
| `IND_CANNABIS` | Verified cannabis cultivation, processing, dispensing or other precisely configured cannabis activity | `hold_restricted_industry` | Review policy/jurisdiction; do not infer from generic CBD/hemp or unrelated references |
| `IND_TRUCKING` | Verified freight trucking/hauling (including owner-operators where policy says so) | `hold_restricted_industry` | Review written restriction; **not** all transportation, logistics, warehousing, courier or passenger businesses |
| `IND_LEGAL` | Verified law practice / legal representation services | `hold_restricted_industry` | Review written restriction; **not** all professional services or legal software businesses |

**Initial policy requested:** cannabis, trucking/freight, law practices are restricted categories. Define exact inclusion boundaries, funder coverage, and permitted exceptions with underwriting owner and counsel. Never claim every lender excludes them. Distinguish *instant internal flags* from *final external denials*. Industry rules should be independently enable/disable-able and versioned.

## Engine, data and controls

1. Create a separate `merchant-screening` config, pure evaluator and API representation. Preserve current `validation-engine.js` limitation on approval/denial. Combine multiple flags rather than overwriting earlier findings. Add `not_checked` for missing evidence; do not assert `clear` without review.
2. Capture rule ID/version, evidence source, document/page pointer when applicable, redacted excerpt, extraction confidence, timestamp, actor, review outcome, reason and immutable override history. An ISO assertion is never automatically verified evidence.
3. Immediately hold a referred or direct submission where available structured evidence indicates risk. Server-side handoff guard must refuse transition to `ready_for_handoff` or `handed_off` if a hard stop remains unresolved. A documented, role-gated reviewer override (dual approval for confirmed-default or restricted-industry exceptions) is auditable and cannot be performed by an ISO.
4. Do not map the existing broad form values `transportation` or `professional` to restricted trucking or legal service. Add granular subtypes and/or verifiable NAICS descriptors. Ambiguity routes to manual review.
5. Keep document uploads **disabled** in the existing demo. Later, before accepting real statements: authorized collection, malware scanning, MIME and magic-byte verification, encryption, bounded OCR/extraction jobs, redacted logs, RBAC/MFA, private storage, retention/deletion, legal disclosure and incident procedures. Personal account titles may be legitimate for sole proprietors; classifier confidence is never final adjudication.
6. Expose reviewer-facing **Flags**, **Underwriting checks**, evidence, resolution actions and **Handoff blocked** in the merchant admin. External/ISO-facing statuses should stay neutral until an approved communications policy exists; never expose raw banking details or unverified default allegations to partners.
7. Add **new forward-only SQLite migration after v3**, never rewrite migrations 1-3. Update backup/migrate/restore rehearsal. Avoid changes to Gate B referral API contracts and preserve the original attribution and history.
8. No real credit or financing decision, approval, rejection message, SMS/email, funder transmission, or Railway deployment without explicit authorization and legal review. Depending on actual financing product and jurisdiction, ECOA / Regulation B or other commercial-financing requirements may apply. Specific principal adverse-action reasons must be supportable: https://www.consumerfinance.gov/compliance/circulars/circular-2022-03-adverse-action-notification-requirements-in-connection-with-credit-decisions-based-on-complex-algorithms/

## Tests / acceptance

- Personal statement -> immediate document hold; business statement -> no personal-document flag; sole proprietor/DBA and ambiguous bank title -> review; never flag fraud by inference.
- Active MCA balance, UCC filing, ordinary NSF/returned ACH or unverified allegation -> **not confirmed default**. Reviewer-verified actual default -> candidate ineligible, immutable evidence and blocked handoff.
- Exact cannabis/freight trucking/law firm -> restricted flag; broad transportation/professional/other unrelated business -> no automatic restricted classification.
- Multiple simultaneous flags persist; clearing document issue does not erase independently verified default.
- Referral origin unchanged, original/current attribution unaffected, no ISO score/tier mutation.
- Admin/API guards survive direct endpoint calls, restarts, incomplete evidence, duplicate processing and unauthorized override attempts.
- Existing Gate A/B regression, unit tests, `npm test` and `npm run check` pass with synthetic fixtures; no live merchant data or documents.
- UI is keyboard-accessible and displays all reasons and review actions.

## Execution sequence

**Phase A, now:** Wait until Gate B is stable; implement **synthetic-only** structured rules, audit, server-side handoff guard, reviewer UI and regression tests in a new feature PR. No deploy.

**Phase B, after security/legal approvals:** Secure document collection, typed statement classification and extracted evidence; run shadow-mode measurement for false positives and review burden.

**Phase C, separately authorized:** Actual underwriting dispositions, reviewer approvals and compliant external communication. A document or AI model's flag cannot itself generate an applicant denial.

**Completion:** PR must show changed files, schema upgrade/rollback rehearsal, rule and exception test results, and a clear inventory of implemented vs pending capabilities. No production changes without explicit approval.
