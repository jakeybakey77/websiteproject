// Pure, demo-only reporting helpers. This is NOT lender qualification or true
// funnel conversion reporting. We have no ad spend, contact, application, or
// funded-deal observations. Never infer those events from a stage label.
import { OUTCOMES } from './validation-engine.js';
import { sourceBucket } from './attribution.js';

export function buildScreeningInsights(leads, rules) {
  const byStatus = Object.fromEntries(Object.values(OUTCOMES).map((v) => [v, 0]));
  const reasonCounts = new Map();
  const sourceCounts = new Map();
  const byId = new Map(rules.rules.map((r) => [r.id, r]));

  for (const lead of leads) {
    if (lead.demo !== true || !lead.validation) continue;
    const {status, flags} = lead.validation;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const source = sourceBucket(lead.source || 'unrecognized');
    if (!sourceCounts.has(source)) sourceCounts.set(source, {source, inquiries: 0, readyForReview: 0, needsInfo: 0, manualReview: 0});
    const row = sourceCounts.get(source);
    row.inquiries += 1;
    if (status === OUTCOMES.READY_FOR_REVIEW) row.readyForReview += 1;
    if (status === OUTCOMES.NEEDS_INFO) row.needsInfo += 1;
    if (status === OUTCOMES.MANUAL_REVIEW) row.manualReview += 1;

    for (const flag of flags ?? []) {
      const configured = byId.get(flag.ruleId);
      const current = reasonCounts.get(flag.ruleId) ?? {
        code: flag.ruleId, label: configured?.reasonLabel ?? flag.ruleId,
        category: configured?.category ?? 'other', count: 0,
      };
      current.count += 1;
      reasonCounts.set(flag.ruleId, current);
    }
  }
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  return {
    total,
    byStatus,
    flagged: total - byStatus[OUTCOMES.READY_FOR_REVIEW],
    reasons: [...reasonCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    sources: [...sourceCounts.values()].sort((a, b) => b.inquiries - a.inquiries || a.source.localeCompare(b.source)),
  };
}

// Count only explicitly logged in-tab reviewer actions. The original stages of
// seeded example leads are NOT assumed to prove past contact or conversion.
export function buildWorkflowInsights(leads) {
  const demoLeads = leads.filter((lead) => lead.demo === true);
  const reviewed = demoLeads.filter((lead) => Array.isArray(lead.reviewHistory) && lead.reviewHistory.length > 0);
  const changes = reviewed.flatMap((lead) => lead.reviewHistory.filter((event) => event.stageBefore !== event.stageAfter));
  // Use durable first-milestone timestamps as well as retained review history.
  // A later move out of handoff does not erase the fact it happened.
  const everReached = (stage, field) => demoLeads.filter((lead) =>
    !!lead.workflowMilestones?.[field] || !!lead.reviewHistory?.some((event) => event.stageAfter === stage)).length;
  return {
    inquiries: demoLeads.length,
    reviewed: reviewed.length,
    stageChanges: changes.length,
    markedForHandoff: everReached('ready_for_handoff', 'readyForHandoffAt'),
    simulatedHandoffs: everReached('handed_off', 'handedOffAt'),
    // These are *current synthetic snapshot* counts, NOT logged historical conversions.
    currentReadyForHandoff: demoLeads.filter((lead) => lead.stage === 'ready_for_handoff').length,
    currentHandedOff: demoLeads.filter((lead) => lead.stage === 'handed_off').length,
    contacted: null,
    completedApplications: null,
    funded: null,
  };
}
