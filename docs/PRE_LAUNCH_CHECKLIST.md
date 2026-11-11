# Pre-launch checklist

The v2.0 demo now has a server-side persistence/authentication baseline, but the checklist below remains the gate for collecting real inquiries.

This is an engineering checklist, not legal advice. Laws named here are pointers for a
conversation with a lawyer who works in commercial financing. The list is not complete,
and rules in this area vary by state and change often.

## Legal review

- [ ] Confirm what the business legally is (lead generator, broker, something else) and
      whether that role needs registration or a licence in each state it markets to.
      Several states regulate commercial financing brokers and sales-based financing.
- [ ] Confirm which state commercial-financing disclosure laws apply, and who owes the
      disclosure: the funder, the business, or both.
- [ ] Review all marketing copy for deceptive-practice risk (FTC Act and state
      equivalents). No "guaranteed", no unsupported speed or amount claims, no calling a
      product a loan when it is not one. Substantiate every claim that stays.
- [ ] Review the "not a lender" and "does not involve a credit check" statements against
      what the live service will actually do.
- [ ] Write the compensation disclosure: how the business is paid and by whom.
- [ ] Review the preliminary validation rules, and any criteria a funder supplies, for
      fair-lending risk (ECOA and Regulation B, and state law). Document who approved
      each rule. Confirm whether small-business lending data rules affect the business
      or its funder partners.
- [ ] Decide which states to accept inquiries from, then configure the `service-area`
      rule and the landing page to match.
- [ ] Terms of Use, and a trademark check on the final brand name.
- [ ] Replace every yellow "Placeholder" block on the site.

## Privacy

- [ ] Privacy Policy that matches what is actually collected, why, who receives it and
      how long it is kept.
- [ ] Check which privacy laws apply (state consumer-privacy laws, and whether GLBA
      reaches the business through its funder relationships).
- [ ] Data map: every field, where it is stored, who can see it, when it is deleted.
- [ ] Retention and deletion schedule, and a process for access and deletion requests.
- [ ] Collect the minimum. The form deliberately asks for no SSN, bank login or
      documents; keep it that way unless counsel and a funder agreement require more.
- [ ] No real applicant data in browser storage, logs, analytics or error reports.
- [ ] Breach response plan.

## Consent

- [ ] Reviewed consent language on the form for being contacted by phone, text and
      email (TCPA and state equivalents, CAN-SPAM, do-not-call rules).
- [ ] Separate, explicit consent to share the inquiry with funding providers, naming
      them or describing them as counsel advises.
- [ ] Store a consent record with each inquiry: the exact wording shown, its version,
      the time, and the page it was given on.
- [ ] A working way to withdraw consent and opt out, honoured in the CRM and by funders.
- [ ] Cookie or tracking consent if analytics or ad pixels are added.

## Security

- [~] Demo backend exists with server-side validation, request limits, CSP and basic in-memory rate limiting. Production still needs hosted HTTPS, stronger bot protection and security review.
- [~] Demo dashboard now requires server-side password authentication and has session timeouts. Production still needs MFA/SSO, role-based access and deployment review.
- [ ] Encrypt data in transit and at rest. Keep secrets out of the repository.
- [~] Demo audit table records logins, submissions, logouts and review changes. Production still needs view/export coverage, retention, monitoring and user roles.
- [x] Server sends baseline security headers including a same-origin Content Security Policy. Re-evaluate the policy as integrations are added.
- [ ] Backups, tested restores, dependency and vulnerability scanning once dependencies
      exist.
- [ ] Independent security review before launch.

## CRM and funder integrations

- [ ] Signed agreement with each funder before any inquiry is sent to them, covering
      permitted use, security, resale and return of outcome data.
- [ ] Hand off only inquiries with a stored sharing consent, only the agreed fields,
      over an authenticated channel, with a delivery record.
- [ ] CRM integration through its official API with least-privilege credentials.
      Agree the field mapping and which system is the source of truth for stage.
- [ ] Funder eligibility criteria, if used, come from the funder in writing and go
      through legal review before entering `validation-rules.js`.
- [ ] Conversion reporting uses outcomes reported by funders. Decide what is stored and
      for how long.
- [ ] Vendor review and data-processing terms for every service that touches inquiry
      data (hosting, CRM, email, SMS, analytics).

## Accessibility and quality

- [ ] Accessibility audit against WCAG 2.2 AA with real assistive technology. The demo
      was built to that standard but has not been audited.
- [ ] Cross-browser and device testing, including older phones.
- [ ] End-to-end browser tests in CI once a backend exists.
- [ ] Remove the dashboard link from the public footer and the `noindex` tags from the
      public pages when, and only when, everything above is done.
