import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_RULES_VERSION, SCORE_RULES, computeIsoScore, tierForScore } from '../server/iso-scoring.mjs';

const AS_OF = '2026-11-11';
const org = (extra = {}) => ({ domain: 'sample-harbor.example', legalName: 'Sample Harbor LLC', region: 'CT', relationshipType: 'iso', specializations: ['working_capital'], ...extra });
const contact = (extra = {}) => ({ id: 1, status: 'active', name: 'Avery Placeholder', role: 'Partner', email: 'avery@example.com', phone: '(203) 555-0171', ...extra });
let nextId = 1;
const ev = (category, status = 'confirmed', extra = {}) => ({ id: nextId++, category, status, url: 'https://registry.example/r/1', observedOn: '2026-10-01', ...extra });
const score = (input, options = {}) => computeIsoScore(input, { asOf: AS_OF, ...options });
const codes = (result) => result.factors.flatMap((f) => f.reasons.map((r) => r.code));

test('rubric totals 100 across the six documented factors', () => {
  const rules = SCORE_RULES[CURRENT_RULES_VERSION];
  assert.deepEqual(rules.factors.map((f) => f.max), [25, 20, 20, 15, 10, 10]);
  assert.equal(rules.factors.reduce((sum, f) => sum + f.max, 0), 100);
});

test('tier boundaries: A 80-100, B 60-79, C 40-59, D 0-39', () => {
  assert.deepEqual([100, 80, 79, 60, 59, 40, 39, 0].map((s) => tierForScore(s)), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
});

test('fully evidenced record scores 100 / tier A, and every factor explains itself', () => {
  const evidence = ['official_domain', 'business_identity', 'commercial_relevance', 'iso_positioning', 'contact_validity', 'recent_activity', 'region_product_fit'].map((c) => ev(c));
  const result = score({ organization: org(), contacts: [contact()], evidence });
  assert.equal(result.score, 100);
  assert.equal(result.tier, 'A');
  assert.equal(result.rulesVersion, CURRENT_RULES_VERSION);
  for (const factor of result.factors) {
    assert.equal(factor.points, factor.max, factor.id);
    assert.ok(factor.reasons.length > 0);
    assert.equal(factor.reasons.reduce((sum, r) => sum + r.points, 0), factor.points);
  }
});

test('empty record: nothing is invented, every missing input is named with its impact', () => {
  const result = score({ organization: { domain: '', legalName: '', region: '', relationshipType: 'unknown', specializations: [] }, contacts: [], evidence: [] });
  assert.equal(result.score, 0);
  assert.equal(result.tier, 'D');
  for (const code of ['IDENTITY_DOMAIN_UNKNOWN', 'IDENTITY_BUSINESS_MISSING', 'RELEVANCE_COMMERCIAL_MISSING', 'CONTACT_NONE_USABLE', 'ACTIVITY_MISSING', 'FIT_REGION_UNKNOWN', 'TRACEABILITY_NONE']) {
    assert.ok(codes(result).includes(code), code);
  }
  assert.ok(result.factors.flatMap((f) => f.reasons).every((r) => r.points === 0 && r.text.length > 10));
});

test('an assertion earns less than independent confirmation; a refuted item earns nothing', () => {
  const base = { organization: org(), contacts: [contact()] };
  const asserted = score({ ...base, evidence: [ev('business_identity', 'asserted')] });
  const confirmed = score({ ...base, evidence: [ev('business_identity', 'confirmed')] });
  const refuted = score({ ...base, evidence: [ev('business_identity', 'refuted')] });
  const identity = (r) => r.factors.find((f) => f.id === 'identity').points;
  assert.equal(identity(asserted), 4);
  assert.equal(identity(confirmed), 13);
  assert.equal(identity(refuted), 0);
  assert.ok(codes(asserted).includes('IDENTITY_BUSINESS_ASSERTED_ONLY'));
});

test('deterministic: identical inputs, date and version give identical output and digest', () => {
  const input = { organization: org(), contacts: [contact()], evidence: [ev('official_domain'), ev('recent_activity')] };
  const a = score(input);
  const b = score(structuredClone(input));
  assert.deepEqual(a, b);
  const reordered = score({ ...input, evidence: [...input.evidence].reverse() });
  assert.equal(reordered.inputsDigest, a.inputsDigest);
  assert.equal(reordered.score, a.score);
});

test('recency is judged against the explicit assessment date, not the wall clock', () => {
  const input = { organization: org(), contacts: [], evidence: [ev('recent_activity', 'confirmed', { observedOn: '2025-12-01' })] };
  const activity = (r) => r.factors.find((f) => f.id === 'activity');
  assert.equal(activity(computeIsoScore(input, { asOf: '2026-11-11' })).points, 15);
  assert.equal(activity(computeIsoScore(input, { asOf: '2027-06-01' })).points, 7);
  assert.equal(activity(computeIsoScore(input, { asOf: '2027-06-01' })).reasons[0].code, 'ACTIVITY_CONFIRMED_STALE');
  assert.throws(() => computeIsoScore(input, {}), /asOf/);
});

test('inactive contacts do not count toward contact quality', () => {
  const result = score({ organization: org(), contacts: [contact({ status: 'do_not_contact' }), contact({ id: 2, status: 'invalid' })], evidence: [] });
  assert.ok(codes(result).includes('CONTACT_NONE_USABLE'));
  const partial = score({ organization: org(), contacts: [contact({ phone: '', role: '' })], evidence: [] });
  assert.equal(partial.factors.find((f) => f.id === 'contact').points, 9);
  assert.ok(codes(partial).includes('CONTACT_PARTIAL'));
});

test('confirmed red flag caps the tier without rewriting the score; unreviewed flag only adds a note', () => {
  const evidence = ['official_domain', 'business_identity', 'commercial_relevance', 'iso_positioning', 'contact_validity', 'recent_activity', 'region_product_fit'].map((c) => ev(c));
  const clean = score({ organization: org(), contacts: [contact()], evidence });
  const flagged = score({ organization: org(), contacts: [contact()], evidence: [...evidence, ev('red_flag', 'confirmed')] });
  assert.equal(flagged.score, clean.score);
  assert.equal(flagged.tier, 'D');
  assert.ok(flagged.notes.some((n) => n.code === 'RED_FLAG_CONFIRMED_TIER_CAP'));
  const unreviewed = score({ organization: org(), contacts: [contact()], evidence: [...evidence, ev('red_flag', 'asserted')] });
  assert.equal(unreviewed.tier, 'A');
  assert.ok(unreviewed.notes.some((n) => n.code === 'RED_FLAG_UNREVIEWED'));
});

test('court-record context earns zero points and classifies nothing', () => {
  const base = { organization: org(), contacts: [contact()] };
  const without = score({ ...base, evidence: [] });
  const withCourt = score({ ...base, evidence: [ev('court_record_context', 'confirmed', { url: '', observedOn: null })] });
  assert.equal(withCourt.score, without.score);
  assert.equal(withCourt.tier, without.tier);
  assert.ok(withCourt.notes.some((n) => n.code === 'COURT_RECORD_CONTEXT_NOT_SCORED'));
});

test('every result states it is a ranking aid, and unknown rule versions are refused', () => {
  const result = score({ organization: org(), contacts: [], evidence: [] });
  assert.match(result.notes.find((n) => n.code === 'RANKING_AID_ONLY').text, /Not a credit score, underwriting input, funding decision/);
  assert.throws(() => score({ organization: org() }, { rulesVersion: 'iso-priority-1999-v0' }), /Unknown score rules version/);
});
