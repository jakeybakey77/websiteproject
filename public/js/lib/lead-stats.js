// Counting and filtering for the dashboard. Pure functions.
import { sourceBucket } from './attribution.js';

// countBy(leads, 'stage') -> { new: 4, in_review: 3, ... }
export function countBy(leads, key) {
  const counts = {};
  for (const lead of leads) counts[lead[key]] = (counts[lead[key]] ?? 0) + 1;
  return counts;
}

export function filterLeads(leads, { query = '', stage = '', source = '', screening = '', reason = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return leads.filter(
    (lead) =>
      (!stage || lead.stage === stage) &&
      (!source || sourceBucket(lead.source) === source) &&
      (!screening || lead.validation?.status === screening) &&
      (!reason || lead.validation?.flags?.some((flag) => flag.ruleId === reason)) &&
      (!needle ||
        lead.id.toLowerCase().includes(needle) ||
        lead.businessName.toLowerCase().includes(needle)),
  );
}
