// HTTP integration tests for the ISO Partner Intelligence module, run against a
// real server and a real SQLite file in a temp directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_IDENTITIES } from '../public/js/data/demo-identities.js';
import { ISO_DEMO_IDENTITIES } from '../public/js/data/iso-demo-identities.js';
import { CURRENT_RULES_VERSION } from '../server/iso-scoring.mjs';
import { SAMPLE_CSV, csvUpload, isoApplication, login, merchantInquiry, start, submitIsoApplication } from './helpers/server.js';

const ISO = '/api/admin/iso';
const orgs = async (admin, query = '') => (await admin.get(`${ISO}/organizations${query}`)).body.organizations;
const detail = async (admin, id) => (await admin.get(`${ISO}/organizations/${id}`)).body;

/** Adds one evidence item and confirms it. Returns the organization detail. */
async function confirmEvidence(admin, id, category, extra = {}) {
  const added = await admin.post(`${ISO}/organizations/${id}/evidence`, { category, sourceType: 'registry', url: 'https://registry.example/entity/42', title: 'Fictional registry entry', claim: `Fictional ${category} claim.`, observedOn: '2026-10-15', ...extra });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  const reviewed = await admin.post(`${ISO}/evidence/${added.body.evidenceId}/review`, { status: 'confirmed', notes: 'Checked against the fictional registry record.' });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  return reviewed.body;
}

test('both demo intakes work end to end into their own secured CRM records', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const leadsBefore = (await admin.get('/api/admin/leads')).body.leads;

  // Merchant inquiry -> merchant lead.
  const merchantRes = await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merchantInquiry(DEMO_IDENTITIES[0])) });
  assert.equal(merchantRes.status, 201);
  const lead = await merchantRes.json();
  assert.match(lead.id, /^DEMO-/);

  // Partner application -> ISO organization, via its own endpoint.
  const partner = await submitIsoApplication(base);
  assert.equal(partner.status, 201, JSON.stringify(partner.body));
  assert.match(partner.body.reference, /^ISO-/);
  assert.deepEqual(Object.keys(partner.body).sort(), ['demo', 'organizationName', 'receivedAt', 'reference', 'status'], 'the public receipt exposes no score, tier or internal state');

  // Each record is only in its own CRM.
  const leadsAfter = (await admin.get('/api/admin/leads')).body.leads;
  assert.equal(leadsAfter.length, leadsBefore.length + 1);
  assert.ok(leadsAfter.some((l) => l.id === lead.id));
  assert.ok(!leadsAfter.some((l) => l.id === partner.body.reference || l.businessName === ISO_DEMO_IDENTITIES[0].organizationName));
  const list = await orgs(admin);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, partner.body.reference);
  assert.ok(!list.some((o) => o.displayName === lead.businessName));

  // Merchant leads carry no partner score fields, and the ISO record carries no merchant fields.
  const merchantKeys = Object.keys(leadsAfter.find((l) => l.id === lead.id));
  for (const key of ['score', 'tier', 'computedTier', 'scoreRulesVersion']) assert.ok(!merchantKeys.includes(key), key);
  for (const key of ['monthlyRevenue', 'amountRequested', 'validation']) assert.ok(!(key in list[0]), key);

  const d = await detail(admin, partner.body.reference);
  assert.equal(d.organization.stage, 'applied');
  assert.equal(d.organization.demo, true);
  assert.equal(d.organization.acquisitionSource, 'public_application');
  assert.equal(d.organization.verificationStatus, 'unverified');
  assert.equal(d.organization.domain, 'sample-harbor-capital.example');
  assert.deepEqual(d.organization.attribution, { source: 'linkedin', medium: 'social', campaign: 'partner-demo' });
  assert.equal(d.contacts.length, 1);
  assert.equal(d.contacts[0].email, ISO_DEMO_IDENTITIES[0].email);
  // What the applicant said is stored as assertion, never as confirmed fact.
  assert.ok(d.evidence.length >= 2);
  assert.ok(d.evidence.every((e) => e.status === 'asserted' && e.sourceType === 'self_reported' && e.reviewedBy === null));
  assert.equal(d.scoreBreakdown.rulesVersion, CURRENT_RULES_VERSION);
  assert.equal(d.organization.score, d.scoreBreakdown.score);
  assert.ok(d.audit.some((e) => e.action === 'iso_application_created' && e.actor === 'public-demo'));

  // The general audit trail records both intakes, each against its own entity.
  const audit = (await admin.get('/api/admin/audit')).body.events;
  assert.ok(audit.some((e) => e.action === 'demo_inquiry_created' && e.leadId === lead.id && e.isoOrganizationId === null));
  assert.ok(audit.some((e) => e.action === 'iso_application_created' && e.isoOrganizationId === partner.body.reference && e.leadId === null));
});

test('partner application rejects real or altered identities, bad answers and oversized bodies; stores nothing', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const expectRejected = async (payload, status, pattern) => {
    const res = await submitIsoApplication(base, payload);
    assert.equal(res.status, status, JSON.stringify(res.body));
    if (pattern) assert.match(res.body.error, pattern);
    return res;
  };
  const real = isoApplication();
  real.identity = { organizationName: 'Actual Brokerage LLC', website: 'https://actual-brokerage.com', contactName: 'Pat Real', contactRole: 'Owner', email: 'pat@actual-brokerage.com', phone: '(212) 867-5309' };
  await expectRejected(real, 422, /built-in fictional organizations/);
  const tampered = isoApplication();
  tampered.identity.email = 'someone.real@gmail.com';
  await expectRejected(tampered, 422, /built-in fictional organizations/);
  const mixed = isoApplication();
  mixed.identity.contactName = ISO_DEMO_IDENTITIES[1].contactName;
  await expectRejected(mixed, 422, /built-in fictional organizations/);
  await expectRejected({ ...isoApplication(), identity: undefined }, 422);
  // The merchant demo identities are not valid partner identities.
  await expectRejected({ ...isoApplication(), identity: DEMO_IDENTITIES[0] }, 422);

  const noAck = await expectRejected(isoApplication(0, { demoAcknowledged: false }), 422, /validation failed/);
  assert.ok(noAck.body.fieldErrors.demoAcknowledged);
  const bad = await expectRejected(isoApplication(0, { relationshipType: 'direct_lender', region: 'ZZ', specializations: ['crypto'], referralVolume: 'lots', yearsActive: 5 }), 422);
  assert.deepEqual(Object.keys(bad.body.fieldErrors).sort(), ['referralVolume', 'region', 'relationshipType', 'specializations', 'yearsActive']);
  await expectRejected(isoApplication(0, { relationshipType: 'unknown' }), 422);
  await expectRejected(isoApplication(0, { specializations: [] }), 422);
  await expectRejected([], 400);
  const big = await fetch(`${base}/api/iso/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...isoApplication(), pad: 'x'.repeat(70 * 1024) }) });
  assert.equal(big.status, 413);
  const notJson = await fetch(`${base}/api/iso/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(notJson.status, 400);

  assert.equal((await orgs(admin)).length, 0);
  assert.equal((await fetch(`${base}/api/iso/applications`)).status, 404, 'no public read of applications');
});

test('demo mode off closes the partner intake instead of opening real collection', async (t) => {
  const { base } = await start(t, { overrides: { demoMode: false } });
  const res = await submitIsoApplication(base);
  assert.equal(res.status, 503);
  assert.match(res.body.error, /Live collection is disabled/);
  const admin = await login(base);
  assert.equal((await orgs(admin)).length, 0);
});

test('a repeat partner application is kept separate and flagged, never merged', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const first = await submitIsoApplication(base);
  const second = await submitIsoApplication(base);
  assert.notEqual(first.body.reference, second.body.reference);
  assert.equal((await orgs(admin)).length, 2);
  const d = await detail(admin, second.body.reference);
  assert.deepEqual(d.possibleDuplicates.map((p) => [p.organizationId, p.matchType]), [[first.body.reference, 'exact_domain']]);
  assert.equal(d.contacts.length, 1);
  assert.equal((await detail(admin, first.body.reference)).contacts.length, 1, 'the earlier record was not modified');
});

test('ISO admin API requires a session for every route and a CSRF token for every mutation', async (t) => {
  const { base } = await start(t);
  const { body: receipt } = await submitIsoApplication(base);
  const id = receipt.reference;
  const admin = await login(base);

  const reads = ['/organizations', `/organizations/${id}`, '/analytics', '/imports', '/export.csv', '/score-rules', '/imports/IMP-NOPE'];
  for (const path of reads) {
    const res = await fetch(`${base}${ISO}${path}`);
    assert.equal(res.status, 401, path);
    assert.doesNotMatch(await res.text(), /Sample Harbor/);
  }
  const writes = [
    [`/organizations/${id}/stage`, { stage: 'research_needed' }], [`/organizations/${id}/verification`, { status: 'in_review' }], [`/organizations/${id}/assign`, { reviewer: 'reviewer' }],
    [`/organizations/${id}/contacts`, { name: 'Sam Sample' }], [`/organizations/${id}/evidence`, { category: 'red_flag', sourceType: 'analyst_note', claim: 'x' }],
    [`/organizations/${id}/activities`, { type: 'note', body: 'x' }], [`/organizations/${id}/score/recalculate`, {}], [`/organizations/${id}/score/override`, { tier: 'A', justification: 'because I said so' }],
    [`/organizations/${id}/score/override/clear`, { justification: 'because I said so' }], ['/evidence/1/review', { status: 'confirmed', notes: 'looks fine to me' }], ['/contacts/1/status', { status: 'invalid' }],
    ['/activities/1/complete', {}], ['/imports/preview', csvUpload(SAMPLE_CSV)], ['/imports', csvUpload(SAMPLE_CSV)], ['/import-rows/1/resolve', { decision: 'skip', note: 'not needed at all' }],
  ];
  for (const [path, payload] of writes) {
    assert.equal((await admin.post(`${ISO}${path}`, payload, { withCookie: false })).status, 401, `no session: ${path}`);
    assert.equal((await admin.post(`${ISO}${path}`, payload, { csrf: null })).status, 403, `no CSRF: ${path}`);
    assert.equal((await admin.post(`${ISO}${path}`, payload, { csrf: 'forged-token' })).status, 403, `forged CSRF: ${path}`);
  }
  // Nothing changed.
  const d = await detail(admin, id);
  assert.equal(d.organization.stage, 'applied');
  assert.equal(d.organization.tierOverridden, false);
  assert.equal(d.contacts.length, 1);
  assert.equal((await orgs(admin)).length, 1);
  assert.equal((await admin.get(`${ISO}/imports`)).body.imports.length, 0);

  // A logged-out session can no longer read or write.
  await admin.post('/api/auth/logout');
  assert.equal((await admin.get(`${ISO}/organizations`)).status, 401);
  assert.equal((await admin.post(`${ISO}/organizations/${id}/stage`, { stage: 'research_needed' })).status, 401);

  const methods = await login(base);
  assert.equal((await methods.call('DELETE', `${ISO}/organizations/${id}`)).status, 405);
  assert.equal((await methods.get(`${ISO}/organizations/ISO-DOES-NOT-EXIST`)).status, 404);
  assert.equal((await methods.post(`${ISO}/organizations/ISO-DOES-NOT-EXIST/stage`, { stage: 'research_needed' })).status, 404);

  // The admin page itself is behind the session too.
  assert.equal((await fetch(`${base}/admin/iso.html`, { redirect: 'manual' })).status, 303);
  const page = await fetch(`${base}/admin/iso.html`, { headers: { Cookie: methods.cookie } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
});

test('stage transitions and verification gates are enforced on the server', async (t) => {
  const { base } = await start(t);
  const id = (await submitIsoApplication(base)).body.reference;
  const admin = await login(base);
  const stage = (payload) => admin.post(`${ISO}/organizations/${id}/stage`, payload);
  const verify = (payload) => admin.post(`${ISO}/organizations/${id}/verification`, payload);
  const rejected = async (promise, pattern) => { const res = await promise; assert.equal(res.status, 422, JSON.stringify(res.body)); assert.match(res.body.error, pattern); };

  await rejected(stage({ stage: 'active_partner' }), /cannot move from "applied" to "active_partner"/);
  await rejected(stage({ stage: 'outreach_ready' }), /cannot move/);
  await rejected(stage({ stage: 'applied' }), /already in that stage/);
  await rejected(stage({ stage: 'funded' }), /not a recognized value/);
  await rejected(stage({}), /not a recognized value/);

  assert.equal((await stage({ stage: 'research_needed' })).body.organization.stage, 'research_needed');
  assert.equal((await stage({ stage: 'under_review', note: 'Starting desk review.' })).status, 200);

  // "verified" stage needs verified status; verified status needs confirmed identity evidence.
  await rejected(stage({ stage: 'verified' }), /Business verification must be marked "verified"/);
  await rejected(verify({ status: 'verified', note: 'Looks legitimate to me.' }), /at least one independently confirmed identity item/);
  assert.equal((await verify({ status: 'in_review' })).status, 200);

  // Self-reported statements cannot confirm themselves.
  const selfReported = (await detail(admin, id)).evidence.find((e) => e.category === 'official_domain');
  await rejected(admin.post(`${ISO}/evidence/${selfReported.id}/review`, { status: 'confirmed', notes: 'Applicant said so on the form.' }), /independent source/);
  await rejected(admin.post(`${ISO}/evidence/${selfReported.id}/review`, { status: 'confirmed', notes: 'short' }), /at least 10 characters/);
  await rejected(admin.post(`${ISO}/evidence/${selfReported.id}/review`, { status: 'asserted', notes: 'Back to asserted please.' }), /confirmed or refuted/);
  await rejected(verify({ status: 'verified', note: 'Still nothing confirmed.' }), /independently confirmed identity/);

  await confirmEvidence(admin, id, 'business_identity');
  await rejected(verify({ status: 'verified', note: 'short' }), /Describe what was verified/);

  // A confirmed red flag blocks verification until it is resolved.
  const flag = await admin.post(`${ISO}/organizations/${id}/evidence`, { category: 'red_flag', sourceType: 'analyst_note', claim: 'Fictional complaint pattern noted for the demo.' });
  await admin.post(`${ISO}/evidence/${flag.body.evidenceId}/review`, { status: 'confirmed', notes: 'Confirmed in the fictional source.' });
  await rejected(verify({ status: 'verified', note: 'Registry entry matches the organization.' }), /confirmed red flag/);
  await admin.post(`${ISO}/evidence/${flag.body.evidenceId}/review`, { status: 'refuted', notes: 'On a second look this was a different entity.' });

  const verified = await verify({ status: 'verified', note: 'Registry entry matches the organization.' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.organization.verificationStatus, 'verified');
  assert.equal(verified.body.organization.stage, 'under_review', 'verification status and relationship stage are separate');

  assert.equal((await stage({ stage: 'verified' })).status, 200);
  await rejected(stage({ stage: 'contacted' }), /cannot move from "verified" to "contacted"/);
  assert.equal((await stage({ stage: 'outreach_ready' })).body.organization.stage, 'outreach_ready');
  await rejected(verify({ status: 'failed', note: 'Changed my mind about this one.' }), /Move the organization out of "outreach_ready"/);

  // Disqualification needs a recognized reason and a written note.
  await rejected(stage({ stage: 'disqualified' }), /note of at least 10 characters/);
  await rejected(stage({ stage: 'disqualified', note: 'Not a fit for the program.' }), /Disqualification reason is not a recognized value/);
  const dq = await stage({ stage: 'disqualified', note: 'Not a fit for the program.', reason: 'out_of_scope' });
  assert.equal(dq.body.organization.stage, 'disqualified');
  assert.equal(dq.body.organization.disqualifyReason, 'out_of_scope');
  await rejected(stage({ stage: 'outreach_ready', note: 'Putting it straight back.' }), /cannot move from "disqualified"/);
  await rejected(stage({ stage: 'research_needed' }), /note of at least 10 characters/);
  const reopened = await stage({ stage: 'research_needed', note: 'Reopened after new information.' });
  assert.equal(reopened.body.organization.disqualifyReason, '');

  // Every change is in the record's own history and in the audit log, with the actor.
  const d = await detail(admin, id);
  const changes = d.activity.filter((a) => a.type === 'stage_change').map((a) => `${a.detail.from}>${a.detail.to}`).reverse();
  assert.deepEqual(changes, ['applied>research_needed', 'research_needed>under_review', 'under_review>verified', 'verified>outreach_ready', 'outreach_ready>disqualified', 'disqualified>research_needed']);
  assert.ok(d.activity.every((a) => a.actor && a.at));
  assert.equal(d.audit.filter((e) => e.action === 'iso_stage_changed' && e.actor === 'reviewer').length, 6);
  assert.equal(d.audit.filter((e) => e.action === 'iso_verification_changed').length, 2);
});

test('evidence, contacts and notes validate input and stay synthetic-only', async (t) => {
  const { base } = await start(t);
  const id = (await submitIsoApplication(base)).body.reference;
  const admin = await login(base);
  const rejected = async (path, payload, pattern) => { const res = await admin.post(`${ISO}${path}`, payload); assert.equal(res.status, 422, JSON.stringify(res.body)); assert.match(res.body.error, pattern); };
  const evidence = { category: 'business_identity', sourceType: 'registry', claim: 'Fictional registry lists the entity.' };

  await rejected(`/organizations/${id}/evidence`, { ...evidence, url: 'https://real-registry.gov/entity/1' }, /reserved domain/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, url: 'javascript:alert(1)' }, /reserved domain/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, category: 'vibes' }, /Evidence category/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, claim: '' }, /Claim is required/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, claim: 'x'.repeat(501) }, /at most 500/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, observedOn: '2026-02-30' }, /valid date/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, observedOn: '2999-01-01' }, /future/);
  await rejected(`/organizations/${id}/evidence`, { ...evidence, claim: { $ne: 1 } }, /must be text/);
  // New evidence can never be created already-confirmed.
  const sneaky = await admin.post(`${ISO}/organizations/${id}/evidence`, { ...evidence, status: 'confirmed', reviewedBy: 'someone' });
  assert.equal(sneaky.status, 201);
  assert.equal(sneaky.body.evidence.find((e) => e.id === sneaky.body.evidenceId).status, 'asserted');

  await rejected(`/organizations/${id}/contacts`, { name: 'Pat Real', email: 'pat@realbroker.com' }, /Real addresses are not accepted/);
  await rejected(`/organizations/${id}/contacts`, { name: 'Pat Real', phone: '(212) 867-5309' }, /Real numbers are not accepted/);
  await rejected(`/organizations/${id}/contacts`, {}, /at least a name, email or phone/);
  const contact = await admin.post(`${ISO}/organizations/${id}/contacts`, { name: 'Sam Sample', role: 'Analyst', email: 'Sam.Sample@Example.org', phone: '203.555.0190' });
  assert.equal(contact.status, 201);
  assert.deepEqual(contact.body.contacts.at(-1).email, 'sam.sample@example.org');
  assert.equal(contact.body.contacts.at(-1).phone, '(203) 555-0190');
  await rejected(`/contacts/${contact.body.contactId}/status`, { status: 'deleted' }, /Contact status/);
  assert.equal((await admin.post(`${ISO}/contacts/${contact.body.contactId}/status`, { status: 'do_not_contact' })).body.contacts.at(-1).status, 'do_not_contact');

  await rejected(`/organizations/${id}/activities`, { type: 'email_sent', body: 'Sent the intro email.' }, /"note" or "follow_up"/);
  await rejected(`/organizations/${id}/activities`, { type: 'follow_up', body: 'Check registry again.' }, /Due date is required/);
  const follow = await admin.post(`${ISO}/organizations/${id}/activities`, { type: 'follow_up', body: 'Check registry again.', dueOn: '2026-12-01' });
  assert.equal(follow.status, 201);
  assert.equal((await orgs(admin))[0].openFollowUps, 1);
  assert.equal((await admin.post(`${ISO}/activities/${follow.body.activityId}/complete`)).status, 200);
  assert.equal((await admin.post(`${ISO}/activities/${follow.body.activityId}/complete`)).status, 422);
  assert.equal((await orgs(admin))[0].openFollowUps, 0);

  await rejected(`/organizations/${id}/assign`, { reviewer: 'someone@realcompany.com' }, /internal username/);
  assert.equal((await admin.post(`${ISO}/organizations/${id}/assign`, { reviewer: 'reviewer' })).body.organization.assignedReviewer, 'reviewer');
  assert.equal((await orgs(admin, '?reviewer=reviewer')).length, 1);
  assert.equal((await orgs(admin, '?reviewer=unassigned')).length, 0);
});

test('scores are versioned, explained, recalculated only on change, and overrides keep full history', async (t) => {
  const { base } = await start(t);
  const id = (await submitIsoApplication(base)).body.reference;
  const admin = await login(base);
  const initial = await detail(admin, id);
  const startScore = initial.organization.score;
  assert.equal(initial.scoreHistory.length, 1);
  assert.equal(initial.scoreBreakdown.factors.length, 6);
  assert.equal(initial.scoreBreakdown.factors.reduce((sum, f) => sum + f.points, 0), startScore);
  assert.ok(initial.scoreBreakdown.factors.flatMap((f) => f.reasons).some((r) => r.code === 'IDENTITY_DOMAIN_ASSERTED_ONLY'));
  assert.ok(initial.scoreBreakdown.factors.flatMap((f) => f.reasons).some((r) => r.code === 'IDENTITY_BUSINESS_MISSING' && r.points === 0));

  // Manual recalculation with no change appends nothing.
  const noop = await admin.post(`${ISO}/organizations/${id}/score/recalculate`);
  assert.equal(noop.body.scoreChanged, false);
  assert.equal(noop.body.scoreHistory.length, 1);

  // Confirmed evidence raises the score and appends a snapshot with the rule version.
  const after = await confirmEvidence(admin, id, 'business_identity');
  assert.ok(after.organization.score > startScore);
  assert.ok(after.scoreHistory.every((s) => s.rulesVersion === CURRENT_RULES_VERSION && s.kind === 'computed' && /^[0-9a-f]{64}$/.test(s.inputsDigest)));
  assert.ok(after.scoreHistory.length >= 2);
  const computedScore = after.organization.score;
  const computedTier = after.organization.computedTier;
  const evidenceBefore = JSON.stringify(after.evidence);
  const historyBefore = after.scoreHistory.length;

  // Override rules.
  const override = (payload) => admin.post(`${ISO}/organizations/${id}/score/override`, payload);
  assert.equal((await override({ tier: 'A' })).status, 422);
  assert.equal((await override({ tier: 'A', justification: 'trust me' })).status, 422);
  assert.equal((await override({ tier: 'S', justification: 'Strategic relationship noted by the partnerships lead.' })).status, 422);
  const overridden = await override({ tier: 'A', justification: 'Strategic relationship noted by the partnerships lead.' });
  assert.equal(overridden.status, 200);
  const o = overridden.body.organization;
  assert.equal(o.tier, 'A');
  assert.equal(o.tierOverridden, true);
  assert.equal(o.computedTier, computedTier, 'computed tier is preserved beside the override');
  assert.equal(o.score, computedScore, 'override does not rewrite the computed score');
  assert.equal(o.override.by, 'reviewer');
  assert.equal(JSON.stringify(overridden.body.evidence), evidenceBefore, 'override does not touch evidence');
  assert.equal(overridden.body.scoreHistory.length, historyBefore + 1);
  const top = overridden.body.scoreHistory[0];
  assert.deepEqual([top.kind, top.tier, top.effectiveTier, top.actor, top.score], ['override', computedTier, 'A', 'reviewer', computedScore]);
  assert.match(top.justification, /Strategic relationship/);
  assert.equal((await orgs(admin, '?tier=A')).length, 1, 'list filters on the effective tier');

  // New evidence still recomputes underneath an override; the override stays until cleared.
  const more = await confirmEvidence(admin, id, 'commercial_relevance');
  assert.ok(more.organization.score > computedScore);
  assert.equal(more.organization.tier, 'A');
  assert.equal(more.organization.tierOverridden, true);
  assert.equal(more.scoreHistory.find((s) => s.kind === 'computed').effectiveTier, 'A');

  assert.equal((await admin.post(`${ISO}/organizations/${id}/score/override/clear`, { justification: 'no' })).status, 422);
  const cleared = await admin.post(`${ISO}/organizations/${id}/score/override/clear`, { justification: 'Override no longer needed after new evidence.' });
  assert.equal(cleared.body.organization.tierOverridden, false);
  assert.equal(cleared.body.organization.tier, cleared.body.organization.computedTier);
  assert.equal(cleared.body.scoreHistory[0].kind, 'override_cleared');
  assert.equal((await admin.post(`${ISO}/organizations/${id}/score/override/clear`, { justification: 'Clearing it a second time.' })).status, 422);
  // The earlier override is still in history, unedited.
  assert.ok(cleared.body.scoreHistory.some((s) => s.kind === 'override' && s.effectiveTier === 'A' && /Strategic relationship/.test(s.justification)));
  assert.ok(cleared.body.audit.some((e) => e.action === 'iso_score_overridden' && e.detail.overrideTier === 'A'));
  assert.ok(cleared.body.audit.some((e) => e.action === 'iso_score_override_cleared'));

  const rules = await admin.get(`${ISO}/score-rules`);
  assert.equal(rules.body.currentVersion, CURRENT_RULES_VERSION);
  assert.equal(rules.body.rules.factors.reduce((sum, f) => sum + f.max, 0), 100);
});

test('CSV import: preview writes nothing; commit creates records; replays and duplicates never create or merge', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);

  const preview = await admin.post(`${ISO}/imports/preview`, csvUpload(SAMPLE_CSV));
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(preview.body.preview.summary, { totalRows: 3, accepted: 3, rejected: 0, duplicateReview: 0, replayed: 0 });
  assert.equal(preview.body.preview.mapping.region, 'state');
  assert.equal(preview.body.preview.alreadyImported, null);
  assert.equal((await orgs(admin)).length, 0, 'preview is a dry run');
  assert.equal((await admin.get(`${ISO}/imports`)).body.imports.length, 0);

  const first = await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV));
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.replayed, false);
  assert.deepEqual([first.body.batch.totalRows, first.body.batch.acceptedRows, first.body.batch.rejectedRows, first.body.batch.duplicateRows], [3, 3, 0, 0]);
  const imported = await orgs(admin, '?sort=name&dir=asc');
  assert.deepEqual(imported.map((o) => o.displayName), ['Demo Quarry Brokers', 'Fictional Orchard Referrals, Inc.', 'Sample Meadow Capital']);
  assert.ok(imported.every((o) => o.stage === 'imported' && o.acquisitionSource === 'csv_import' && o.verificationStatus === 'unverified' && o.importBatchId === first.body.batch.id && Number.isInteger(o.score)));
  assert.deepEqual(imported.map((o) => o.contactCount), [1, 0, 1]);
  const meadow = await detail(admin, imported[2].id);
  assert.equal(meadow.organization.domain, 'sample-meadow-capital.example');
  assert.equal(meadow.contacts[0].phone, '(203) 555-0181');
  assert.ok(meadow.evidence.every((e) => e.status === 'asserted' && e.sourceType === 'csv_import'), 'imported statements are assertions');

  // Exact replay of the same file: same batch back, nothing new.
  const replay = await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV, 'renamed-copy.csv'));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.batch.id, first.body.batch.id);
  assert.equal(replay.body.batch.replayCount, 1);
  assert.equal((await orgs(admin)).length, 3);
  assert.equal((await admin.get(`${ISO}/imports`)).body.imports.length, 1);
  assert.deepEqual((await admin.post(`${ISO}/imports/preview`, csvUpload(SAMPLE_CSV))).body.preview.alreadyImported.batchId, first.body.batch.id);

  // A different file that repeats old rows and adds lookalikes.
  const second = [
    'organization_name,legal_name,website,state,specializations,relationship_type,contact_name,contact_role,contact_email,contact_phone',
    SAMPLE_CSV.split('\r\n')[1],                                                                                        // row 2: identical row replayed
    'Sample Meadow Capital Group,,https://sample-meadow-capital.example,CT,,iso,Lee Fictional,Analyst,lee.fictional@example.com,(203) 555-0183', // row 3: same domain
    'DEMO QUARRY BROKERS LLC,,,NY,,broker,,,,',                                                                          // row 4: same name key
    'Fictional Orchard Referals Inc,,,NJ,,referral_partner,,,,',                                                         // row 5: near name
    'Placeholder Summit Finance,,placeholder-summit.example,MA,sba,iso,,,,',                                             // row 6: new
    'placeholder summit finance inc,,,MA,,iso,,,,',                                                                      // row 7: duplicate of row 6 in this file
    'Real Leak Brokers,,,NY,,broker,Pat Real,Owner,pat@realbroker.com,(212) 867-5309',                                   // row 8: real identity
    '=HYPERLINK("http://evil.test"),,,,,,,,,',                                                                           // row 9: formula
  ].join('\n');
  const p2 = (await admin.post(`${ISO}/imports/preview`, csvUpload(second))).body.preview;
  assert.deepEqual(p2.summary, { totalRows: 8, accepted: 1, rejected: 2, duplicateReview: 4, replayed: 1 });
  assert.equal(p2.rows.find((r) => r.rowNumber === 8).organizationName, '[withheld]', 'preview does not echo a suspected real identity');

  const commit = await admin.post(`${ISO}/imports`, csvUpload(second, 'second.csv'));
  assert.equal(commit.status, 201, JSON.stringify(commit.body));
  const batch = commit.body.batch;
  assert.deepEqual([batch.totalRows, batch.acceptedRows, batch.rejectedRows, batch.duplicateRows, batch.replayedRows], [8, 1, 2, 4, 1]);
  assert.equal((await orgs(admin)).length, 4, 'only the one genuinely new organization was created');

  const rows = (await admin.get(`${ISO}/imports/${batch.id}`)).body.rows;
  const byRow = Object.fromEntries(rows.map((r) => [r.rowNumber, r]));
  assert.deepEqual(rows.map((r) => r.status), ['replayed', 'duplicate_review', 'duplicate_review', 'duplicate_review', 'accepted', 'duplicate_review', 'rejected', 'rejected']);
  assert.deepEqual([byRow[3].matchType, byRow[4].matchType, byRow[5].matchType, byRow[7].matchType], ['exact_domain', 'exact_name', 'near_name', 'exact_name']);
  assert.equal(byRow[3].matchedOrganizationId, imported[2].id);
  assert.equal(byRow[7].matchedOrganizationId, byRow[6].organizationId, 'in-file duplicate points at the record created from the earlier row');
  // Rejected rows keep reasons but not the raw values.
  assert.deepEqual(byRow[8].data, {});
  assert.ok(byRow[8].errors.some((e) => e.code === 'not_synthetic'));
  assert.ok(byRow[9].errors.some((e) => e.code === 'formula_like_value'));
  assert.doesNotMatch(JSON.stringify((await admin.get(`${ISO}/imports/${batch.id}`)).body), /realbroker|867-5309|Pat Real|HYPERLINK/);
  // The matched records were not modified by the import.
  const meadowAfter = await detail(admin, imported[2].id);
  assert.equal(meadowAfter.organization.displayName, 'Sample Meadow Capital');
  assert.equal(meadowAfter.contacts.length, 1);
  assert.equal(meadowAfter.organization.updatedAt, meadow.organization.updatedAt);

  // Duplicate review queue: a human decides.
  const queue = (await admin.get(`${ISO}/imports`)).body.duplicateReview;
  assert.equal(queue.length, 4);
  assert.equal(queue[0].matchedName, 'Sample Meadow Capital');
  const resolve = (rowId, payload) => admin.post(`${ISO}/import-rows/${rowId}/resolve`, payload);
  assert.equal((await resolve(byRow[3].id, { decision: 'merge', note: 'Just merge these two please.' })).status, 422, 'there is no merge decision');
  assert.equal((await resolve(byRow[3].id, { decision: 'attach_contact' })).status, 422, 'a note is required');
  assert.equal((await resolve(byRow[8].id, { decision: 'create_separate', note: 'Force the rejected row in.' })).status, 422, 'rejected rows cannot be resolved into records');

  const attached = await resolve(byRow[3].id, { decision: 'attach_contact', note: 'Same firm; new analyst contact only.' });
  assert.equal(attached.status, 200, JSON.stringify(attached.body));
  assert.equal(attached.body.row.status, 'resolved_contact_attached');
  const meadowAttached = await detail(admin, imported[2].id);
  assert.equal(meadowAttached.contacts.length, 2);
  assert.equal(meadowAttached.organization.displayName, 'Sample Meadow Capital', 'organization fields are not overwritten by the duplicate row');
  assert.equal((await resolve(byRow[4].id, { decision: 'attach_contact', note: 'Try to attach a contact here.' })).status, 422, 'row has no contact to attach');

  const separate = await resolve(byRow[5].id, { decision: 'create_separate', note: 'Different firm with a similar name.' });
  assert.equal(separate.body.row.status, 'resolved_created');
  assert.equal((await orgs(admin)).length, 5);
  const created = await detail(admin, separate.body.row.organizationId);
  assert.equal(created.organization.displayName, 'Fictional Orchard Referals Inc');
  assert.equal(created.possibleDuplicates[0].matchType, 'near_name', 'the lookalike stays visible on the record');

  assert.equal((await resolve(byRow[4].id, { decision: 'skip', note: 'Same organization, nothing new.' })).body.row.status, 'resolved_skipped');
  assert.equal((await resolve(byRow[4].id, { decision: 'skip', note: 'Same organization, nothing new.' })).status, 422, 'a row is resolved once');
  assert.equal((await admin.get(`${ISO}/imports`)).body.duplicateReview.length, 1);
  assert.equal((await orgs(admin)).length, 5);

  const audit = (await admin.get('/api/admin/audit')).body.events.map((e) => e.action);
  for (const action of ['iso_import_committed', 'iso_import_replayed', 'iso_import_duplicate_resolved', 'iso_organization_imported']) assert.ok(audit.includes(action), action);
});

test('CSV import rejects unsafe uploads as a whole and commits nothing', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const commit = (payload) => admin.post(`${ISO}/imports`, payload);
  assert.equal((await commit({ filename: 'x.csv', contentBase64: Buffer.from([0x6e, 0x0a, 0xff, 0xfe]).toString('base64') })).status, 422);
  assert.equal((await commit(csvUpload('name\n"unterminated'))).status, 422);
  assert.equal((await commit(csvUpload('first,second\nA,B'))).status, 422, 'no organization-name column');
  assert.equal((await commit(csvUpload(SAMPLE_CSV, 'x.csv', { contactEmail: 'nope' }))).status, 422);
  assert.equal((await commit({ filename: 'x.csv' })).status, 400);
  assert.equal((await commit(csvUpload(`organization_name\n${Array.from({ length: 501 }, (_, i) => `Sample Org ${i}`).join('\n')}`))).status, 422);
  assert.equal((await commit(csvUpload(`organization_name,notes\n${'x'.repeat(300 * 1024)},y`))).status, 413);
  const huge = await admin.post(`${ISO}/imports`, { filename: 'x.csv', contentBase64: 'A'.repeat(600 * 1024) });
  assert.equal(huge.status, 413);
  assert.equal((await orgs(admin)).length, 0);
  assert.equal((await admin.get(`${ISO}/imports`)).body.imports.length, 0);

  // A hostile filename is neutralized, not stored verbatim.
  const ok = await commit(csvUpload('organization_name\nSample Solo Partners', '../../etc/<script>.csv'));
  assert.equal(ok.status, 201);
  assert.doesNotMatch(ok.body.batch.filename, /[<>/\\]/);
});

test('export is organization-level only and neutralizes formula-leading cells', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV));
  // Simulate a legacy/unsafe stored value to prove the export escapes independently of import checks.
  app.db.raw.prepare("UPDATE iso_organizations SET display_name = '=cmd|calc' WHERE display_name = 'Demo Quarry Brokers'").run();
  const res = await fetch(`${base}${ISO}/export.csv?sort=name&dir=asc`, { headers: { Cookie: admin.cookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const csv = await res.text();
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^"id","displayName","domain"/);
  assert.doesNotMatch(lines[0], /email|phone|contactName/i);
  assert.doesNotMatch(csv, /@example\.|555-01/, 'no contact emails or phones in the export');
  assert.ok(csv.includes('"\'=cmd|calc"'));
  assert.ok((await admin.get('/api/admin/audit')).body.events.some((e) => e.action === 'iso_export_downloaded' && e.detail.contactFieldsIncluded === false));
});

test('analytics report real stored counts, and no-data instead of invented performance', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const empty = (await admin.get(`${ISO}/analytics`)).body.analytics;
  assert.equal(empty.totalOrganizations, 0);
  assert.ok(Object.values(empty.byStage).every((n) => n === 0));
  assert.deepEqual(empty.byTier, { A: 0, B: 0, C: 0, D: 0, unscored: 0 });
  assert.equal(empty.reviewBacklog, 0);
  assert.equal(empty.outreachReady, 0);
  assert.deepEqual([empty.notMeasured.responseToPartnershipConversion, empty.notMeasured.outreachSent], [null, null]);
  assert.match(empty.notMeasured.reason, /Outreach is not enabled/);

  await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV));
  const a = (await submitIsoApplication(base, isoApplication(1))).body.reference;
  await submitIsoApplication(base, isoApplication(2));
  await admin.post(`${ISO}/organizations/${a}/stage`, { stage: 'research_needed' });
  await admin.post(`${ISO}/organizations/${a}/stage`, { stage: 'under_review' });
  await confirmEvidence(admin, a, 'business_identity');
  await admin.post(`${ISO}/organizations/${a}/verification`, { status: 'verified', note: 'Registry entry matches the organization.' });
  await admin.post(`${ISO}/organizations/${a}/stage`, { stage: 'verified' });
  await admin.post(`${ISO}/organizations/${a}/stage`, { stage: 'outreach_ready' });
  await admin.post(`${ISO}/organizations/${a}/assign`, { reviewer: 'reviewer' });
  await admin.post(`${ISO}/organizations/${a}/activities`, { type: 'follow_up', body: 'Overdue fictional follow-up.', dueOn: '2020-01-01' });

  const list = await orgs(admin);
  const stats = (await admin.get(`${ISO}/analytics`)).body.analytics;
  assert.equal(stats.totalOrganizations, 5);
  assert.equal(stats.totalOrganizations, list.length);
  assert.deepEqual([stats.byStage.imported, stats.byStage.applied, stats.byStage.outreach_ready], [3, 1, 1]);
  assert.equal(Object.values(stats.byStage).reduce((s, n) => s + n, 0), 5);
  assert.equal(Object.values(stats.byTier).reduce((s, n) => s + n, 0), 5);
  for (const tier of ['A', 'B', 'C', 'D']) assert.equal(stats.byTier[tier], list.filter((o) => o.tier === tier).length, tier);
  assert.deepEqual(stats.bySource, { public_application: 2, csv_import: 3 });
  assert.deepEqual([stats.byVerification.verified, stats.byVerification.unverified], [1, 4]);
  assert.equal(stats.reviewBacklog, 4);
  assert.equal(stats.unassignedInBacklog, 4);
  assert.equal(stats.outreachReady, 1);
  assert.deepEqual(stats.followUps, { open: 1, overdue: 1 });
  assert.equal(stats.evidence.confirmed, 1);
  assert.equal(stats.evidence.total, stats.evidence.asserted + stats.evidence.confirmed + stats.evidence.refuted);
  assert.deepEqual([stats.imports.batches, stats.imports.rowsAccepted, stats.imports.duplicateReviewPending], [1, 3, 0]);
  assert.equal(stats.notMeasured.responseToPartnershipConversion, null, 'still no data after activity');

  // Filters and search agree with the counts.
  assert.equal((await orgs(admin, '?stage=imported')).length, 3);
  assert.equal((await orgs(admin, '?source=public_application&verification=verified')).length, 1);
  assert.equal((await orgs(admin, '?q=quarry')).length, 1);
  assert.equal((await orgs(admin, '?q=%25')).length, 0, 'LIKE wildcards are escaped');
  assert.equal((await admin.get(`${ISO}/organizations?stage=bogus`)).status, 422);
  assert.equal((await admin.get(`${ISO}/organizations?sort=drop%20table`)).status, 200, 'unknown sort falls back to the default');
});

test('ISO records, scores, imports and sessions survive a server restart; replay stays idempotent', async (t) => {
  const first = await start(t, { cleanup: false });
  const admin = await login(first.base);
  const id = (await submitIsoApplication(first.base)).body.reference;
  await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV));
  await confirmEvidence(admin, id, 'business_identity');
  await admin.post(`${ISO}/organizations/${id}/stage`, { stage: 'research_needed' });
  await admin.post(`${ISO}/organizations/${id}/score/override`, { tier: 'B', justification: 'Known fictional partner from the demo script.' });
  const before = await detail(admin, id);
  const statsBefore = (await admin.get(`${ISO}/analytics`)).body.analytics;
  const merchantBefore = (await admin.get('/api/admin/leads')).body.leads.length;
  await first.close();

  const second = await start(t, { dir: first.dir });
  // The same session cookie is still valid because sessions are stored in SQLite.
  const call = async (method, path, payload) => {
    const res = await fetch(`${second.base}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken }, body: payload ? JSON.stringify(payload) : undefined });
    return { status: res.status, body: await res.json() };
  };
  const after = (await call('GET', `${ISO}/organizations/${id}`)).body;
  assert.equal(after.organization.stage, 'research_needed');
  assert.deepEqual(after.organization, before.organization);
  assert.deepEqual(after.evidence, before.evidence);
  assert.deepEqual(after.scoreHistory, before.scoreHistory);
  assert.deepEqual(after.activity, before.activity);
  assert.equal(after.organization.override.tier, 'B');
  const statsAfter = (await call('GET', `${ISO}/analytics`)).body.analytics;
  assert.deepEqual({ ...statsAfter, generatedAt: '' }, { ...statsBefore, generatedAt: '' });
  assert.equal((await call('GET', '/api/admin/leads')).body.leads.length, merchantBefore, 'merchant seed is not re-inserted');

  const replay = await call('POST', `${ISO}/imports`, csvUpload(SAMPLE_CSV));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal((await call('GET', `${ISO}/organizations`)).body.organizations.length, 4);
  // Recalculating after restart is deterministic: same evidence, same day, no new snapshot.
  assert.equal((await call('POST', `${ISO}/organizations/${id}/score/recalculate`, {})).body.scoreChanged, false);
});

test('a failed import rolls back completely', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  // Force a mid-import failure after rows have been inserted.
  const original = app.db.iso._createFromImportRow;
  let calls = 0;
  app.db.iso._createFromImportRow = function patched(...args) { calls += 1; if (calls === 3) throw new Error('simulated crash mid-import'); return original.apply(this, args); };
  const failed = await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV));
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error, 'Internal server error.', 'internal details are not leaked');
  app.db.iso._createFromImportRow = original;
  assert.equal((await orgs(admin)).length, 0);
  assert.equal((await admin.get(`${ISO}/imports`)).body.imports.length, 0);
  const count = (table) => Number(app.db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  for (const table of ['iso_organizations', 'iso_contacts', 'iso_evidence', 'iso_activity', 'iso_score_snapshots', 'iso_import_batches', 'iso_import_rows']) assert.equal(count(table), 0, table);
  // The same file imports cleanly afterwards: the failed attempt left no idempotency residue.
  const retry = await admin.post(`${ISO}/imports`, csvUpload(SAMPLE_CSV));
  assert.equal(retry.status, 201);
  assert.equal(retry.body.batch.acceptedRows, 3);
});
