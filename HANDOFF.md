# Greenwich Credit Partners v2.1 Handoff

## Current state

A server-backed demo MVP is implemented. The public layout is intentionally unchanged from the approved v1.x blue-and-white design.

### Implemented

- Persistent SQLite demo lead storage
- Authenticated `/admin/` route
- HttpOnly/SameSite session cookies
- CSRF on admin mutations
- Server-side inquiry validation
- Server-side review/stage enforcement
- Server-side screening results returned to dashboard
- Login/submission/review audit events
- CSP and baseline security headers
- Basic login/submission rate limiting
- UTM source / medium / campaign persistence
- Synthetic sample-data seeding
- v2.1: ISO partner demo application (`/partners.html`), ISO CRM (`/admin/iso.html`), CSV import with duplicate review, evidence-led vetting, versioned A-D partner-priority score, ISO analytics, schema migrations

### Deliberately disabled

- Real merchant contact data
- Bank statements/documents
- Automated credit/funding decisions
- Funder handoff
- CRM integrations
- Live lead collection
- Real ISO/partner data, scraping, enrichment, outreach or email of any kind
- Any use of partner-priority scores in merchant screening

`GCP_DEMO_MODE=false` disables public submissions; it does not enable a live mode.

## Verification

Run:

```bash
npm test
npm run check
```

See `VERSION_2_1_NOTES.md` for the v2.1 changes (ISO Partner Intelligence module, migrations, deployment-readiness fixes, caveats). Rerun the commands above for a current test count; do not rely on a recorded one.

## Deployment implication

The old Netlify Drop workflow is no longer sufficient because v2.0 requires a Node process and persistent SQLite disk. Deploy the project to a Node/Docker host and configure production secrets in environment variables.

Railway: not deployed and not verified. Mount a volume at `/data`, set `ADMIN_PASSWORD` (12+ chars) and `SESSION_SECRET` (32+ chars), keep `GCP_DEMO_MODE=true`, and set the healthcheck path to `/healthz`. Build the Docker image once locally before deploying; it was not built in the v2.1 session.
