# Security notes — v2.0 demo backend

## Controls implemented in the demo

- Server-owned SQLite records rather than browser storage
- Authentication required for all `/api/admin/*` routes
- Entire `/admin/*` namespace protected except the login page
- Random opaque session token; only its SHA-256 hash is stored in SQLite
- `HttpOnly`, `SameSite=Strict` session cookie; `Secure` when configured for production
- CSRF token required for authenticated state-changing API calls
- Server-side validation of form data and workflow transitions
- Request JSON size limit
- Basic in-memory rate limiting for login and demo submission endpoints
- Content Security Policy and related browser security headers
- Audit table for key workflow/authentication events
- Production startup refuses missing admin password or session secret

## Not a production security claim

This project has not undergone penetration testing or independent security review. It does not implement MFA/SSO, multiple user roles, account recovery, managed secret rotation, database encryption/key management, centralized logging, backup/restore automation, WAF/bot services, or incident monitoring.

Do not enable real merchant data until those needs and the legal/privacy/consent requirements are addressed.
