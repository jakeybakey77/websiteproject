# Greenwich Credit Partners MVP v2.1

Server-backed demonstration of a small-business funding inquiry funnel.

**Status:** synthetic/demo data only. This is not a lender, does not make financing decisions, does not collect real merchant contact details, and does not hand inquiries to funders.

## What changed from v1.4

v1.4 was a static browser-only demo. v2.0 moves the workflow behind a small Node server:

- SQLite persists demo inquiries and reviewer actions across browser tabs and server restarts.
- `/admin/` is protected by a server-side login.
- Auth sessions use random tokens in `HttpOnly`, `SameSite=Strict` cookies.
- Admin mutations require a CSRF token.
- Inquiry validation and review-stage rules run on the server; client checks are only UX.
- Security headers include a same-origin Content Security Policy.
- Login and demo-submission endpoints have basic in-memory rate limits.
- Login/review/submission events are written to an audit table.
- The existing blue-and-white public design and inquiry flow are retained.

The backend intentionally **does not have a live-data mode**. Setting `GCP_DEMO_MODE=false` disables public submission instead of enabling real collection.

## Architecture

```text
Browser
  |
  |  GET public pages / JS / CSS
  |  POST /api/inquiries (fictional demo identities only)
  v
Node 22 HTTP server
  |-- server-side field validation
  |-- preliminary screening / stage rules
  |-- admin authentication + CSRF
  |-- audit events
  v
SQLite database
  |-- leads
  |-- sessions
  `-- audit_log
```

No npm dependencies are required. v2.0 uses Node's built-in `node:sqlite` module.

## Requirements

- Node.js **22.13+**
- A writable disk location for the SQLite database

## Run locally

### Fastest local demo

1. Extract the project.
2. Open a terminal in the project folder.
3. Run:

```bash
npm start
```

If `ADMIN_PASSWORD` and `SESSION_SECRET` are not configured in local development, the server generates temporary values and prints the temporary admin password in the terminal.

Open:

- Public site: `http://localhost:4173/`
- Inquiry: `http://localhost:4173/apply.html`
- Admin login: `http://localhost:4173/admin/login.html`

The database is stored at `data/gcp.sqlite` by default.

### Recommended local configuration

Copy `.env.example` to `.env`, then replace the placeholder secrets.

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<long random password>
SESSION_SECRET=<at least 32 random characters>
COOKIE_SECURE=false
```

Do not commit `.env`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `GCP_DEMO_MODE` | `true` | Must stay `true` for this build; `false` disables submissions |
| `SEED_SAMPLE_LEADS` | `true` | Seed fictional dashboard records only when DB is empty |
| `GCP_DB_PATH` | `data/gcp.sqlite` | SQLite path; production should point to persistent disk |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | generated locally / required in production | Admin password |
| `SESSION_SECRET` | generated locally / required in production | Password-derivation/session secret |
| `SESSION_TTL_HOURS` | `8` | Session lifetime |
| `COOKIE_SECURE` | `true` in production | Adds the `Secure` cookie attribute |
| `MAX_BODY_BYTES` | `65536` | JSON body limit |

When `NODE_ENV=production`, the server refuses to start unless `ADMIN_PASSWORD` and `SESSION_SECRET` are explicitly supplied.

## Server-owned workflow

### Public demo submission

`POST /api/inquiries`

The server:

1. validates every configured form step again,
2. refuses contact identities other than the built-in fictional demo identities,
3. normalizes UTM attribution,
4. stores the inquiry in SQLite,
5. writes an audit event.

### Admin authentication

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`

The session cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` in production configuration.

### Admin data

- `GET /api/admin/leads`
- `POST /api/admin/leads/:id/review`
- `GET /api/admin/audit`

All admin API routes require a valid session. Review mutations also require a CSRF token. The server independently enforces stage transitions, required operational reasons, and screening-exception rules.

## Testing

```bash
npm test
npm run check
```

The suite covers client validation, screening rules, funnel analytics, authentication, CSRF, server-side inquiry validation, persistence, stage controls, CSP headers, and alternate admin-route access.

## Deployment

This version **cannot be deployed as a plain Netlify Drop ZIP**. Netlify Drop serves static files; v2.0 needs a running Node process plus persistent writable storage for SQLite.

Use a Node/Docker host with a persistent disk. The included `Dockerfile` is suitable as a baseline.

For a hosted demo, configure at minimum:

```text
NODE_ENV=production
ADMIN_USERNAME=<your username>
ADMIN_PASSWORD=<long unique password>
SESSION_SECRET=<long random secret>
COOKIE_SECURE=true
GCP_DEMO_MODE=true
GCP_DB_PATH=/data/gcp.sqlite
```

Mount a persistent disk at `/data` (or change `GCP_DB_PATH`). Without persistent storage, records disappear whenever the hosting instance is replaced.

Your current Netlify v1.x site can remain online as the static preview until v2.0 is deployed to a server host.

## Security boundary

v2.0 is materially safer than the browser-only demo, but it is **not production-ready for real merchant information**.

Still required before live collection:

- legal/privacy/consent review,
- real contact fields and versioned consent records,
- MFA or SSO and role-based access,
- TLS termination on the production host,
- encrypted/managed persistent storage and backup/restore procedures,
- retention/deletion controls,
- stronger bot/abuse protection,
- security monitoring and independent review,
- authorized CRM/funder agreements and integrations.

See `docs/PRE_LAUNCH_CHECKLIST.md` and `docs/SECURITY_NOTES.md`.

## ISO Partner Intelligence (v2.1)

A second, parallel funnel for ISO / broker / referral-partner records. It shares the admin login, CSRF, audit log and security headers with the merchant funnel and nothing else: separate endpoint, tables, stages and scoring. See `VERSION_2_1_NOTES.md` for the full change list, API table and caveats.

- Public demo form: `/partners.html` -> `POST /api/iso/applications` (built-in fictional organizations only).
- Admin workspace: `/admin/iso.html` -> `/api/admin/iso/*` (session required; CSRF token on every POST).
- CSV import with preview, row-level rejects, replay protection and a human duplicate-review queue. Sample file: `public/samples/iso-partners-sample.csv`.
- Evidence-led vetting with separate *relationship stage* and *business verification* state.
- Versioned, explainable A-D partner-priority score (`server/iso-scoring.mjs`). It is a ranking aid for reviewers. It is not a credit score and is never read by the merchant workflow.
- Schema migrations: `server/migrations.mjs` (a v2.0 database upgrades in place).

Not included, by design: scraping, enrichment, email or any outreach, bank data, funder submission, funding decisions.
