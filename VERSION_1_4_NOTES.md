# Greenwich Credit Partners v1.4 — Opus review remediation

## Fixes

1. **Review stage transitions.** `ALLOWED_TRANSITIONS` in `public/js/config/pipeline.js` restricts stage changes. A simulated handoff only follows `ready_for_handoff`; a closed lead cannot be reopened in the demo. A flagged lead can be marked ready only with the explicit screening-exception reason and a reviewer note; simulated handoff preserves the documented exception. All changes are demo operational workflow, never financing decisions.
2. **Analytics provenance.** Event-based ever-reached figures are distinct from current synthetic stage snapshot counts; durable per-lead timestamps preserve ever-reached facts if review history is truncated. Seeded stage labels do not count as real historic conversions.
3. **UTM attribution.** `utm_source` unknown values remain normalized and group into Other/unrecognized; `direct` is only used if the parameter is absent. `utm_medium` is captured and exported.
4. **Seed integrity.** All five sample needs-info / closed records have valid follow-up reasons; note-only updates are preserved.
5. **Fail-closed rule configuration.** Enabled `allowedValues` rules cannot have empty values lists; enabled `requiredFields` rules cannot have empty fields lists.

**Additional demo hardening:** Session review overlays are restricted to workflow-annotation fields when merged with sample lead records. This does not provide production security.

## Verification

- `npm test`: 48/48 tests passed, including new regression tests for transitions, exceptions, history truncation, UTM buckets, missing seeded reasons, and empty rule lists.
- JavaScript syntax validated with `node --check`.
- Static route and archive checks performed.
- Browser end-to-end testing **not completed**: this runtime's Chromium navigation is blocked by administrator policy.
- `public/index.html` (homepage) is byte-identical to v1.3.

## Production blockers (not fixed here)

- Public `/admin/` must be separated from the deploy and protected by authentication before it can show real inquiries.
- Client validation, workflow transition guards and screening rules must be enforced by a secure server.
- Real merchant contact information requires consent, privacy documentation, protected storage, retention controls and legal review.
- CSP and production security headers should be reviewed and applied with a deployment-specific test.
- Actual contact, application, funded and cost-per-funded-merchant metrics require genuine authorized event data.
