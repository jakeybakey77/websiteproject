# Version 2.0 notes

## Objective

Move the Greenwich Credit Partners funnel from browser-only demo storage to a server-owned workflow while keeping the approved public design and synthetic-data constraint.

## Major changes

1. Added Node 22 HTTP application and SQLite persistence.
2. Replaced `sessionStorage` lead/review persistence with server APIs.
3. Added authenticated admin login and protected `/admin/*` namespace.
4. Added CSRF protection for review mutations and logout.
5. Moved inquiry validation and workflow enforcement to server authority.
6. Added CSP, security headers, request-body limits, and basic rate limits.
7. Added audit records for login, demo submission, logout, and review changes.
8. Kept live collection disabled and enforced built-in fictional identities.
9. Added server/API integration tests and restart-persistence coverage.

## Production limitations

This remains a synthetic demo. Password login is appropriate only for this prototype; production should use MFA/SSO, roles, managed secrets/storage, formal retention/deletion controls, monitoring, and completed legal/privacy/consent review.
