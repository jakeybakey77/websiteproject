// ISO / referral-partner pipeline configuration. Shared by the server (authoritative)
// and the browser (labels and option lists only).
//
// This is a partner-relationship pipeline. Nothing here is a merchant eligibility,
// underwriting, credit or funding rule, and it must never be used as one.
const opt = (value, label) => Object.freeze({ value, label });

// Relationship stage: where the partner relationship stands.
export const ISO_STAGES = Object.freeze([
  opt('applied', 'Applied (public demo form)'),
  opt('imported', 'Imported'),
  opt('research_needed', 'Research needed'),
  opt('under_review', 'Under review'),
  opt('verified', 'Verified'),
  opt('outreach_ready', 'Outreach ready'),
  opt('contacted', 'Contacted (manually recorded)'),
  opt('engaged', 'Engaged'),
  opt('active_partner', 'Active partner'),
  opt('disqualified', 'Disqualified'),
  opt('archived', 'Archived'),
]);

export const ISO_TRANSITIONS = Object.freeze({
  applied: ['research_needed', 'disqualified', 'archived'],
  imported: ['research_needed', 'disqualified', 'archived'],
  research_needed: ['under_review', 'disqualified', 'archived'],
  under_review: ['research_needed', 'verified', 'disqualified', 'archived'],
  verified: ['outreach_ready', 'under_review', 'disqualified', 'archived'],
  outreach_ready: ['contacted', 'verified', 'disqualified', 'archived'],
  contacted: ['engaged', 'outreach_ready', 'disqualified', 'archived'],
  engaged: ['active_partner', 'contacted', 'disqualified', 'archived'],
  active_partner: ['engaged', 'disqualified', 'archived'],
  disqualified: ['research_needed', 'archived'],
  archived: ['research_needed'],
});

// Stages that may only be held while business verification is "verified".
export const STAGES_REQUIRING_VERIFICATION = Object.freeze(['verified', 'outreach_ready', 'contacted', 'engaged', 'active_partner']);
// Stages whose entry must carry a written note.
export const STAGES_REQUIRING_NOTE = Object.freeze(['disqualified', 'archived']);
export const REVIEW_BACKLOG_STAGES = Object.freeze(['applied', 'imported', 'research_needed', 'under_review']);

// Business-verification state: a separate question from the relationship stage.
export const VERIFICATION_STATUSES = Object.freeze([
  opt('unverified', 'Unverified'),
  opt('in_review', 'Verification in review'),
  opt('verified', 'Verified by reviewer'),
  opt('failed', 'Verification failed'),
]);

export const DISQUALIFY_REASONS = Object.freeze([
  opt('not_iso_or_broker', 'Not an ISO, broker or referral partner'),
  opt('identity_unverifiable', 'Business identity could not be verified'),
  opt('confirmed_red_flag', 'Confirmed red flag in evidence'),
  opt('out_of_scope', 'Outside product or regional focus'),
  opt('duplicate_record', 'Duplicate of another record'),
  opt('not_synthetic', 'Record is not synthetic demo data'),
  opt('other', 'Other (explain in note)'),
]);

// Evidence checklist. Each item is a category an analyst can attach evidence to.
export const EVIDENCE_CATEGORIES = Object.freeze([
  opt('official_domain', 'Official site / domain'),
  opt('business_identity', 'Business identity'),
  opt('commercial_relevance', 'Commercial relevance to SMB finance'),
  opt('iso_positioning', 'ISO / broker vs direct-funder positioning'),
  opt('contact_validity', 'Contact validity'),
  opt('region_product_fit', 'Region / product focus'),
  opt('recent_activity', 'Recent relevant business activity'),
  opt('red_flag', 'Red flag'),
  opt('court_record_context', 'Court-record context (never scored, never a classification)'),
]);

export const EVIDENCE_SOURCE_TYPES = Object.freeze([
  opt('website', 'Organization website'),
  opt('registry', 'Business registry'),
  opt('directory', 'Industry directory'),
  opt('court_record', 'Court record'),
  opt('self_reported', 'Self-reported by applicant'),
  opt('csv_import', 'Stated in imported file'),
  opt('analyst_note', 'Analyst observation'),
  opt('other', 'Other'),
]);

// "asserted" = someone claims it. "confirmed" = a reviewer independently confirmed it.
export const EVIDENCE_STATUSES = Object.freeze([
  opt('asserted', 'Asserted (not independently confirmed)'),
  opt('confirmed', 'Independently confirmed'),
  opt('refuted', 'Refuted'),
]);

export const RELATIONSHIP_TYPES = Object.freeze([
  opt('iso', 'Independent sales organization (ISO)'),
  opt('broker', 'Commercial finance broker'),
  opt('referral_partner', 'Referral partner (accountant, consultant, vendor)'),
  opt('unknown', 'Not stated'),
]);

export const ISO_SPECIALIZATIONS = Object.freeze([
  opt('working_capital', 'Working capital'),
  opt('equipment_finance', 'Equipment finance'),
  opt('line_of_credit', 'Lines of credit'),
  opt('sba', 'SBA lending'),
  opt('invoice_factoring', 'Invoice factoring'),
  opt('commercial_real_estate', 'Commercial real estate'),
  opt('revenue_based', 'Revenue-based financing'),
]);

export const REFERRAL_VOLUME_BANDS = Object.freeze([
  opt('none_yet', 'Not referring yet'),
  opt('1_5', '1–5 referrals a month'),
  opt('6_20', '6–20 referrals a month'),
  opt('21_plus', 'More than 20 a month'),
]);

export const YEARS_ACTIVE_BANDS = Object.freeze([
  opt('lt_1y', 'Less than 1 year'),
  opt('1_3y', '1–3 years'),
  opt('3_10y', '3–10 years'),
  opt('gt_10y', 'More than 10 years'),
]);

export const CONTACT_STATUSES = Object.freeze([
  opt('active', 'Active'),
  opt('invalid', 'Invalid'),
  opt('do_not_contact', 'Do not contact'),
]);

export const ACQUISITION_SOURCES = Object.freeze([
  opt('public_application', 'Public partner application (demo)'),
  opt('csv_import', 'CSV import'),
]);

export const ISO_TIERS = Object.freeze(['A', 'B', 'C', 'D']);

export const values = (options) => options.map((o) => o.value);
export const isoLabel = (options, value) => options.find((o) => o.value === value)?.label ?? (value || 'Not set');
export const allowedIsoStages = (stage) => ISO_TRANSITIONS[stage] ?? [];
