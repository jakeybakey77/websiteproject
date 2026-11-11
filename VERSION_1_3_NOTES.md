# Greenwich Credit Partners v1.3 — qualification workflow and demo analytics

## Added

- **Screening breakdown:** counts by ready for review, needs info and manual clarification, with frequency of each enabled reason-code rule.
- **Source comparison:** for synthetic leads only, count each source and how many inquiries are ready for review or need follow-up.
- **Filters:** select screening result and review-flag code alongside stage/source/search.
- **Review reasons:** choosing `needs_info` or `closed` in the simulated operator workflow now requires a structured operational reason. Reasons are recorded in in-tab history and CSV exports.
- **Recorded activity:** unique reviewer-touched leads, logged stage changes, explicit reviewer transitions to ready-for-handoff, and simulated handoffs. Seeded stages are **not** treated as historical conversion events.
- **Measurement placeholders:** funded, approvals, contact, completed applications, acquisition cost **not tracked** without authorized data.

## Preserved

- Homepage, design, intake questions and campaign attribution from v1.2.
- No actual lender screening/decisions, customer records, secure backend, live ads or CRM connection.
- No new dependencies or external requests.

## Validation

- Automated unit tests: 40 passing.
- Node syntax checks: passed.
- Local HTTP server serves the homepage, inquiry, dashboard and modules.
- Browser automation: blocked by the execution environment's local navigation restriction; **not claimed as passed**.

## Important

The public /admin/ route is a demonstration without authentication, and is inappropriate for real merchant information. Submissions and reviewer annotations are browser-tab-only, synthetic data. A production service requires approval of disclosures, data handling, partner agreements and a secure authenticated backend.
