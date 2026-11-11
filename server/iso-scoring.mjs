// Partner-priority score for ISO / referral-partner records.
//
// What this is:   a deterministic, rules-based ranking aid for deciding which
//                 partner records a human reviewer should look at first.
// What it is not: a credit score, an underwriting input, a predicted close rate,
//                 a funding decision or a "verified vendor" designation. It is
//                 computed only from iso_* records and must never be read by the
//                 merchant inquiry workflow.
//
// Rules are versioned. A snapshot stores the version, the inputs digest, the
// assessment date and every reason, so a historical score can be explained and
// recomputed exactly. Changing weights means adding a new version, not editing one.
import { createHash } from 'node:crypto';

const RULES_V1 = Object.freeze({
  version: 'iso-priority-2026.11-v1',
  tiers: Object.freeze([{ tier: 'A', min: 80 }, { tier: 'B', min: 60 }, { tier: 'C', min: 40 }, { tier: 'D', min: 0 }]),
  recentActivityDays: 365,
  targetSpecializations: Object.freeze(['working_capital', 'equipment_finance', 'line_of_credit', 'sba', 'invoice_factoring', 'revenue_based']),
  redFlagTierCap: 'D',
  factors: Object.freeze([
    { id: 'identity', label: 'Verifiable organization / domain identity', max: 25 },
    { id: 'relevance', label: 'Documented relevance to SMB finance / ISO referrals', max: 20 },
    { id: 'contact', label: 'Contact information completeness / quality', max: 20 },
    { id: 'activity', label: 'Evidenced recent relevant business activity', max: 15 },
    { id: 'fit', label: 'Product / geographic fit', max: 10 },
    { id: 'traceability', label: 'Record completeness and research traceability', max: 10 },
  ].map(Object.freeze)),
});

export const SCORE_RULES = Object.freeze({ [RULES_V1.version]: RULES_V1 });
export const CURRENT_RULES_VERSION = RULES_V1.version;

export function tierForScore(score, rules = RULES_V1) {
  return rules.tiers.find(({ min }) => score >= min).tier;
}

const TIER_ORDER = ['A', 'B', 'C', 'D'];
const lowerTier = (a, b) => (TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b);

function best(evidence, category) {
  const items = evidence.filter((e) => e.category === category);
  if (items.some((e) => e.status === 'confirmed')) return 'confirmed';
  if (items.some((e) => e.status === 'asserted')) return 'asserted';
  return 'none';
}

const daysBetween = (fromDate, toDate) => Math.floor((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);

/**
 * Pure function: same inputs + same asOf date + same rules version => same result.
 * Unknown or missing inputs earn 0 points and say so; nothing is inferred.
 */
export function computeIsoScore({ organization, contacts = [], evidence = [] }, { asOf, rulesVersion = CURRENT_RULES_VERSION } = {}) {
  const rules = SCORE_RULES[rulesVersion];
  if (!rules) throw Object.assign(new Error(`Unknown score rules version: ${rulesVersion}`), { statusCode: 422 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '')) throw new Error('computeIsoScore requires an asOf date (YYYY-MM-DD).');

  const factors = rules.factors.map((f) => ({ id: f.id, label: f.label, max: f.max, points: 0, reasons: [] }));
  const add = (factorId, code, points, text) => {
    const factor = factors.find((f) => f.id === factorId);
    factor.reasons.push({ code, points, text });
    factor.points += points;
  };
  // confirmed / asserted / none -> points, with a reason either way.
  const graded = (factorId, category, codeStem, label, confirmedPts, assertedPts) => {
    const state = best(evidence, category);
    if (state === 'confirmed') add(factorId, `${codeStem}_CONFIRMED`, confirmedPts, `${label}: independently confirmed evidence on file.`);
    else if (state === 'asserted') add(factorId, `${codeStem}_ASSERTED_ONLY`, assertedPts, `${label}: asserted but not independently confirmed (${confirmedPts - assertedPts} of ${confirmedPts} points withheld).`);
    else add(factorId, `${codeStem}_MISSING`, 0, `${label}: no evidence on file (0 of ${confirmedPts} points).`);
  };

  // 1. Identity (25)
  if (organization.domain) graded('identity', 'official_domain', 'IDENTITY_DOMAIN', 'Official site / domain', 12, 4);
  else add('identity', 'IDENTITY_DOMAIN_UNKNOWN', 0, 'No website or domain recorded, so domain identity cannot be evidenced (0 of 12 points).');
  graded('identity', 'business_identity', 'IDENTITY_BUSINESS', 'Business identity', 13, 4);

  // 2. Relevance (20)
  graded('relevance', 'commercial_relevance', 'RELEVANCE_COMMERCIAL', 'Commercial relevance to SMB finance', 10, 4);
  graded('relevance', 'iso_positioning', 'RELEVANCE_ISO_POSITIONING', 'ISO / broker positioning', 10, 4);

  // 3. Contact (20) - completeness of the best usable contact, plus validity evidence.
  const usable = contacts.filter((c) => c.status === 'active');
  if (usable.length === 0) {
    add('contact', 'CONTACT_NONE_USABLE', 0, 'No active contact on the record (0 of 14 completeness points).');
  } else {
    const points = (c) => (c.name ? 4 : 0) + (c.email ? 5 : 0) + (c.phone ? 3 : 0) + (c.role ? 2 : 0);
    const top = [...usable].sort((a, b) => points(b) - points(a) || String(a.id).localeCompare(String(b.id)))[0];
    const missing = [!top.name && 'name', !top.email && 'email', !top.phone && 'phone', !top.role && 'role'].filter(Boolean);
    add('contact', missing.length ? 'CONTACT_PARTIAL' : 'CONTACT_COMPLETE', points(top),
      missing.length ? `Best active contact is missing: ${missing.join(', ')} (${points(top)} of 14 points).` : 'Best active contact has name, role, email and phone (14 of 14 points).');
  }
  graded('contact', 'contact_validity', 'CONTACT_VALIDITY', 'Contact validity', 6, 2);

  // 4. Recent activity (15)
  const activity = evidence.filter((e) => e.category === 'recent_activity');
  const confirmedDates = activity.filter((e) => e.status === 'confirmed' && e.observedOn).map((e) => e.observedOn).sort();
  if (confirmedDates.length > 0) {
    const age = daysBetween(confirmedDates.at(-1), asOf);
    if (age >= 0 && age <= rules.recentActivityDays) add('activity', 'ACTIVITY_RECENT_CONFIRMED', 15, `Confirmed relevant activity observed ${confirmedDates.at(-1)}, within ${rules.recentActivityDays} days of assessment.`);
    else add('activity', 'ACTIVITY_CONFIRMED_STALE', 7, `Confirmed activity observed ${confirmedDates.at(-1)} is outside the ${rules.recentActivityDays}-day window (7 of 15 points).`);
  } else if (activity.some((e) => e.status === 'confirmed')) {
    add('activity', 'ACTIVITY_CONFIRMED_UNDATED', 7, 'Confirmed activity has no observed date, so recency is unknown (7 of 15 points).');
  } else if (activity.some((e) => e.status === 'asserted')) {
    add('activity', 'ACTIVITY_ASSERTED_ONLY', 4, 'Recent activity is asserted but not independently confirmed (4 of 15 points).');
  } else {
    add('activity', 'ACTIVITY_MISSING', 0, 'No evidence of recent relevant business activity (0 of 15 points).');
  }

  // 5. Fit (10)
  if (organization.region) add('fit', 'FIT_REGION_STATED', 2, `Operating region recorded (${organization.region}).`);
  else add('fit', 'FIT_REGION_UNKNOWN', 0, 'Operating region not recorded (0 of 2 points).');
  const overlap = (organization.specializations ?? []).filter((s) => rules.targetSpecializations.includes(s));
  if (overlap.length > 0) add('fit', 'FIT_PRODUCT_OVERLAP', 3, `Stated specializations overlap target products: ${overlap.join(', ')}.`);
  else add('fit', 'FIT_PRODUCT_UNKNOWN', 0, 'No stated specialization overlaps target products (0 of 3 points).');
  graded('fit', 'region_product_fit', 'FIT_EVIDENCE', 'Region / product focus', 5, 2);

  // 6. Completeness and traceability (10)
  const fields = [organization.legalName, organization.domain, organization.region, organization.relationshipType && organization.relationshipType !== 'unknown'];
  const filled = fields.filter(Boolean).length;
  add('traceability', filled === 4 ? 'RECORD_FIELDS_COMPLETE' : 'RECORD_FIELDS_INCOMPLETE', Math.round((filled / 4) * 6),
    `${filled} of 4 core record fields present (legal name, domain, region, relationship type).`);
  const traceable = evidence.filter((e) => e.url && e.observedOn && e.status !== 'refuted').length;
  const tracePts = traceable >= 3 ? 4 : traceable >= 1 ? 2 : 0;
  add('traceability', traceable >= 3 ? 'TRACEABILITY_STRONG' : traceable >= 1 ? 'TRACEABILITY_PARTIAL' : 'TRACEABILITY_NONE', tracePts,
    `${traceable} evidence item(s) carry both a source URL and an observed date (${tracePts} of 4 points).`);

  for (const factor of factors) factor.points = Math.min(factor.max, factor.points);
  const score = factors.reduce((sum, f) => sum + f.points, 0);
  let tier = tierForScore(score, rules);

  // Notes that explain the result but are not weighted factors.
  const notes = [];
  if (evidence.some((e) => e.category === 'red_flag' && e.status === 'confirmed')) {
    const capped = lowerTier(tier, rules.redFlagTierCap);
    notes.push({ code: 'RED_FLAG_CONFIRMED_TIER_CAP', text: `A confirmed red flag caps the tier at ${rules.redFlagTierCap}${capped !== tier ? ` (score alone would be tier ${tier})` : ''}. The score is unchanged.` });
    tier = capped;
  } else if (evidence.some((e) => e.category === 'red_flag' && e.status === 'asserted')) {
    notes.push({ code: 'RED_FLAG_UNREVIEWED', text: 'An unreviewed red flag is on file. It does not change the score until a reviewer confirms or refutes it.' });
  }
  if (evidence.some((e) => e.category === 'court_record_context')) {
    notes.push({ code: 'COURT_RECORD_CONTEXT_NOT_SCORED', text: 'Court-record context is on file. It is due-diligence context only: it earns no points and does not classify the organization as a funder or non-funder.' });
  }
  notes.push({ code: 'RANKING_AID_ONLY', text: 'Partner-priority ranking aid. Not a credit score, underwriting input, funding decision or verified-vendor designation.' });

  const inputsDigest = createHash('sha256').update(JSON.stringify({
    o: [organization.domain ?? '', organization.legalName ?? '', organization.region ?? '', organization.relationshipType ?? '', [...(organization.specializations ?? [])].sort()],
    c: contacts.map((c) => [c.id, c.status, Boolean(c.name), Boolean(c.email), Boolean(c.phone), Boolean(c.role)]).sort(),
    e: evidence.map((e) => [e.id, e.category, e.status, e.observedOn ?? '', Boolean(e.url)]).sort(),
  })).digest('hex');

  return { rulesVersion: rules.version, asOf, score, tier, factors, notes, inputsDigest };
}
