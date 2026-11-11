# Greenwich Credit Partners v2.0 Handoff

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

### Deliberately disabled

- Real merchant contact data
- Bank statements/documents
- Automated credit/funding decisions
- Funder handoff
- CRM integrations
- Live lead collection

`GCP_DEMO_MODE=false` disables public submissions; it does not enable a live mode.

## Verification

Run:

```bash
npm test
npm run check
```

See `VERSION_2_0_NOTES.md` for the final recorded test count and packaging verification.

## Deployment implication

The old Netlify Drop workflow is no longer sufficient because v2.0 requires a Node process and persistent SQLite disk. Deploy the project to a Node/Docker host and configure production secrets in environment variables.
