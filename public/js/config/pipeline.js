// Inquiry stages and campaign sources shown in the internal dashboard.
// Stages describe where an inquiry is in OUR process. None of them is a financing decision.

export const STAGES = [
  { value: 'new', label: 'New' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'in_review', label: 'In review' },
  { value: 'ready_for_handoff', label: 'Ready for handoff' },
  { value: 'handed_off', label: 'Handed off (simulated)' },
  { value: 'closed', label: 'Closed' },
];

// Allowed review transitions. A note-only update (same stage) is always permitted.
// No automatic approval or funding decisions are represented here.
export const ALLOWED_TRANSITIONS = Object.freeze({
  new: Object.freeze(['needs_info', 'in_review', 'closed']),
  needs_info: Object.freeze(['in_review', 'closed']),
  in_review: Object.freeze(['needs_info', 'ready_for_handoff', 'closed']),
  ready_for_handoff: Object.freeze(['in_review', 'needs_info', 'handed_off', 'closed']),
  handed_off: Object.freeze(['closed']),
  closed: Object.freeze([]),
});

// Values match the utm_source parameter on inbound links.
export const SOURCES = [
  { value: 'google_search', label: 'Google Search' },
  { value: 'meta_ads', label: 'Meta ads' },
  { value: 'organic', label: 'Organic search' },
  { value: 'referral', label: 'Referral partner' },
  { value: 'email', label: 'Email' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other / unrecognized' },
];
