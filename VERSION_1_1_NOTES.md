# Greenwich Credit Partners v1.1 — Blue & White Redesign

## Reference design choices
- Lockheed Martin OPIM team presentation palette extracted from the original user deck: `#14293B` (navy), `#0F3048` (deep blue), `#147AA8` (blue), `#2BB3CC` (cyan), `#E5F5F9` (pale blue), `#FFFFFF` (white).
- Libertas: confident headline and single prominent entry CTA (inspiration only).
- Lexington Capital Holdings and QualiFi: funding use cases presented as distinct cards (no assertions of offered products).
- Rainbow Advance: straightforward three-step flow, adapted to an inquiry **review**, never an approval promise.

## Changes
- Rebuilt the marketing homepage with responsive hero, fictional profile card, value cards, process steps, explanatory panel, FAQ, and footer.
- Replaced green/teal tokens with exact deck-inspired blue/white palette site-wide.
- Gave application and dashboard blue/white polish; retained untouched JavaScript business logic.
- Maintained 7-question demo intake, validation, synthetic records, source attribution, demo CSV, noindex, and demo restrictions.

## Verification
- `npm test` 27 of 27 passing.
- Static HTML parsed and all local referenced links/assets verified.
- Desktop 1440px and mobile 390px rendered successfully using inline CSS in headless Chromium; no horizontal overflow.
- Full browser routing through localhost was restricted in the test environment, so interactive flow was not retested in-browser in this pass. Existing JS unit tests passed.

## Deployment
- Manual existing-site Netlify: open the site's **Deploys** tab and drag the extracted static site folder into the deploy zone; keep the same site URL.
- `Greenwich_Credit_Partners_v1_1_Netlify.zip` contains only the static `public/` files at its root. Unzip before dragging if your Netlify UI does not accept ZIP directly.
- Do not collect actual merchant information or run paid ads before legal, security, consent, and partner approvals.
